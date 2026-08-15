import { Router } from "express";
import Message from "../models/Message.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, isPhone } from "../utils/validate.js";

const router = Router();

router.post(
  "/",
  rateLimit({
    name: "contact",
    windowMs: 60 * 60 * 1000,
    max: 5, // 5 messages / hour / IP — stops contact-form spam floods
    message: "پیام‌های زیادی ارسال کرده‌اید. یک ساعت دیگر تلاش کنید.",
  }),
  ah(async (req, res) => {
    const name = str(req.body?.name, { max: 80 });
    const phone = str(req.body?.phone, { max: 20 });
    const body = str(req.body?.message ?? req.body?.body, { max: 2000 });

    if (!name) return res.status(400).json({ error: "نام الزامی است." });
    if (!isPhone(phone)) return res.status(400).json({ error: "شماره تماس معتبر وارد کنید." });
    if (body.length < 3) return res.status(400).json({ error: "متن پیام را وارد کنید." });

    const message = await Message.create({ name, phone, body });
    logActivity(req, { action: "contact.create", target: phone, status: 201 });
    res.status(201).json({ ok: true, id: String(message._id) });
  })
);

export default router;
