import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * File based audit log.
 *
 * Logs are NOT stored in MongoDB any more: every important event is appended as
 * one JSON line to `logs/activity-YYYY-MM-DD.jsonl` on the server disk. That
 * keeps the database small and fast, survives a database reset, and makes the
 * log easy to ship to any external tool (`tail -f`, logrotate, Grafana...).
 *
 * Two rules keep the file useful instead of noisy:
 *   1. Only events on the importance list below are written.
 *   2. Every failed / rejected attempt is always written, whatever it was.
 * The caller IP address is recorded on every single line.
 */

export const LOG_DIR =
  process.env.LOG_DIR || path.join(process.cwd(), "logs");

/** Log files older than this are deleted automatically. */
export const LOG_RETENTION_DAYS = Math.min(
  365,
  Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 30)
);

/** Hard cap so a runaway loop can never fill the disk (per file). */
const MAX_FILE_BYTES = Math.max(
  1_000_000,
  Number(process.env.LOG_MAX_FILE_BYTES) || 8_000_000
);

/** Set LOG_ALL=true to also record the low-value routine events. */
const LOG_ALL = String(process.env.LOG_ALL || "").toLowerCase() === "true";

// ---------------------------------------------------------------------------
// What counts as "important"
// ---------------------------------------------------------------------------

/**
 * critical  = security / money / destructive actions (always kept, shown in red)
 * important = meaningful business events an owner wants to review
 * anything else = routine noise -> not written at all (unless it failed)
 */
export const ACTION_LEVELS = {
  // --- security -------------------------------------------------------
  "admin.login": "critical",
  "admin.login.failed": "critical",
  "admin.login.locked": "critical",
  "admin.recover": "critical",
  "admin.recover.failed": "critical",
  "admin.create": "critical",
  "admin.update": "critical",
  "admin.delete": "critical",
  "user.login.failed": "critical",
  "user.password.reset": "critical",
  "otp.admin-reset.request": "critical",
  "upload.rejected": "critical",
  "log.purge": "critical",
  // --- money ----------------------------------------------------------
  "payment.paid": "critical",
  "payment.verify.failed": "critical",
  "payment.request.failed": "critical",
  "payment.cancelled": "important",
  // --- shop management -------------------------------------------------
  "order.create": "important",
  "order.status": "important",
  "product.create": "important",
  "product.update": "important",
  "product.delete": "critical",
  "customer.create": "important",
  "customer.update": "important",
  "customer.delete": "critical",
  "settings.update": "important",
  "notify.send": "important",
  "review.delete": "important",
  "user.register": "important",
};

export const LOG_LEVELS = ["critical", "important"];

/**
 * Decides whether an event is worth a log line.
 * Returns the level, or `null` when the event should be dropped.
 */
export function levelFor(action, success = true) {
  if (success === false) return "critical"; // every failure is interesting
  const level = ACTION_LEVELS[action];
  if (level) return level;
  return LOG_ALL ? "routine" : null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

let dirReady = false;
function ensureDir() {
  if (dirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirReady = true;
  } catch (err) {
    console.error("log dir failed:", err?.message);
  }
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function fileFor(day) {
  return path.join(LOG_DIR, `activity-${day}.jsonl`);
}

/** Appends one entry. Never throws, never blocks the response. */
export function appendLog(entry) {
  try {
    ensureDir();
    const file = fileFor(dayKey());
    // Skip the write if today's file already hit the size cap.
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) return;
    } catch {
      /* file does not exist yet - fine */
    }
    fs.appendFile(file, JSON.stringify(entry) + "\n", (err) => {
      if (err) console.error("log write failed:", err.message);
    });
  } catch (err) {
    console.error("log write failed:", err?.message);
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function logFiles() {
  try {
    const names = await fsp.readdir(LOG_DIR);
    return names
      .filter((n) => /^activity-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
      .sort()
      .reverse(); // newest day first
  } catch {
    return [];
  }
}

/**
 * Reads the newest entries, newest first, applying the filters.
 * Only as many files as needed are opened.
 */
export async function readLogs({
  search = "",
  actorType = "",
  level = "",
  limit = 200,
} = {}) {
  const needle = String(search || "").trim().toLowerCase();
  const files = await logFiles();
  const out = [];
  let scanned = 0;
  const counts = { critical: 0, important: 0, routine: 0, failed: 0 };

  for (const name of files) {
    let raw = "";
    try {
      raw = await fsp.readFile(path.join(LOG_DIR, name), "utf8");
    } catch {
      continue;
    }

    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue; // a half-written line, ignore it
      }
      scanned += 1;
      if (counts[row.level] !== undefined) counts[row.level] += 1;
      if (row.success === false) counts.failed += 1;

      if (level && row.level !== level) continue;
      if (actorType && row.actorType !== actorType) continue;
      if (needle) {
        const hay = [
          row.action,
          row.actorLabel,
          row.target,
          row.ip,
          row.path,
          row.meta,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      if (out.length < limit) out.push(row);
    }

    // Stop early once we have a full page and at least one whole day scanned.
    if (out.length >= limit) break;
  }

  return { logs: out, scanned, counts, files: files.length };
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Deletes log files. `olderThanDays = 0` wipes every file. */
export async function purgeLogs(olderThanDays = 0) {
  const files = await logFiles();
  const cutoff = olderThanDays > 0 ? dayKey(new Date(Date.now() - olderThanDays * 86400000)) : null;
  let deleted = 0;
  for (const name of files) {
    const day = name.slice("activity-".length, "activity-".length + 10);
    if (cutoff && day >= cutoff) continue;
    try {
      await fsp.unlink(path.join(LOG_DIR, name));
      deleted += 1;
    } catch {
      /* already gone */
    }
  }
  return deleted;
}

/** Removes files past the retention window. Runs on boot and once a day. */
export function startLogRetention() {
  const run = () => {
    purgeLogs(LOG_RETENTION_DAYS).catch((err) =>
      console.error("log retention failed:", err?.message)
    );
  };
  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}
