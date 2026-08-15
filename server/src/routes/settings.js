import { Router } from "express";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  rateLimit({ name: "settings-read", windowMs: 60 * 1000, max: 120 }),
  ah(async (_req, res) => {
    const doc = await Settings.getSingleton();
    res.json({ settings: doc.toDTO() });
  })
);

export default router;
