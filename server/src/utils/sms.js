/**
 * Provider-agnostic SMS sender.
 *
 * Configure with:
 *   SMS_PROVIDER=console | kavenegar | melipayamak | ghasedak
 *   SMS_API_KEY=...
 *   SMS_SENDER=...        (line number, when the provider needs it)
 *   SMS_TEMPLATE=...      (Kavenegar verify-lookup template name)
 *
 * In development (or when no key is set) the code is printed to the console
 * instead of being sent, so you can test the whole flow without any provider.
 */
const PROVIDER = (process.env.SMS_PROVIDER || "console").toLowerCase();
const API_KEY = process.env.SMS_API_KEY || "";
const SENDER = process.env.SMS_SENDER || "";
const TEMPLATE = process.env.SMS_TEMPLATE || "";
const TIMEOUT_MS = 8000;

async function postForm(url, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<boolean>} true when the message was handed to the provider.
 */
export async function sendSms(phone, text) {
  if (PROVIDER === "console" || !API_KEY) {
    // Never log real codes in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`\u2709\ufe0f  [SMS \u2192 ${phone}] ${text}`);
    } else {
      console.warn("SMS provider is not configured — message not delivered.");
      return false;
    }
    return true;
  }

  if (PROVIDER === "kavenegar") {
    return postForm("https://api.kavenegar.com/v1/" + API_KEY + "/sms/send.json", {
      receptor: phone,
      sender: SENDER,
      message: text,
    });
  }

  if (PROVIDER === "ghasedak") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("https://api.ghasedak.me/v2/sms/send/simple", {
        method: "POST",
        headers: {
          apikey: API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ receptor: phone, linenumber: SENDER, message: text }),
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  if (PROVIDER === "melipayamak") {
    return postForm("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
      username: process.env.SMS_USERNAME || "",
      password: API_KEY,
      to: phone,
      from: SENDER,
      text,
    });
  }

  console.warn(`Unknown SMS_PROVIDER "${PROVIDER}" — message not sent.`);
  return false;
}

export function otpMessage(code) {
  return `\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0628\u0644\u0651\u0627 \u067e\u0631\u0641\u06cc\u0648\u0645: ${code}\n\u0627\u06cc\u0646 \u06a9\u062f \u062a\u0627 \u06f5 \u062f\u0642\u06cc\u0642\u0647 \u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a. \u0622\u0646 \u0631\u0627 \u062f\u0631 \u0627\u062e\u062a\u06cc\u0627\u0631 \u06a9\u0633\u06cc \u0642\u0631\u0627\u0631 \u0646\u062f\u0647\u06cc\u062f.`;
}
