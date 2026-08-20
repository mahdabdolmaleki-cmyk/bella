import { Router } from "express";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";

const router = Router();

// The login form reads only these two flags and must see an admin change
// immediately, rather than a cached copy of the full storefront settings.
router.get(
  "/login-methods",
  rateLimit({ name: "login-methods-read", windowMs: 60 * 1000, max: 120 }),
  ah(async (_req, res) => {
    const doc = await Settings.getSingleton();
    const settings = doc.toDTO();
    res.set("Cache-Control", "no-store");
    res.json({
      methods: {
        phone: settings.loginPhoneEnabled === "1",
        email: settings.loginEmailEnabled === "1",
      },
    });
  })
);

router.get(
  "/",
  rateLimit({ name: "settings-read", windowMs: 60 * 1000, max: 120 }),
  ah(async (_req, res) => {
    const doc = await Settings.getSingleton();
    res.json({ settings: doc.toDTO() });
  })
);

export default router;
