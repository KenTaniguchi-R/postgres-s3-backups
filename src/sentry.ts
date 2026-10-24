import { env } from "./env.js";

/**
 * Sentry Cron Monitor check-ins over plain HTTP, so there is no SDK to carry.
 * https://docs.sentry.io/product/crons/getting-started/http/
 *
 * A no-op unless SENTRY_DSN and SENTRY_CRON_MONITOR_SLUG are both set. Every
 * failure here is swallowed: a monitoring outage must not fail a backup that
 * landed. Passing monitor_config upserts the monitor on its first check-in.
 */

type Status = "in_progress" | "ok" | "error";

const enabled = (): boolean => env.SENTRY_DSN !== "" && env.SENTRY_CRON_MONITOR_SLUG !== "";

// https://<public key>@<host>/<project id>, optionally with a path prefix.
const endpoint = (): { url: string; key: string } | null => {
  try {
    const dsn = new URL(env.SENTRY_DSN);
    const projectId = dsn.pathname.split("/").filter(Boolean).pop();
    if (!dsn.username || !projectId) return null;
    const slug = encodeURIComponent(env.SENTRY_CRON_MONITOR_SLUG);
    return {
      url: `${dsn.protocol}//${dsn.host}/api/${projectId}/cron/${slug}/${dsn.username}/`,
      key: dsn.username,
    };
  } catch {
    return null;
  }
};

export const checkIn = async (status: Status, checkInId?: string, durationSeconds?: number): Promise<string | undefined> => {
  if (!enabled()) return undefined;
  const target = endpoint();
  if (!target) {
    console.warn("SENTRY_DSN is not a valid DSN; skipping the cron check-in.");
    return undefined;
  }

  const body: Record<string, unknown> = {
    status,
    environment: env.SENTRY_ENVIRONMENT,
    // Hourly, UTC (Railway's cron). 15 minutes of margin; a dump takes seconds.
    monitor_config: {
      schedule: { type: "crontab", value: env.SENTRY_CRON_SCHEDULE },
      checkin_margin: 15,
      max_runtime: 20,
      timezone: "UTC",
    },
  };
  if (checkInId) body.check_in_id = checkInId;
  if (durationSeconds !== undefined) body.duration = durationSeconds;

  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Sentry check-in (${status}) answered HTTP ${response.status}.`);
      return undefined;
    }
    const json = (await response.json().catch(() => null)) as { id?: string } | null;
    return json?.id ?? checkInId;
  } catch (error) {
    console.warn(`Sentry check-in (${status}) failed:`, error instanceof Error ? error.message : error);
    return undefined;
  }
};

/** Wraps a run: in_progress before, ok after, error (and a rethrow) when it throws. */
export const monitored = async <T>(run: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  const id = await checkIn("in_progress");
  try {
    const result = await run();
    await checkIn("ok", id, (Date.now() - started) / 1000);
    return result;
  } catch (error) {
    await checkIn("error", id, (Date.now() - started) / 1000);
    throw error;
  }
};
