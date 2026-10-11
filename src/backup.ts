import { exec, execSync } from "child_process";
import { S3Client, S3ClientConfig, PutObjectCommandInput } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync } from "fs";
import { filesize } from "filesize";
import path from "path";
import os from "os";

import { env } from "./env.js";
import { createMD5 } from "./util.js";

/**
 * Where this run's dump goes. Every run lands in BUCKET_SUBFOLDER unless
 * HOURLY_SUBFOLDER and DAILY_UTC_HOUR are both set: then only the run in the
 * daily hour does, and the rest go to HOURLY_SUBFOLDER. Two prefixes let one
 * cron service keep a short-lived hourly series beside a long-lived daily one,
 * each with its own lifecycle rule.
 */
export const subfolderFor = (now: Date): string => {
  const daily = env.DAILY_UTC_HOUR.trim();
  if (!env.HOURLY_SUBFOLDER || daily === "") return env.BUCKET_SUBFOLDER;
  const hour = Number(daily);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`DAILY_UTC_HOUR must be an hour from 0 to 23, got "${daily}"`);
  }
  return now.getUTCHours() === hour ? env.BUCKET_SUBFOLDER : env.HOURLY_SUBFOLDER;
}

const uploadToS3 = async ({ name, path }: { name: string, path: string }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE
  }

  // Since v3.729 the SDK computes a CRC32 checksum for every upload and sends it
  // as x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm. Cloudflare R2 does
  // not implement flexible checksums and rejects the request, so the upload
  // fails on a store that is otherwise fine. WHEN_REQUIRED keeps checksums for
  // the operations that genuinely mandate them and drops them everywhere else.
  if (env.DISABLE_S3_CHECKSUM_VALIDATION) {
    console.log("Flexible checksums disabled (S3-compatible endpoint).");

    clientOptions.requestChecksumCalculation = "WHEN_REQUIRED";
    clientOptions.responseChecksumValidation = "WHEN_REQUIRED";
  }

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);

    clientOptions.endpoint = env.AWS_S3_ENDPOINT;
  }

  const subfolder = subfolderFor(new Date());
  if (subfolder) {
    name = subfolder + "/" + name;
  }

  let params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: name,
    Body: createReadStream(path),
  }

  if (env.SUPPORT_OBJECT_LOCK) {
    console.log("MD5 hashing file...");

    const md5Hash = await createMD5(path);

    console.log("Done hashing file");

    params.ContentMD5 = Buffer.from(md5Hash, 'hex').toString('base64');
  }

  const client = new S3Client(clientOptions);

  await new Upload({
    client,
    params: params
  }).done();

  console.log("Backup uploaded to S3...");
}

const dumpToFile = async (filePath: string) => {
  console.log("Dumping DB to file...");

  await new Promise((resolve, reject) => {
    exec(`pg_dump --dbname=${env.BACKUP_DATABASE_URL} --format=tar ${env.BACKUP_OPTIONS} | gzip > ${filePath}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error, stderr: stderr.trimEnd() });
        return;
      }

      // check if archive is valid and contains data
      const isValidArchive = (execSync(`gzip -cd ${filePath} | head -c1`).length == 1) ? true : false;
      if (isValidArchive == false) {
        reject({ error: "Backup archive file is invalid or empty; check for errors above" });
        return;
      }

      // not all text in stderr will be a critical error, print the error / warning
      if (stderr != "") {
        console.log({ stderr: stderr.trimEnd() });
      }

      console.log("Backup archive file is valid");
      console.log("Backup filesize:", filesize(statSync(filePath).size));

      // if stderr contains text, let the user know that it was potently just a warning message
      if (stderr != "") {
        console.log(`Potential warnings detected; Please ensure the backup file "${path.basename(filePath)}" contains all needed data`);
      }

      resolve(undefined);
    });
  });

  console.log("DB dumped to file...");
}

const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: err });
      return;
    });
    resolve(undefined);
  });
}

export const backup = async () => {
  console.log("Initiating DB backup...");

  const date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, '-');
  const filename = `${env.BACKUP_FILE_PREFIX}-${timestamp}.tar.gz`;
  const filepath = path.join(os.tmpdir(), filename);

  await dumpToFile(filepath);
  await uploadToS3({ name: filename, path: filepath });
  await deleteFile(filepath);

  console.log("DB backup complete...");
}
