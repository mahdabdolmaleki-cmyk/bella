import { Router } from "express";
import mongoose from "mongoose";
import zlib from "zlib";
import { requireAdmin, requireOwner } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";

/**
 * DATABASE BACKUP / EXPORT — OWNER ONLY.
 *
 * Dumps every collection in the live database so the whole store can be
 * rebuilt from a single file.
 *
 * Why collections are read straight from the driver instead of from the
 * Mongoose models: a backup must contain everything that is actually stored,
 * including collections whose model was removed or was never declared. Walking
 * the model registry would silently skip those and produce a backup that looks
 * complete but is not.
 *
 * Every response is streamed document-by-document through a cursor, so a large
 * database can never load itself into memory and take the server down.
 */

const router = Router();

// Both guards, in this order: a valid admin session first, then the owner role.
// Staff admins and viewers get 403 — a full dump contains every customer's
// personal data, so it is strictly an owner capability.
router.use(requireAdmin, requireOwner);

// Deliberately strict: a dump is expensive and there is never a reason to pull
// one several times a minute.
const backupLimit = rateLimit({
  name: "admin-backup",
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "درخواست پشتیبان‌گیری بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
});

// Internal bookkeeping collections that carry no business data.
const SKIP_COLLECTIONS = new Set(["sessions"]);

/**
 * Fields stripped unless the owner explicitly asks for a full-fidelity dump.
 * These are credential material (password hashes, OTP hashes) and audit data
 * (IP addresses). A backup without them still restores the catalogue, orders
 * and customers, and is far safer to store outside the server.
 */
const SECRET_FIELDS = new Set([
  "passwordHash",
  "tokenVersion",
  "codeHash",
  "ticketHash",
  "ip",
  "lastLoginIp",
]);

function redact(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (SECRET_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function getDb() {
  // readyState 1 === connected. Without this, a dump requested during a
  // reconnect would throw a confusing driver error instead of a clear message.
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return mongoose.connection.db;
}

async function listDataCollections(db) {
  const all = await db.listCollections({}, { nameOnly: true }).toArray();
  return all
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system.") && !SKIP_COLLECTIONS.has(name))
    .sort();
}

function stamp() {
  // 2026-08-06T12-30-00 — safe on every filesystem.
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-");
}

/* ------------------------------------------------------------------ */
/* Summary — what a backup would contain, shown before downloading.    */
/* ------------------------------------------------------------------ */
router.get(
  "/summary",
  ah(async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: "اتصال به پایگاه داده برقرار نیست." });
    }

    const names = await listDataCollections(db);
    const collections = await Promise.all(
      names.map(async (name) => {
        // estimatedDocumentCount reads collection metadata instead of scanning,
        // so the summary stays instant even on large collections.
        const count = await db
          .collection(name)
          .estimatedDocumentCount()
          .catch(() => 0);
        return { name, count };
      })
    );

    res.json({
      database: db.databaseName,
      generatedAt: new Date().toISOString(),
      collections,
      totalDocuments: collections.reduce((sum, c) => sum + c.count, 0),
    });
  })
);

/* ------------------------------------------------------------------ */
/* Export — streams the whole database as a downloadable file.         */
/* ------------------------------------------------------------------ */
router.get(
  "/export",
  backupLimit,
  ah(async (req, res) => {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: "اتصال به پایگاه داده برقرار نیست." });
    }

    const format = req.query.format === "ndjson" ? "ndjson" : "json";
    const gzip = String(req.query.gzip) === "1";
    const includeSecrets = String(req.query.secrets) === "1";

    const names = await listDataCollections(db);
    const filename = `bella-backup-${stamp()}.${format}${gzip ? ".gz" : ""}`;

    res.setHeader(
      "Content-Type",
      gzip ? "application/gzip" : "application/json; charset=utf-8"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // A dump must never be cached by a proxy or by the browser.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Lets the browser read the generated name from a fetch() download.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    // When gzipping we write into the compressor and it writes into the
    // response; otherwise we write to the response directly.
    const gz = gzip ? zlib.createGzip({ level: 6 }) : null;
    const sink = gz ?? res;
    if (gz) gz.pipe(res);

    // Back-pressure aware write: without this, a fast cursor would outrun a
    // slow client and buffer the entire database in memory.
    const write = (chunk) =>
      new Promise((resolve, reject) => {
        if (sink.write(chunk)) return resolve();
        sink.once("drain", resolve);
        sink.once("error", reject);
      });

    let aborted = false;
    req.on("aborted", () => {
      aborted = true;
    });

    let documents = 0;

    try {
      const meta = {
        app: "bella-perfume",
        schemaVersion: 1,
        database: db.databaseName,
        generatedAt: new Date().toISOString(),
        format,
        includesSecrets: includeSecrets,
        collections: names,
      };

      if (format === "ndjson") {
        // One JSON object per line: cheap to process without parsing the whole
        // file at once, and restorable with mongoimport.
        await write(`${JSON.stringify({ type: "meta", ...meta })}\n`);
        for (const name of names) {
          if (aborted) break;
          const cursor = db.collection(name).find({}, { batchSize: 500 });
          for await (const doc of cursor) {
            if (aborted) break;
            const payload = includeSecrets ? doc : redact(doc);
            await write(
              `${JSON.stringify({ type: "doc", collection: name, doc: payload })}\n`
            );
            documents += 1;
          }
          await cursor.close().catch(() => {});
        }
      } else {
        // A single JSON document, assembled piece by piece so it never exists
        // in memory as one big string.
        await write(`{"meta":${JSON.stringify(meta)},"collections":{`);
        let firstCollection = true;
        for (const name of names) {
          if (aborted) break;
          await write(`${firstCollection ? "" : ","}${JSON.stringify(name)}:[`);
          firstCollection = false;

          const cursor = db.collection(name).find({}, { batchSize: 500 });
          let firstDoc = true;
          for await (const doc of cursor) {
            if (aborted) break;
            const payload = includeSecrets ? doc : redact(doc);
            await write(`${firstDoc ? "" : ","}${JSON.stringify(payload)}`);
            firstDoc = false;
            documents += 1;
          }
          await cursor.close().catch(() => {});
          await write("]");
        }
        await write("}}");
      }

      await new Promise((resolve, reject) => {
        // end() must be awaited, otherwise the request can finish before the
        // gzip trailer is flushed and the file arrives corrupt.
        sink.end(() => resolve());
        sink.once("error", reject);
      });

      logActivity(req, {
        action: "backup-export",
        target: db.databaseName,
        success: !aborted,
        meta: `format=${format} gzip=${gzip ? 1 : 0} secrets=${
          includeSecrets ? 1 : 0
        } docs=${documents}${aborted ? " aborted" : ""}`,
      });
    } catch (err) {
      logActivity(req, {
        action: "backup-export",
        target: db.databaseName,
        success: false,
        meta: `failed after ${documents} docs: ${err?.message || "unknown"}`,
      });
      // Headers are already on the wire, so a JSON error body is impossible.
      // Destroying the socket makes the download fail loudly instead of handing
      // the owner a silently truncated backup they might rely on.
      res.destroy(err);
    }
  })
);

export default router;
