import { Router } from "express";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { requireUser } from "../middleware/authMiddleware.js";
import { rateLimit, penalise, resetLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, isEmail, isPostalCode, addressIssue } from "../utils/validate.js";
import { isProvince } from "../utils/shipping.js";
import { consumeTicket } from "../utils/otp.js";
import {
  normalizePhone,
  isSuperAdminPhone,
  isSuperAdminEmail,
  SUPER_ADMIN_PHONE,
} from "../config/superAdmin.js";
import {
  USER_COOKIE,
  ADMIN_COOKIE,
  signToken,
  cookieOptions,
  adminCookieOptions,
  adminSessionHours,
  clearCookieOptions,
} from "../utils/auth.js";

const router = Router();

const LOGIN_WINDOW = 15 * 60 * 1000;
const loginLimiter = rateLimit({
  name: "user-login",
  windowMs: LOGIN_WINDOW,
  max: 20,
  message: "تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
});

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    address: user.address || "",
    province: user.province || "",
    city: user.city || "",
    postalCode: user.postalCode || "",
    favorites: Array.isArray(user.favorites) ? user.favorites : [],
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/login  { phone? , email? , ticket , name? }
// تنها راه ورود: کد یک‌بارمصرف. رمز عبور به‌کلی حذف شده است.
//  • اگر شماره همان شمارهٔ مدیر اصلیِ هاردکدشده باشد ← نشست مدیر ساخته می‌شود
//    و { admin: true } برمی‌گردد تا فرانت به /admin برود.
//  • در غیر این صورت، حساب مشتری پیدا یا ساخته می‌شود و نشست کاربر ست می‌شود.
// ---------------------------------------------------------------------------
router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const ticket = str(req.body?.ticket, { max: 100 });
    const email = isEmail(req.body?.email);
    const name = str(req.body?.name, { max: 80 });
    let phone = normalizePhone(req.body?.phone);

    // مدیر اصلی با ایمیل هاردکدشده وارد می‌شود؛ در غیر این صورت شماره را از روی حساب پیدا می‌کنیم.
    if (!phone && email && isSuperAdminEmail(email)) {
      phone = SUPER_ADMIN_PHONE;
    } else if (!phone && email) {
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      phone = owner?.phone || "";
    }

    const fail = (msg) => {
      penalise(req, "user-login", LOGIN_WINDOW);
      logActivity(req, {
        action: "user.login.failed",
        target: email || phone || "",
        success: false,
        status: 401,
      });
      return res
        .status(401)
        .json({ error: msg || "کد تأیید معتبر نیست یا منقضی شده است." });
    };

    if (!phone) {
      return res.status(400).json({ error: "شماره موبایل یا ایمیل معتبر وارد کنید." });
    }

    // بلیت اثبات می‌کند که کد پیامک‌شده به این شماره درست وارد شده است.
    const verifiedPhone = await consumeTicket(phone, "login", ticket);
    if (!verifiedPhone) return fail();

    resetLimit(req, "user-login");

    // ---- ورود مدیر اصلی (فقط شمارهٔ هاردکدشده) ----
    if (isSuperAdminPhone(phone)) {
      res.cookie(
        ADMIN_COOKIE,
        signToken({ role: "admin", superAdmin: true }, { expiresIn: `${adminSessionHours()}h` }),
        adminCookieOptions()
      );
      logActivity(req, { action: "admin.login", target: "super-admin", status: 200 });
      return res.json({ ok: true, admin: true });
    }

    // ---- ورود/ثبت‌نام مشتری (پیدا یا ساخت) ----
    let user = await User.findOne({ phone, deletedAt: null }).select("+tokenVersion");
    if (!user) {
      user = await User.create({
        name: name || "مشتری بلّا",
        phone,
        phoneVerified: true,
      });
    } else {
      let dirty = false;
      if (!user.phoneVerified) {
        user.phoneVerified = true;
        dirty = true;
      }
      // اگر کاربر هنگام ورودِ اول نامی وارد کرده و هنوز نام واقعی ندارد، ذخیره کن.
      if (name && (!user.name || user.name === "مشتری بلّا")) {
        user.name = name;
        dirty = true;
      }
      if (dirty) await user.save();
    }

    res.cookie(
      USER_COOKIE,
      signToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
      cookieOptions()
    );
    logActivity(req, {
      action: "user.login",
      target: user.phone,
      status: 200,
      actor: { actorType: "user", actorId: String(user._id), actorLabel: user.name },
    });
    res.json({ user: publicUser(user) });
  })
);

