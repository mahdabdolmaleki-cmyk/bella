import { ADMIN, api, assert, group, test } from "../harness.mjs";

const testIp = () => `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
const ADMIN_IP = testIp();
const OTP_IP = testIp();
const OTP_ADMIN_COOKIE_IP = testIp();

export async function register() {
  group("rate limits");

  test("valid admin session bypasses both global and admin API quotas", async () => {
    // Exceed the doubled admin route quota (400/min) and global quota (600/15m).
    for (let i = 0; i < 605; i++) {
      const r = await api("/admin/me", {
        cookie: ADMIN,
        headers: { "X-Forwarded-For": ADMIN_IP },
      });
      assert.status(r, 200, `admin request ${i + 1}`);
    }
  });

  test("unauthenticated OTP requests retain protection at the doubled quota", async () => {
    // The /otp/request per-IP quota is 12/hour in config, doubled to 24.
    // An invalid phone exits before issuing or sending a code but still counts.
    for (let i = 0; i < 24; i++) {
      const r = await api("/otp/request", {
        method: "POST",
        body: { phone: "invalid", channel: "sms" },
        headers: { "X-Forwarded-For": OTP_IP },
      });
      assert.ok(r.s !== 429, `OTP request ${i + 1} should remain under the doubled quota`);
    }

    const limited = await api("/otp/request", {
      method: "POST",
      body: { phone: "invalid", channel: "sms" },
      headers: { "X-Forwarded-For": OTP_IP },
    });
    assert.status(limited, 429, "the 25th unauthenticated OTP request must be rate-limited");
  });

  test("admin cookie alone does not exempt a public OTP endpoint", async () => {
    for (let i = 0; i < 24; i++) {
      const r = await api("/otp/request", {
        method: "POST",
        cookie: ADMIN,
        body: { phone: "invalid", channel: "sms" },
        headers: { "X-Forwarded-For": OTP_ADMIN_COOKIE_IP },
      });
      assert.ok(r.s !== 429, `public OTP request ${i + 1} should remain under quota`);
    }

    const limited = await api("/otp/request", {
      method: "POST",
      cookie: ADMIN,
      body: { phone: "invalid", channel: "sms" },
      headers: { "X-Forwarded-For": OTP_ADMIN_COOKIE_IP },
    });
    assert.status(limited, 429, "the admin cookie must not bypass the public OTP quota");
  });
}
