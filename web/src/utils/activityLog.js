import { appendLog, levelFor } from "./fileLog.js";
import { str } from "./validate.js";

// Resolve the real client IP. `trust proxy` is configured in index.js, so
// req.ip already respects X-Forwarded-For when it is safe to do so.
export function clientIp(req) {
  const ip =
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "";
  // Normalise IPv4-mapped IPv6 addresses (::ffff:1.2.3.4 -> 1.2.3.4)
  return String(ip).replace(/^::ffff:/, "").slice(0, 64);
}

export function actorOf(req) {
  if (req.adminUser) {
    return {
      actorType: "admin",
      actorId: String(req.adminUser._id),
      actorLabel: `${req.adminUser.name} <${req.adminUser.email}>`,
    };
  }
  if (req.admin) {
    return { actorType: "admin", actorId: "env", actorLabel: "\u0645\u062f\u06cc\u0631 (\u0631\u0645\u0632 \u0645\u062d\u06cc\u0637\u06cc)" };
  }
  if (req.user) {
    return {
      actorType: "user",
      actorId: String(req.user._id),
      actorLabel: `${req.user.name} <${req.user.email}>`,
    };
  }
  return { actorType: "guest", actorId: "", actorLabel: "\u0645\u0647\u0645\u0627\u0646" };
}

/**
 * Fire-and-forget audit logging.
 *
 * Nothing is written to MongoDB any more — the line goes to a daily JSONL file
 * on disk (see utils/fileLog.js). Routine, low-value events are dropped so the
 * log only contains what an owner actually wants to review; failures are always
 * kept. The caller IP is recorded on every line.
 */
export function logActivity(
  req,
  { action, target = "", success = true, status = 0, meta = "", actor } = {}
) {
  try {
    const level = levelFor(action, success);
    if (!level) return; // routine noise — not worth a log line

    const who = actor || actorOf(req);
    appendLog({
      // A stable id so the admin list can key on it without a database.
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      level,
      action: str(action, { max: 60 }),
      ...who,
      target: str(target, { max: 200 }),
      method: str(req?.method, { max: 10 }),
      path: str(req?.originalUrl, { max: 200 }),
      status,
      success,
      ip: clientIp(req),
      userAgent: str(req?.headers?.["user-agent"], { max: 300 }),
      meta: str(meta, { max: 500 }),
    });
  } catch (err) {
    console.error("activity log failed:", err?.message);
  }
}
