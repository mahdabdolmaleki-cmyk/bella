/**
 * Direct Gmail SMTP sender used by OTP and admin announcements.
 *
 * This is the project's original delivery method: Nodemailer connects
 * directly to smtp.gmail.com with the Gmail account and its App Password.
 * No e-mail API or intermediary provider is used.
 *
 * Configure with:
 *   MAIL_PROVIDER=smtp
 *   MAIL_FROM="Bella Perfume <your-address@gmail.com>"
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   SMTP_USER=your-address@gmail.com
 *   SMTP_PASS=your-16-character-google-app-password
 */
const PROVIDER = (process.env.MAIL_PROVIDER || "console").toLowerCase();
const FROM = process.env.MAIL_FROM || "Bella Perfume <no-reply@bella.local>";

function failure(error, provider) {
  return {
    ok: false,
    error: String(error || "ارسال ایمیل ناموفق بود.").slice(0, 300),
    provider,
  };
}

let transporter = null;

async function smtpTransport() {
  if (transporter) return transporter;

  const nodemailerModule = await import("nodemailer");
  const nodemailer = nodemailerModule.default ?? nodemailerModule;

  // Keep the same SMTP transport used by the original project. Gmail port
  // 587 uses STARTTLS (`secure: false`); port 465 uses implicit TLS
  // (`secure: true`). There is deliberately no API/provider fallback.
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
  });

  return transporter;
}

function smtpErrorMessage(err) {
  const code = String(err?.code || "");
  if (code === "EAUTH") {
    return "احراز هویت Gmail رد شد؛ SMTP_PASS باید App Password معتبر گوگل باشد.";
  }
  if (code === "ETIMEDOUT") {
    return `اتصال مستقیم به ${process.env.SMTP_HOST || "smtp.gmail.com"}:${
      process.env.SMTP_PORT || 587
    } منقضی شد.`;
  }
  return String(err?.message || "ارسال SMTP ناموفق بود.").slice(0, 300);
}

async function sendSmtp(to, subject, text, html) {
  const host = String(process.env.SMTP_HOST || "").trim().toLowerCase();
  if (!host) return failure("SMTP_HOST تنظیم نشده است.", "smtp");
  if (host !== "smtp.gmail.com") {
    return failure("برای ارسال مستقیم Gmail، SMTP_HOST باید smtp.gmail.com باشد.", "smtp");
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return failure("SMTP_USER یا SMTP_PASS تنظیم نشده است.", "smtp");
  }

  try {
    const transport = await smtpTransport();
    const info = await transport.sendMail({ from: FROM, to, subject, text, html });
    return {
      ok: true,
      error: "",
      provider: "smtp",
      messageId: String(info?.messageId || ""),
    };
  } catch (err) {
    console.warn("SMTP send failed:", err?.message || err);
    return failure(smtpErrorMessage(err), "smtp");
  }
}

/**
 * Sends one message and preserves a safe SMTP error for admin reporting.
 * @returns {Promise<{ok: boolean, error: string, provider: string, messageId?: string}>}
 */
export async function sendMailDetailed(to, subject, text, html) {
  const address = String(to || "").trim();
  if (!address) return failure("آدرس ایمیل خالی است.", PROVIDER);

  // Preserve the original local-development behaviour.
  if (PROVIDER === "console") {
    if (process.env.NODE_ENV !== "production") {
      console.log(`✉️  [MAIL → ${address}] ${subject}\n${text}`);
      return { ok: true, error: "", provider: "console" };
    }
    return failure("Mail provider در محیط production تنظیم نشده است.", "console");
  }

  if (PROVIDER === "smtp") {
    return sendSmtp(address, subject, text, html);
  }

  return failure('MAIL_PROVIDER باید روی "smtp" تنظیم شود.', PROVIDER);
}

/** Backward-compatible boolean API used by OTP delivery. */
export async function sendMail(to, subject, text, html) {
  const result = await sendMailDetailed(to, subject, text, html);
  if (!result.ok) console.warn("Mail send failed:", result.error);
  return result.ok;
}

export function otpMail(code) {
  const subject = "\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0628\u0644\u0627 \u067e\u0631\u0641\u06cc\u0648\u0645";
  const text =
    `\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0634\u0645\u0627: ${code}\n` +
    "\u0627\u06cc\u0646 \u06a9\u062f \u062a\u0627 \u06f5 \u062f\u0642\u06cc\u0642\u0647 \u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a. \u0622\u0646 \u0631\u0627 \u062f\u0631 \u0627\u062e\u062a\u06cc\u0627\u0631 \u06a9\u0633\u06cc \u0642\u0631\u0627\u0631 \u0646\u062f\u0647\u06cc\u062f.";
  const html =
    `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#06120b;color:#f2e9d4;padding:28px;border-radius:16px">` +
    `<p style="color:#d4af37;font-weight:bold;margin:0 0 14px">Bella Perfume</p>` +
    `<p style="margin:0 0 10px">\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0634\u0645\u0627:</p>` +
    `<p style="font-size:30px;letter-spacing:8px;color:#e8cd85;margin:0 0 14px"><b>${code}</b></p>` +
    `<p style="font-size:12px;color:#93ac9c;margin:0">\u0627\u06cc\u0646 \u06a9\u062f \u062a\u0627 \u06f5 \u062f\u0642\u06cc\u0642\u0647 \u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a. \u0622\u0646 \u0631\u0627 \u062f\u0631 \u0627\u062e\u062a\u06cc\u0627\u0631 \u06a9\u0633\u06cc \u0642\u0631\u0627\u0631 \u0646\u062f\u0647\u06cc\u062f.</p>` +
    `</div>`;
  return { subject, text, html };
}

export function maskEmail(value) {
  const raw = String(value || "");
  const at = raw.indexOf("@");
  if (at < 1) return "";
  const name = raw.slice(0, at);
  const domain = raw.slice(at);
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(2, name.length - 2))}${domain}`;
}

/**
 * Template for an announcement / newsletter e-mail sent from the admin panel.
 * The body arrives as plain text written by the shop owner; every line becomes
 * a paragraph and the text is HTML-escaped, so no admin typo can break the
 * markup (or inject anything into the customer's inbox).
 */
export function announcementMail(subject, body, name = "") {
  const clean = String(body || "").replace(/\r\n/g, "\n").trim();
  const greeting = name ? `سلام ${name} عزیز،` : "سلام،";
  const text = `${greeting}\n\n${clean}\n\nبلا — خانهٔ عطر`;

  const esc = (v) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((block) => esc(block).replace(/\n/g, "<br/>"))
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:2;color:#f2e9d4">${block}</p>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="fa" dir="rtl"><body style="margin:0;background:#06120b;padding:28px 14px;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(212,175,55,0.3);border-radius:18px;background:#0b2417;padding:26px">
    <p style="margin:0 0 6px;letter-spacing:4px;font-size:11px;color:#9a7b2a">BELLA PERFUME</p>
    <h1 style="margin:0 0 18px;font-size:19px;color:#d4af37">${esc(subject)}</h1>
    <p style="margin:0 0 14px;font-size:14px;color:#93ac9c">${esc(greeting)}</p>
    ${paragraphs}
    <hr style="margin:22px 0;border:none;border-top:1px solid rgba(212,175,55,0.18)"/>
    <p style="margin:0;font-size:11px;color:#93ac9c">
      این پیام از سوی فروشگاه بلا برای مشتریان فرستاده شده است.
    </p>
  </div>
</body></html>`;

  return { subject: String(subject || "").trim() || "اطلاعیهٔ بلا", text, html };
}
