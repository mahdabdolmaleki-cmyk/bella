import Product from "../models/Product.js";
import Settings, { clearSettingsCache } from "../models/Settings.js";
import { festivalFieldsToRestore } from "../utils/festival.js";

const INTERVAL_MS = 5_000;
const BATCH_SIZE = 200;
let running = false;

/** Restore one bounded batch with one MongoDB round-trip. */
async function restoreBatch(products) {
  if (!products.length) return 0;
  const operations = products.map((product) => ({
    updateOne: {
      filter: { _id: product._id, festival: true },
      update: {
        $set: {
          festival: false,
          ...festivalFieldsToRestore(product.festivalSnapshot),
        },
        $unset: { festivalSnapshot: 1 },
      },
    },
  }));
  const result = await Product.bulkWrite(operations, { ordered: false });
  return result.modifiedCount || 0;
}

/** Restore and remove all festival-only product changes after the configured end time. */
export async function sweepExpiredFestival(now = Date.now()) {
  if (running) return 0;
  running = true;
  try {
    // Skip Settings' request cache: the expiry job must see a timer extension
    // saved by another API process as soon as possible.
    const settings = await Settings.findOne({ key: "site" }).lean();
    if (!settings) return 0;
    const until = Number(settings.festivalUntil) || 0;
    if (!until || until > now) return 0;
    // Avoid rescanning an already-finished campaign on every timer tick, while
    // still resuming safely if a prior process stopped halfway through cleanup.
    if (settings.festivalActive === "false" && !(await Product.exists({ festival: true }))) return 0;

    // Turn the banner off with compare-and-set. Keep the expired timestamp for
    // admin history; every instance may safely resume cleanup after a restart.
    await Settings.updateOne(
      {
        _id: settings._id,
        festivalUntil: settings.festivalUntil,
        festivalActive: { $ne: "false" },
      },
      { $set: { festivalActive: "false" } },
    );
    clearSettingsCache();

    const stillExpired = async () => {
      const current = await Settings.findById(settings._id).select("festivalUntil").lean();
      const currentUntil = Number(current?.festivalUntil) || 0;
      return currentUntil === until && currentUntil > 0 && currentUntil <= now;
    };
    if (!(await stillExpired())) return 0;

    // Stream only festival products and restore in bounded bulk writes. The old
    // one-update-per-product loop could keep the database busy for a long time
    // when a campaign covered the full catalogue, making other API requests lag.
    const cursor = Product.find({ festival: true })
      .select("+festivalSnapshot")
      .lean()
      .cursor({ batchSize: BATCH_SIZE });
    let batch = [];
    let cleaned = 0;
    try {
      for await (const product of cursor) {
        batch.push(product);
        if (batch.length < BATCH_SIZE) continue;
        if (!(await stillExpired())) break;
        cleaned += await restoreBatch(batch);
        batch = [];
      }
      if (batch.length && (await stillExpired())) {
        cleaned += await restoreBatch(batch);
      }
    } finally {
      await cursor.close().catch(() => {});
    }

    if (cleaned > 0) {
      console.info(`festivalExpiry: restored ${cleaned} product(s) after the festival timer expired.`);
    }
    return cleaned;
  } finally {
    running = false;
  }
}

export function startFestivalExpirySweeper() {
  const run = () => {
    sweepExpiredFestival().catch((error) => {
      console.error("festivalExpiry: sweep failed:", error?.message || error);
    });
  };
  // Catch an already-expired campaign shortly after the DB connection is ready,
  // then poll cheaply so the expiry window is measured in seconds, not minutes.
  setTimeout(run, 1_000).unref();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return timer;
}
