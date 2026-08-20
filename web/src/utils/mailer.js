/**
 * Provider-agnostic e-mail sender (used for OTP delivery by e-mail).
 *
 * Configure with:
 *   MAIL_PROVIDER=console | resend | mailgun | smtp
 *   MAIL_FROM="Bella Perfume <no-reply@bella.ir>"
 *   RESEND_API_KEY=...                       (provider: resend)
 *   MAILGUN_API_KEY=...  MAILGUN_DOMAIN=...  (provider: mailgun)
 *   SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_SECURE=false
 *
 * With the default "console" provider nothing leaves the machine: outside
 * production the message is printed so the whole flow stays testable without
 * any mail vendor. In production an unconfigured provider fails closed.
 */
const PROVIDER = (process.env.MAIL_PROVIDER || "console").toLowerCase();
const FROM = process.env.MAIL_FROM || "Bella Perfume <no-reply@bella.local>";
const TIMEOUT_MS = 8000;

function withTimeout() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function sendResend(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY || "";
  if (!key) return false;
  const t = withTimeout();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
      signal: t.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    t.done();
  }
}

async function sendMailgun(to, subject, text, html) {
  const key = process.env.MAILGUN_API_KEY || "";
  const domain = process.env.MAILGUN_DOMAIN || "";
  if (!key || !domain) return false;
  const base = process.env.MAILGUN_BASE_URL || "https://api.mailgun.net";
  const t = withTimeout();
  try {
    const res = await fetch(`${base}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${key}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ from: FROM, to, subject, text, html }).toString(),
      signal: t.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    t.done();
  }
}

let transporter = null;
async function sendSmtp(to, subject, text, html) {
  const host = process.env.SMTP_HOST || "";
  if (!host) return false;
  try {
    if (!transporter) {
      // Optional dependency: only required when MAIL_PROVIDER=smtp.
      const nodemailer = await import("nodemailer");
      transporter = (nodemailer.default ?? nodemailer).createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
          : undefined,
      });
    }
    await transporter.sendMail({ from: FROM, to, subject, text, html });
    return true;
  } catch (err) {
    console.warn("SMTP send failed:", err?.message || err);
    return false;
  }
}

/**
 * @returns {Promise<boolean>} true when the message was handed to the provider.
 */
export async function sendMail(to, subject, text, html) {
  const address = String(to || "").trim();
  if (!address) return false;

  if (PROVIDER === "console") {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\u2709\ufe0f  [MAIL \u2192 ${address}] ${subject}\n${text}`);
      return true;
    }
    console.warn("Mail provider is not configured \u2014 message not delivered.");
    return false;
  }
  if (PROVIDER === "resend") return sendResend(address, subject, text, html);
  if (PROVIDER === "mailgun") return sendMailgun(address, subject, text, html);
  if (PROVIDER === "smtp") return sendSmtp(address, subject, text, html);

  console.warn(`Unknown MAIL_PROVIDER "${PROVIDER}" \u2014 message not sent.`);
  return false;
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
