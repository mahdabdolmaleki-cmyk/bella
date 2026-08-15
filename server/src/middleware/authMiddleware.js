import { ADMIN_COOKIE, USER_COOKIE, verifyToken } from "../utils/auth.js";
import User from "../models/User.js";

// Only the OTP-authenticated super-admin session is accepted. Database-backed
// admin accounts and the legacy shared-password session are not supported.
export function requireAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  const payload = token && verifyToken(token);

  if (!payload || payload.superAdmin !== true) {
    return res.status(401).json({ error: "دسترسی غیرمجاز." });
  }

  req.admin = true;
  next();
}

// Kept as explicit route-level guards. They now verify the single supported
// admin identity instead of implementing role-based access control.
export function requireAdminWrite(req, res, next) {
  if (!req.admin) {
    return res.status(403).json({ error: "فقط مدیر اصلی اجازه انجام این عملیات را دارد." });
  }
  next();
}

export function requireOwner(req, res, next) {
  if (!req.admin) {
    return res.status(403).json({ error: "فقط مدیر اصلی اجازه دسترسی دارد." });
  }
  next();
}

// Customer guard — requires a logged-in user account.
// Wrapped in try/catch: an invalid ObjectId makes findById throw a CastError,
// which in Express 4 would otherwise become an unhandled promise rejection.
export async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.[USER_COOKIE];
    const payload = token && verifyToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "\u0627\u0628\u062a\u062f\u0627 \u0648\u0627\u0631\u062f \u062d\u0633\u0627\u0628 \u06a9\u0627\u0631\u0628\u0631\u06cc \u0634\u0648\u06cc\u062f." });
    }
    const user = await User.findOne({ _id: payload.sub, deletedAt: null }).select("+tokenVersion");
    if (!user) {
      return res.status(401).json({ error: "\u062d\u0633\u0627\u0628 \u06a9\u0627\u0631\u0628\u0631\u06cc \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });
    }
    if (Number(payload.tv ?? 0) !== Number(user.tokenVersion ?? 0)) {
      return res
        .status(401)
        .json({ error: "نشست حساب تغییر کرده است. دوباره وارد شوید." });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(401).json({ error: "\u0646\u0634\u0633\u062a \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a. \u062f\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062f \u0634\u0648\u06cc\u062f." });
    }
    next(err);
  }
}

// Optional — attaches req.user when a valid customer cookie exists, but never
// blocks the request (used so orders can be linked to an account if present).
export async function optionalUser(req, _res, next) {
  try {
    const token = req.cookies?.[USER_COOKIE];
    const payload = token && verifyToken(token);
    if (payload?.sub) {
      req.user = await User.findOne({ _id: payload.sub, deletedAt: null })
        .select("+tokenVersion")
        .catch(() => null);
      if (req.user && Number(payload.tv ?? 0) !== Number(req.user.tokenVersion ?? 0)) {
        req.user = null;
      }
    }
  } catch {
    req.user = null;
  }
  next();
}
