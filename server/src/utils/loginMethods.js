import Settings from "../models/Settings.js";

/**
 * Existing Settings documents predate these fields. Anything except the
 * explicit disabled value (empty string) therefore stays enabled, preserving
 * the old behaviour during a zero-downtime deployment.
 */
export function loginMethodsFromSettings(settings) {
  return {
    phone: settings?.loginPhoneEnabled !== "",
    email: settings?.loginEmailEnabled !== "",
  };
}

export async function getLoginMethods() {
  const settings = await Settings.getSingleton();
  return loginMethodsFromSettings(settings);
}

export function loginChannelEnabled(methods, channel) {
  return channel === "email" ? methods.email : methods.phone;
}

export function loginChannelDisabledMessage(channel) {
  return channel === "email"
    ? "ورود با ایمیل در حال حاضر غیرفعال است."
    : "ورود با شماره موبایل در حال حاضر غیرفعال است.";
}

/**
 * Normalises the admin payload and prevents disabling every login route. The
 * returned strings match the rest of the Settings DTO: "1" = on, "" = off.
 */
export function requestedLoginMethods(current, body = {}) {
  const currentMethods = loginMethodsFromSettings(current);
  const phone =
    body.loginPhoneEnabled === undefined
      ? currentMethods.phone
      : String(body.loginPhoneEnabled) === "1" || body.loginPhoneEnabled === true;
  const email =
    body.loginEmailEnabled === undefined
      ? currentMethods.email
      : String(body.loginEmailEnabled) === "1" || body.loginEmailEnabled === true;

  if (!phone && !email) {
    return {
      ok: false,
      error: "حداقل یکی از روش‌های ورود با شماره موبایل یا ایمیل باید فعال باشد.",
    };
  }

  return {
    ok: true,
    phone: phone ? "1" : "",
    email: email ? "1" : "",
  };
}
