import { ADMIN_COOKIE, USER_COOKIE, verifyToken } from "../utils/auth.js";
import User from "../models/User.js";
import AdminUser from "../models/AdminUser.js";

// Admin guard — protects everything under /api/admin (except the login route,
// which is mounted before this middleware inside the admin router).
// Supports two kinds of sessions:
//   1. A real admin account (payload.adminId) — checked against the database
//      on every request so a disabled/deleted admin loses access immediately.
//   2. The legacy shared ADMIN_PASSWORD session (payload.role === "admin").
export async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.[ADMIN_COOKIE];
    const payload = token && verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "\u062f\u0633\u062a\u0631\u0633\u06cc \u063a\u06cc\u0631\u0645\u062c\u0627\u0632." });
    }

    // نشست مدیر اصلی: با ورود از طریق کد یک‌بارمصرف روی شمارهٔ هاردکدشده ساخته
    // می‌شود. این نشست بدون هیچ حساب دیتابیسی، دسترسی کامل «مالک» را می‌دهد.
    if (payload.superAdmin === true) {
      req.admin = true;
      req.adminRole = "owner";
      return next();
    }

    if (payload.adminId) {
      const admin = await AdminUser.findById(payload.adminId).select("+tokenVersion");
      // HARDENING: a cookie is only valid while the account still exists, is
      // active, is not locked out and its password has not been changed since.
      if (admin && Number(payload.atv ?? 0) !== Number(admin.tokenVersion ?? 0)) {
        return res
          .status(401)
          .json({ error: "رمز عبور تغییر کرده است. دوباره وارد شوید." });
      }
      if (admin && typeof admin.isLocked === "function" && admin.isLocked()) {
        return res
          .status(423)
          .json({ error: "حساب مدیریتی موقتاً قفل شده است." });
      }
      if (!admin || !admin.active) {
        return res.status(401).json({ error: "\u062d\u0633\u0627\u0628 \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc \u063a\u06cc\u0631\u0641\u0639\u0627\u0644 \u06cc\u0627 \u062d\u0630\u0641 \u0634\u062f\u0647 \u0627\u0633\u062a." });
      }
      req.admin = true;
      req.adminUser = admin;
      return next();
    }

    // Legacy shared-password session. It grants full owner rights without any
    // database account, so it is now opt-in and never accepted in production.
    if (payload.role === "admin") {
      const envLoginAllowed =
        process.env.ALLOW_ENV_ADMIN_LOGIN === "true" &&
        process.env.NODE_ENV !== "production";
      if (!envLoginAllowed) {
        return res
          .status(401)
          .json({ error: "این روش ورود غیرفعال است. با حساب مدیریتی وارد شوید." });
      }
      req.admin = true;
      req.adminRole = "owner";
      return next();
    }

    return res.status(401).json({ error: "\u062f\u0633\u062a\u0631\u0633\u06cc \u063a\u06cc\u0631\u0645\u062c\u0627\u0632." });
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(401).json({ error: "\u0646\u0634\u0633\u062a \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a. \u062f\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062f \u0634\u0648\u06cc\u062f." });
    }
    next(err);
  }
}

// Blocks read-only admins (role "viewer") from performing write operations.
export function requireAdminWrite(req, res, next) {
  const role = req.adminUser?.role || req.adminRole || "owner";
  if (role === "viewer") {
    return res.status(403).json({ error: "\u062d\u0633\u0627\u0628 \u0634\u0645\u0627 \u0641\u0642\u0637 \u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u0634\u0627\u0647\u062f\u0647 \u062f\u0627\u0631\u062f." });
  }
  next();
}

// Only owners may manage other admin accounts.
export function requireOwner(req, res, next) {
  const role = req.adminUser?.role || req.adminRole || "owner";
  if (role !== "owner") {
    return res.status(403).json({ error: "\u0641\u0642\u0637 \u0645\u0627\u0644\u06a9 \u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u062f \u062d\u0633\u0627\u0628\u200c\u0647\u0627\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc \u0631\u0627 \u0645\u062f\u06cc\u0631\u06cc\u062a \u06a9\u0646\u062f." });
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
        .json({ error: "رمز عبور تغییر کرده است. دوباره وارد شوید." });
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
      req.user = await User.findOne({ _id: payload.sub, deletedAt: null }).catch(() => null);
      if (req.user && Number(payload.tv ?? 0) !== Number(req.user.tokenVersion ?? 0)) {
        req.user = null;
      }
    }
  } catch {
    req.user = null;
  }
  next();
}
