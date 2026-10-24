import { envsafe, str, bool } from "envsafe";

export const env = envsafe({
  AWS_ACCESS_KEY_ID: str(),
  AWS_SECRET_ACCESS_KEY: str(),
  AWS_S3_BUCKET: str(),
  AWS_S3_REGION: str(),
  BACKUP_DATABASE_URL: str({
    desc: 'The connection string of the database to backup.'
  }),
  BACKUP_CRON_SCHEDULE: str({
    desc: 'The cron schedule to run the backup on.',
    default: '0 5 * * *',
    allowEmpty: true
  }),
  AWS_S3_ENDPOINT: str({
    desc: 'The S3 custom endpoint you want to use.',
    default: '',
    allowEmpty: true,
  }),
  AWS_S3_FORCE_PATH_STYLE: bool({
    desc: 'Use path style for the endpoint instead of the default subdomain style, useful for MinIO',
    default: false,
    allowEmpty: true
  }),
  RUN_ON_STARTUP: bool({
    desc: 'Run a backup on startup of this application',
    default: false,
    allowEmpty: true,
  }),
  BACKUP_FILE_PREFIX: str({
    desc: 'Prefix to the file name',
    default: 'backup',
  }),
  BUCKET_SUBFOLDER: str({
    desc: 'A subfolder to place the backup files in',
    default: '',
    allowEmpty: true
  }),
  HOURLY_SUBFOLDER: str({
    desc: 'With DAILY_UTC_HOUR, the subfolder for every run outside that hour, so hourly dumps can expire sooner than the daily one (an R2 lifecycle rule per prefix). Unset keeps one subfolder for every run.',
    default: '',
    allowEmpty: true
  }),
  DAILY_UTC_HOUR: str({
    desc: 'The UTC hour (0-23) whose run is the daily backup and goes to BUCKET_SUBFOLDER. Only read when HOURLY_SUBFOLDER is set.',
    default: '',
    allowEmpty: true
  }),
  SINGLE_SHOT_MODE: bool({
    desc: 'Run a single backup on start and exit when completed',
    default: false,
    allowEmpty: true,
  }),
  // This is both time consuming and resource intensive so we leave it disabled by default
  SUPPORT_OBJECT_LOCK: bool({
    desc: 'Enables support for buckets with object lock by providing an MD5 hash with the backup file',
    default: false
  }),
  DISABLE_S3_CHECKSUM_VALIDATION: bool({
    desc: 'Stop the AWS SDK sending its default flexible checksums. Required for Cloudflare R2 and most other S3-compatible stores, which reject the x-amz-checksum-* headers the SDK has sent by default since v3.729.',
    default: false,
    allowEmpty: true,
  }),
  BACKUP_AGE_RECIPIENT: str({
    desc: 'The age public key (age1...) every dump is encrypted to before upload. Required: a dump never leaves the container unencrypted. The private key lives outside the platform that runs this service.',
  }),
  BACKUP_OPTIONS: str({
    desc: 'Any valid pg_dump option.',
    default: '',
    allowEmpty: true,
  }),
  SENTRY_DSN: str({
    desc: 'A Sentry DSN. With SENTRY_CRON_MONITOR_SLUG, each run checks in to a Sentry cron monitor (in_progress, then ok, or error). Unset sends nothing.',
    default: '',
    allowEmpty: true,
  }),
  SENTRY_CRON_MONITOR_SLUG: str({
    desc: 'The Sentry cron monitor to check in to, e.g. postgres-backups. Created on the first check-in if it does not exist.',
    default: '',
    allowEmpty: true,
  }),
  SENTRY_CRON_SCHEDULE: str({
    desc: 'The crontab (UTC) the monitor expects check-ins on. Match the Railway cron schedule.',
    default: '0 * * * *',
  }),
  SENTRY_ENVIRONMENT: str({
    desc: 'The environment the check-ins are filed under.',
    default: 'production',
  }),
})