router.post("/logout", (req, res) => {
  logActivity(req, { action: "user.logout", status: 200 });
  res.clearCookie(USER_COOKIE, clearCookieOptions());
  res.json({ ok: true });
});

router.get("/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PATCH /api/auth/me — در پروفایل، کاربر می‌تواند همهٔ اطلاعات، حتی ایمیل و شماره، را ویرایش کند.
router.patch(
  "/me",
  requireUser,
  rateLimit({ name: "profile-update", windowMs: 60 * 1000, max: 20 }),
  ah(async (req, res) => {
    const user = req.user;

    if (req.body?.name !== undefined) {
      const name = str(req.body.name, { max: 80 });
      if (!name) return res.status(400).json({ error: "نام نمی‌تواند خالی باشد." });
      user.name = name;
    }

    // ایمیل حالا در پروفایل قابل ویرایش است (با بررسی یکتا بودن).
    if (req.body?.email !== undefined) {
      const raw = str(req.body.email, { max: 160 });
      if (!raw) {
        user.email = undefined;
      } else {
        const email = isEmail(raw);
        if (!email) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
        if (email !== user.email) {
          const taken = await User.findOne({ email, deletedAt: null, _id: { $ne: user._id } })
            .select("_id")
            .lean();
          if (taken) return res.status(409).json({ error: "این ایمیل قبلاً استفاده شده است." });
          user.email = email;
        }
      }
    }

    // شماره شناسهٔ ورود است؛ قابل تغییر است ولی نمی‌تواند خالی شود یا شمارهٔ مدیر باشد.
    if (req.body?.phone !== undefined) {
      const raw = str(req.body.phone, { max: 20 });
      const phone = normalizePhone(raw);
      if (!phone) {
        return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
      }
      if (phone !== user.phone) {
        if (isSuperAdminPhone(phone)) {
          return res.status(400).json({ error: "این شماره قابل استفاده نیست." });
        }
        const taken = await User.findOne({ phone, deletedAt: null, _id: { $ne: user._id } })
          .select("_id")
          .lean();
        if (taken) return res.status(409).json({ error: "این شماره قبلاً استفاده شده است." });
        user.phone = phone;
      }
    }

    if (req.body?.address !== undefined) {
      const raw = str(req.body.address, { max: 500 });
      if (!raw) {
        user.address = "";
      } else {
        const issue = addressIssue(raw);
        if (issue) return res.status(400).json({ error: issue });
        user.address = raw;
      }
    }
    if (req.body?.province !== undefined) {
      const province = str(req.body.province, { max: 40 });
      if (province && !isProvince(province)) {
        return res.status(400).json({ error: "استان انتخاب‌شده معتبر نیست." });
      }
      user.province = province;
    }
    if (req.body?.city !== undefined) {
      user.city = str(req.body.city, { max: 60 });
    }
    if (req.body?.postalCode !== undefined) {
      const raw = str(req.body.postalCode, { max: 20 });
      if (!raw) {
        user.postalCode = "";
      } else {
        const postalCode = isPostalCode(raw);
        if (!postalCode) {
          return res.status(400).json({ error: "کد پستی باید ۱۰ رقم معتبر باشد." });
        }
        user.postalCode = postalCode;
      }
    }

    try {
      await user.save();
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: "این ایمیل یا شماره قبلاً استفاده شده است." });
      }
      throw err;
    }
    res.json({ user: publicUser(user) });
  })
);

router.get(
  "/orders",
  requireUser,
  ah(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ orders: orders.map((o) => o.toDTO()) });
  })
);

export default router;
