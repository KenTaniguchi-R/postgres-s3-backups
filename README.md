# Postgres S3 backups

A simple NodeJS application to backup your PostgreSQL database to S3 via a cron.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/I4zGrH)

## Configuration

- `AWS_ACCESS_KEY_ID` - AWS access key ID.

- `AWS_SECRET_ACCESS_KEY` - AWS secret access key, sometimes also called an application key.

- `AWS_S3_BUCKET` - The name of the bucket that the access key ID and secret access key are authorized to access.

- `AWS_S3_REGION` - The name of the region your bucket is located in, set to `auto` if unknown.

- `BACKUP_DATABASE_URL` - The connection string of the database to backup.

- `BACKUP_CRON_SCHEDULE` - The cron schedule to run the backup on. Example: `0 5 * * *`

- `AWS_S3_ENDPOINT` - The S3 custom endpoint you want to use. Applicable for 3-rd party S3 services such as Cloudflare R2 or Backblaze R2.

- `AWS_S3_FORCE_PATH_STYLE` - Use path style for the endpoint instead of the default subdomain style, useful for MinIO. Default `false`

- `RUN_ON_STARTUP` - Run a backup on startup of this application then proceed with making backups on the set schedule.

- `BACKUP_FILE_PREFIX` - Add a prefix to the file name.

- `BUCKET_SUBFOLDER` - Define a subfolder to place the backup files in.

- `SINGLE_SHOT_MODE` - Run a single backup on start and exit when completed. Useful with the platform's native CRON schedular.

- `SUPPORT_OBJECT_LOCK` - Enables support for buckets with object lock by providing an MD5 hash with the backup file.

- `BACKUP_OPTIONS` - Add any valid pg_dump option, supported pg_dump options can be found [here](https://www.postgresql.org/docs/current/app-pgdump.html). Example: `--exclude-table=pattern`

- `NODE_VERSION` - Specify a custom Node.js version to override the default version set in the Dockerfile.

- `PG_VERSION` - Specify a custom PostgreSQL version to override the default version set in the Dockerfile.

## Notes for Postgres 17

If backing up a Postgres 17 database imported from Postgres 16, set `PG_VERSION=17` and `NODE_VERSION=22`.

---

## Fork notes (Fidera)

Forked for `fidera.jp`'s offsite Postgres dump. Three changes from upstream, each
for a reason that stopped a deploy:

- **`DISABLE_S3_CHECKSUM_VALIDATION`** (new variable, default `false`). Since
  `@aws-sdk/client-s3` v3.729 the SDK computes a CRC32 for every upload and sends
  `x-amz-checksum-crc32`. Cloudflare R2 does not implement flexible checksums and
  rejects the request, so the dump is taken and then fails to land. Setting this
  puts the client into `requestChecksumCalculation: "WHEN_REQUIRED"` /
  `responseChecksumValidation: "WHEN_REQUIRED"`. **Set it to `true` for R2.**
  Upstream has no flag for this, which is why this fork exists.
- **`PG_VERSION` now defaults to `17`.** `pg_dump` refuses to dump a server newer
  than itself, and the Fidera database is PostgreSQL 17.10 (it runs the
  `groonga/pgroonga` image, not Railway's Postgres). Upstream's default of 16
  fails on the first run with a version error.
- **`NODE_VERSION` now defaults to `22`.** Upstream pins 20.11.1; the current
  AWS SDK wants a supported Node line.

Both versions are `ARG`s, so Railway build variables still override them. With
these defaults you no longer have to remember to set them.

### Railway service variables

| | |
|---|---|
| `BACKUP_DATABASE_URL` | the private-network URL, not the public proxy |
| `AWS_S3_BUCKET` | the same R2 bucket the app uses |
| `AWS_S3_ENDPOINT` | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `AWS_S3_REGION` | `auto` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | R2 API token, Object Read & Write |
| `DISABLE_S3_CHECKSUM_VALIDATION` | `true` |
| `BUCKET_SUBFOLDER` | `postgres-backups` |
| `SINGLE_SHOT_MODE` | `true` — Railway's own `cronSchedule` does the scheduling, so the container runs for a minute a day rather than a day a day |
| `RUN_ON_STARTUP` | `true` for the first deploy, so you find out immediately whether it works |

**A backup schedule nobody has seen succeed is not a backup.** Confirm an object
appears under `postgres-backups/` after the first run, and restore one into a
local `groonga/pgroonga` container before trusting it — the dump carries
`USING pgroonga` index definitions, so a stock Postgres image cannot restore it.
