/**
 * ZarinPal payment gateway (REST v4).
 *
 * Env:
 *   ZARINPAL_MERCHANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   ZARINPAL_SANDBOX=true|false
 *   ZARINPAL_CURRENCY=IRT (toman) | IRR (rial)
 *   PUBLIC_BASE_URL=https://your-site.ir   (used to build the callback URL)
 *
 * SECURITY: the browser callback is NEVER trusted. A payment is only accepted
 * after the server-to-server `verify` call returns code 100 (or 101 = already
 * verified), which is what makes the flow idempotent.
 */
const SANDBOX = String(process.env.ZARINPAL_SANDBOX || "").toLowerCase() === "true";
const BASE = SANDBOX
  ? "https://sandbox.zarinpal.com/pg"
  : "https://payment.zarinpal.com/pg";
const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || "";
const CURRENCY = (process.env.ZARINPAL_CURRENCY || "IRT").toUpperCase();
const TIMEOUT_MS = 15000;

export function isZarinpalConfigured() {
  return /^[0-9a-fA-F-]{36}$/.test(MERCHANT_ID);
}

export function startUrl(authority) {
  return `${BASE}/StartPay/${authority}`;
}

async function callApi(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/v4/payment/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant_id: MERCHANT_ID, ...payload }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return json?.data && Object.keys(json.data).length ? json.data : { errors: json?.errors };
  } catch (err) {
    return { errors: { message: err?.name === "AbortError" ? "timeout" : "network" } };
  } finally {
    clearTimeout(timer);
  }
}

/** Amounts are stored in Toman; ZarinPal wants Rial when CURRENCY = IRR. */
function toGatewayAmount(toman) {
  return CURRENCY === "IRR" ? Math.round(toman) * 10 : Math.round(toman);
}

export async function requestPayment({ amount, description, callbackUrl, mobile, email }) {
  if (!isZarinpalConfigured()) {
    return { ok: false, error: "\u062f\u0631\u06af\u0627\u0647 \u067e\u0631\u062f\u0627\u062e\u062a \u067e\u06cc\u06a9\u0631\u0628\u0646\u062f\u06cc \u0646\u0634\u062f\u0647 \u0627\u0633\u062a." };
  }
  const data = await callApi("request.json", {
    amount: toGatewayAmount(amount),
    currency: CURRENCY,
    description: String(description || "").slice(0, 255),
    callback_url: callbackUrl,
    metadata: {
      ...(mobile ? { mobile } : {}),
      ...(email ? { email } : {}),
    },
  });

  if (data?.code === 100 && data?.authority) {
    return { ok: true, authority: data.authority, url: startUrl(data.authority) };
  }
  return {
    ok: false,
    error: "\u0627\u06cc\u062c\u0627\u062f \u062a\u0631\u0627\u06a9\u0646\u0634 \u062f\u0631 \u062f\u0631\u06af\u0627\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f.",
    code: data?.code ?? data?.errors?.code ?? null,
  };
}

export async function verifyPayment({ amount, authority }) {
  const data = await callApi("verify.json", {
    amount: toGatewayAmount(amount),
    authority,
  });
  // 100 = verified now, 101 = already verified before (idempotent replay).
  if (data?.code === 100 || data?.code === 101) {
    return {
      ok: true,
      alreadyVerified: data.code === 101,
      refId: String(data.ref_id ?? ""),
      cardPan: String(data.card_pan ?? ""),
    };
  }
  return { ok: false, code: data?.code ?? data?.errors?.code ?? null };
}
