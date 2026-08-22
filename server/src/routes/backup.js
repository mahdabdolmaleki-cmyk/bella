import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import * as tar from "tar";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import { requireAdmin, requireOwner } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import {
  beginExclusiveOperation,
  endExclusiveOperation,
} from "../utils/restoreState.js";

/**
 * Full backup package (owner only)
 * --------------------------------
 * One .tar.gz contains:
 *   manifest.json    integrity hashes and package metadata
 *   database.ndjson  canonical MongoDB Extended JSON, including indexes
 *   uploads/**       every uploaded image/video
 *
 * Restore validates and stages everything before touching live data. Database
 * collections are swapped by rename and the uploads directory is swapped on
 * the same filesystem. If commit fails, both are rolled back.
 */

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const UPLOADS_ROOT = path.join(SERVER_ROOT, "uploads");
const WORK_ROOT = path.join(SERVER_ROOT, ".backup-work");
const EJSON = mongoose.mongo.BSON.EJSON;
const PACKAGE_VERSION = 1;
const DATABASE_SCHEMA_VERSION = 2;
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024; // compressed upload: 1 GiB
const MAX_EXTRACTED_BYTES = 5 * 1024 * 1024 * 1024; // zip-bomb guard: 5 GiB
const MAX_UPLOAD_FILES = 50_000;
const BATCH_SIZE = 500;

// Only temporary collections created by this backup/restore implementation
// are internal. Every application collection, including sessions and OTPs,
// belongs to a full backup and is restored without logical modification.
const INTERNAL_COLLECTION_RE = /^__(?:restore|previous)_/;

await fsp.mkdir(WORK_ROOT, { recursive: true });
await fsp.mkdir(UPLOADS_ROOT, { recursive: true });

router.use(requireAdmin, requireOwner);

const backupLimit = rateLimit({
  name: "admin-backup",
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "درخواست پشتیبان‌گیری بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
});

const restoreLimit = rateLimit({
  name: "admin-restore",
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "تعداد تلاش‌های بازیابی بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.",
});

class RestoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RestoreValidationError";
  }
}

function getDb() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return mongoose.connection.db;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-");
}

function jobToken() {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function validCollectionName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 100 &&
    !name.startsWith("system.") &&
    !INTERNAL_COLLECTION_RE.test(name) &&
    !/[\0$]/.test(name)
  );
}

async function listCollections(db) {
  const all = await db.listCollections({}, { nameOnly: true }).toArray();
  return all
    .map((item) => item.name)
    .filter(
      (name) => !name.startsWith("system.") && !INTERNAL_COLLECTION_RE.test(name)
    )
    .sort();
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function walkFiles(root, prefix = "") {
  const out = [];
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(root, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(absolute, relative)));
    } else if (entry.isFile()) {
      const stat = await fsp.stat(absolute);
      out.push({ absolute, relative: relative.replaceAll("\\", "/"), size: stat.size });
    }
  }
  return out;
}

async function writeLine(stream, value) {
  if (!stream.write(`${EJSON.stringify(value, { relaxed: false })}\n`)) {
    await once(stream, "drain");
  }
}

function indexForBackup(index) {
  const out = { key: index.key, name: index.name };
  for (const key of [
    "unique",
    "sparse",
    "expireAfterSeconds",
    "partialFilterExpression",
    "collation",
    "hidden",
  ]) {
    if (index[key] !== undefined) out[key] = index[key];
  }
  return out;
}

async function collectionIndexes(db, names) {
  const out = {};
  for (const name of names) {
    const indexes = await db.collection(name).listIndexes().toArray().catch(() => []);
    out[name] = indexes.map(indexForBackup);
  }
  return out;
}

async function buildDatabaseDump(db, filePath) {
  const names = await listCollections(db);
  const indexes = await collectionIndexes(db, names);
  const stream = fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  let documents = 0;

  try {
    await writeLine(stream, {
      type: "meta",
      app: "bella-perfume",
      schemaVersion: DATABASE_SCHEMA_VERSION,
      database: db.databaseName,
      generatedAt: new Date(),
      collections: names,
      indexes,
    });

    for (const name of names) {
      const cursor = db.collection(name).find({}, { batchSize: BATCH_SIZE });
      try {
        for await (const doc of cursor) {
          await writeLine(stream, { type: "doc", collection: name, doc });
          documents += 1;
        }
      } finally {
        await cursor.close().catch(() => {});
      }
    }
    stream.end();
    await once(stream, "finish");
  } catch (error) {
    stream.destroy();
    throw error;
  }

  const stat = await fsp.stat(filePath);
  return {
    names,
    documents,
    size: stat.size,
    sha256: await hashFile(filePath),
  };
}

async function uploadManifest(root = UPLOADS_ROOT) {
  const files = await walkFiles(root);
  const output = [];
  for (const file of files) {
    output.push({
      path: `uploads/${file.relative}`,
      size: file.size,
      sha256: await hashFile(file.absolute),
    });
  }
  return output;
}

export async function buildBackupPackage(db, jobDir) {
  await fsp.mkdir(jobDir, { recursive: true });
  const databasePath = path.join(jobDir, "database.ndjson");
  const packageUploads = path.join(jobDir, "uploads");
  const database = await buildDatabaseDump(db, databasePath);
  // Snapshot media into the job directory before hashing. Packaging a live
  // symlink could race with an upload/replacement and produce a hash mismatch.
  await fsp.cp(UPLOADS_ROOT, packageUploads, {
    recursive: true,
    force: true,
    dereference: false,
    filter: async (source) => {
      const stat = await fsp.lstat(source);
      return !stat.isSymbolicLink();
    },
  });
  const uploads = await uploadManifest(packageUploads);
  const manifest = {
    app: "bella-perfume",
    packageVersion: PACKAGE_VERSION,
    schemaVersion: DATABASE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    databaseFile: {
      path: "database.ndjson",
      size: database.size,
      sha256: database.sha256,
      documents: database.documents,
      collections: database.names.length,
    },
    uploads,
    uploadBytes: uploads.reduce((sum, file) => sum + file.size, 0),
  };
  await fsp.writeFile(
    path.join(jobDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 }
  );

  return manifest;
}

async function countUploads() {
  const files = await walkFiles(UPLOADS_ROOT);
  return {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Summary                                                            */
/* ------------------------------------------------------------------ */
router.get(
  "/summary",
  ah(async (_req, res) => {
    const db = getDb();
    if (!db) return res.status(503).json({ error: "اتصال به پایگاه داده برقرار نیست." });
    const names = await listCollections(db);
    const [collections, uploads] = await Promise.all([
      Promise.all(
        names.map(async (name) => ({
          name,
          count: await db.collection(name).estimatedDocumentCount().catch(() => 0),
        }))
      ),
      countUploads(),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({
      database: db.databaseName,
      generatedAt: new Date().toISOString(),
      collections,
      totalDocuments: collections.reduce((sum, item) => sum + item.count, 0),
      uploadFiles: uploads.files,
      uploadBytes: uploads.bytes,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Full export: database + uploads                                    */
/* ------------------------------------------------------------------ */
router.get(
  "/export",
  backupLimit,
  ah(async (req, res) => {
    const db = getDb();
    if (!db) return res.status(503).json({ error: "اتصال به پایگاه داده برقرار نیست." });

    if (!beginExclusiveOperation("backup")) {
      return res.status(409).json({ error: "یک عملیات پشتیبان دیگر در حال اجرا است." });
    }
    const jobDir = path.join(WORK_ROOT, `export-${jobToken()}`);
    let manifest;
    let lockHeld = true;
    try {
      manifest = await buildBackupPackage(db, jobDir);
      // The consistent snapshot now lives in jobDir; live traffic may resume
      // while that immutable package streams to the owner's browser.
      endExclusiveOperation("backup");
      lockHeld = false;
      const filename = `bella-full-backup-${stamp()}.tar.gz`;
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

      const archive = tar.c(
        {
          cwd: jobDir,
          gzip: true,
          portable: true,
          follow: false,
          noMtime: false,
        },
        ["manifest.json", "database.ndjson", "uploads"]
      );
      await pipeline(archive, res);
      logActivity(req, {
        action: "backup-export",
        target: db.databaseName,
        status: 200,
        meta: `docs=${manifest.databaseFile.documents} files=${manifest.uploads.length}`,
      });
    } catch (error) {
      logActivity(req, {
        action: "backup-export",
        target: db.databaseName,
        success: false,
        meta: error?.message || "unknown",
      });
      if (!res.headersSent) throw error;
      res.destroy(error);
    } finally {
      if (lockHeld) endExclusiveOperation("backup");
      await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  })
);

/* ------------------------------------------------------------------ */
/* Restore upload                                                     */
/* ------------------------------------------------------------------ */
const incomingDir = path.join(WORK_ROOT, "incoming");
await fsp.mkdir(incomingDir, { recursive: true });
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, incomingDir),
    filename: (_req, _file, callback) =>
      callback(null, `${jobToken()}.tar.gz`),
  }),
  limits: { fileSize: MAX_BACKUP_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, callback) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return callback(null, true);
    return callback(new Error("فقط فایل کامل tar.gz ساخته‌شده توسط همین پنل مجاز است."));
  },
});

function restoreUploadMiddleware(req, res, next) {
  restoreUpload.single("backup")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({
      error: tooLarge
        ? "حجم فایل پشتیبان بیشتر از ۱ گیگابایت است."
        : error.message || "بارگذاری فایل پشتیبان ناموفق بود.",
    });
  });
}

export function safeArchivePath(value) {
  const name = String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!name || name.startsWith("/") || name.split("/").includes("..")) return "";
  if (name === "manifest.json" || name === "database.ndjson") return name;
  if (name === "uploads" || name.startsWith("uploads/")) return name;
  return "";
}

export async function extractArchive(archivePath, extractDir) {
  let declaredBytes = 0;
  let declaredFiles = 0;
  const declaredPaths = new Set();
  await tar.t({
    file: archivePath,
    strict: true,
    onentry(entry) {
      const safe = safeArchivePath(entry.path);
      if (!safe) throw new RestoreValidationError("فایل پشتیبان شامل مسیر غیرمجاز است.");
      if (declaredPaths.has(safe)) {
        throw new RestoreValidationError("فایل پشتیبان شامل مسیر تکراری است.");
      }
      declaredPaths.add(safe);
      if (entry.type !== "File" && entry.type !== "Directory") {
        throw new RestoreValidationError("فایل پشتیبان شامل لینک یا ورودی غیرمجاز است.");
      }
      if (entry.type === "File") {
        declaredFiles += 1;
        declaredBytes += Number(entry.size) || 0;
        if (declaredFiles > MAX_UPLOAD_FILES + 2 || declaredBytes > MAX_EXTRACTED_BYTES) {
          throw new RestoreValidationError("حجم یا تعداد فایل‌های بازشده بیش از حد مجاز است.");
        }
      }
    },
  });

  await fsp.mkdir(extractDir, { recursive: true });
  await tar.x({
    file: archivePath,
    cwd: extractDir,
    strict: true,
    preservePaths: false,
    noChmod: true,
    filter(entryPath, entry) {
      const safe = safeArchivePath(entryPath);
      if (!safe) throw new RestoreValidationError("فایل پشتیبان شامل مسیر غیرمجاز است.");
      if (entry.type !== "File" && entry.type !== "Directory") {
        throw new RestoreValidationError("فایل پشتیبان شامل لینک یا ورودی غیرمجاز است.");
      }
      return true;
    },
  });
}

export async function validateExtractedPackage(extractDir) {
  const manifestPath = path.join(extractDir, "manifest.json");
  const databasePath = path.join(extractDir, "database.ndjson");
  const manifestStat = await fsp.stat(manifestPath).catch(() => null);
  if (!manifestStat || manifestStat.size > 2 * 1024 * 1024) {
    throw new RestoreValidationError("manifest فایل پشتیبان وجود ندارد یا معتبر نیست.");
  }

  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  } catch {
    throw new RestoreValidationError("manifest فایل پشتیبان قابل خواندن نیست.");
  }
  if (
    manifest?.app !== "bella-perfume" ||
    manifest?.packageVersion !== PACKAGE_VERSION ||
    manifest?.schemaVersion !== DATABASE_SCHEMA_VERSION
  ) {
    throw new RestoreValidationError("نسخه یا سازندهٔ فایل پشتیبان معتبر نیست.");
  }

  const dbStat = await fsp.stat(databasePath).catch(() => null);
  if (
    !dbStat ||
    dbStat.size !== manifest.databaseFile?.size ||
    (await hashFile(databasePath)) !== manifest.databaseFile?.sha256
  ) {
    throw new RestoreValidationError("دادهٔ MongoDB ناقص یا دست‌کاری‌شده است.");
  }

  const expected = new Map();
  let totalBytes = dbStat.size + manifestStat.size;
  if (!Array.isArray(manifest.uploads) || manifest.uploads.length > MAX_UPLOAD_FILES) {
    throw new RestoreValidationError("فهرست فایل‌های آپلودی معتبر نیست.");
  }
  for (const item of manifest.uploads) {
    const safe = safeArchivePath(item?.path);
    if (!safe || !safe.startsWith("uploads/") || expected.has(safe)) {
      throw new RestoreValidationError("فهرست فایل‌های آپلودی معتبر نیست.");
    }
    const size = Number(item.size);
    if (!Number.isSafeInteger(size) || size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new RestoreValidationError("مشخصات فایل آپلودی معتبر نیست.");
    }
    expected.set(safe, item);
    totalBytes += size;
    if (totalBytes > MAX_EXTRACTED_BYTES) {
      throw new RestoreValidationError("حجم بازشدهٔ فایل پشتیبان بیش از حد مجاز است.");
    }
  }

  const uploadsDir = path.join(extractDir, "uploads");
  await fsp.mkdir(uploadsDir, { recursive: true });
  const actualFiles = await walkFiles(uploadsDir);
  if (actualFiles.length !== expected.size) {
    throw new RestoreValidationError("تعداد فایل‌های آپلودی با manifest یکسان نیست.");
  }
  for (const file of actualFiles) {
    const key = `uploads/${file.relative}`;
    const item = expected.get(key);
    if (!item || file.size !== item.size || (await hashFile(file.absolute)) !== item.sha256) {
      throw new RestoreValidationError(`فایل آپلودی «${file.relative}» ناقص است.`);
    }
  }

  return { manifest, databasePath, uploadsDir };
}

function indexOptions(index) {
  const out = {};
  for (const key of [
    "name",
    "unique",
    "sparse",
    "expireAfterSeconds",
    "partialFilterExpression",
    "collation",
    "hidden",
  ]) {
    if (index?.[key] !== undefined) {
      out[key] = key === "expireAfterSeconds" ? Number(index[key]) : index[key];
    }
  }
  return out;
}

async function dropInternalCollections(db) {
  const all = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of all) {
    if (INTERNAL_COLLECTION_RE.test(name)) {
      await db.collection(name).drop().catch(() => {});
    }
  }
}

export async function stageDatabase(db, databasePath, token, expectedDocuments = null) {
  await dropInternalCollections(db);
  const input = fs.createReadStream(databasePath);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) throw new RestoreValidationError("فایل database.ndjson خالی است.");

  let meta;
  try {
    meta = EJSON.parse(first.value, { relaxed: false });
  } catch {
    throw new RestoreValidationError("متادیتای MongoDB معتبر نیست.");
  }
  if (
    meta?.type !== "meta" ||
    meta?.app !== "bella-perfume" ||
    Number(meta?.schemaVersion) !== DATABASE_SCHEMA_VERSION ||
    !Array.isArray(meta.collections)
  ) {
    throw new RestoreValidationError("متادیتای MongoDB با این نسخه سازگار نیست.");
  }

  const names = [...new Set(meta.collections)];
  if (names.length !== meta.collections.length || names.some((name) => !validCollectionName(name))) {
    throw new RestoreValidationError("نام collection در فایل پشتیبان معتبر نیست.");
  }

  const stages = new Map();
  try {
    for (const [index, name] of names.entries()) {
      const stage = `__restore_${token.slice(-12)}_${index}`;
      await db.createCollection(stage);
      stages.set(name, stage);
    }
  } catch (error) {
    for (const stage of stages.values()) await db.collection(stage).drop().catch(() => {});
    throw error;
  }

  const batches = new Map(names.map((name) => [name, []]));
  let documents = 0;
  const flush = async (name) => {
    const docs = batches.get(name);
    if (!docs?.length) return;
    await db.collection(stages.get(name)).insertMany(docs, {
      ordered: true,
      bypassDocumentValidation: true,
    });
    docs.length = 0;
  };

  try {
    for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = EJSON.parse(line, { relaxed: false });
      } catch {
        throw new RestoreValidationError("یکی از رکوردهای MongoDB معتبر نیست.");
      }
      if (
        entry?.type !== "doc" ||
        !stages.has(entry.collection) ||
        !entry.doc ||
        typeof entry.doc !== "object" ||
        Array.isArray(entry.doc)
      ) {
        throw new RestoreValidationError("ساختار یکی از رکوردهای MongoDB معتبر نیست.");
      }
      const batch = batches.get(entry.collection);
      batch.push(entry.doc);
      documents += 1;
      if (batch.length >= BATCH_SIZE) await flush(entry.collection);
    }
    for (const name of names) await flush(name);
    if (expectedDocuments !== null && documents !== Number(expectedDocuments)) {
      throw new RestoreValidationError("تعداد رکوردهای MongoDB با manifest یکسان نیست.");
    }

    // Build every original index before commit. Unique-index conflicts therefore
    // fail while live data is still untouched.
    for (const name of names) {
      const indexes = Array.isArray(meta.indexes?.[name]) ? meta.indexes[name] : [];
      for (const index of indexes) {
        if (index?.name === "_id_" || !index?.key || typeof index.key !== "object") continue;
        const keySpec = Object.fromEntries(
          Object.entries(index.key).map(([field, direction]) => [
            field,
            typeof direction === "string" ? direction : Number(direction),
          ])
        );
        await db.collection(stages.get(name)).createIndex(keySpec, indexOptions(index));
      }
    }

  } catch (error) {
    for (const stage of stages.values()) await db.collection(stage).drop().catch(() => {});
    throw error;
  } finally {
    lines.close();
    input.destroy();
  }

  return { stages, documents, collections: names.length };
}

export async function swapDatabase(db, stages, token) {
  const current = await listCollections(db);
  const previous = new Map();
  const movedCurrent = [];
  const activated = [];

  try {
    for (const [index, name] of current.entries()) {
      const previousName = `__previous_${token.slice(-12)}_${index}`;
      await db.collection(name).rename(previousName, { dropTarget: true });
      previous.set(name, previousName);
      movedCurrent.push(name);
    }
    for (const [name, stage] of stages) {
      await db.collection(stage).rename(name, { dropTarget: true });
      activated.push(name);
    }
  } catch (error) {
    for (const name of activated.reverse()) {
      await db.collection(name).rename(stages.get(name), { dropTarget: true }).catch(() => {});
    }
    for (const name of movedCurrent.reverse()) {
      const previousName = previous.get(name);
      await db.collection(previousName).rename(name, { dropTarget: true }).catch(() => {});
    }
    throw error;
  }
  return previous;
}

async function swapUploads(newUploadsDir, jobDir) {
  const previous = path.join(jobDir, "previous-uploads");
  const hadPrevious = await fsp.stat(UPLOADS_ROOT).then(() => true).catch(() => false);
  if (hadPrevious) await fsp.rename(UPLOADS_ROOT, previous);
  try {
    await fsp.rename(newUploadsDir, UPLOADS_ROOT);
  } catch (error) {
    if (hadPrevious) await fsp.rename(previous, UPLOADS_ROOT).catch(() => {});
    throw error;
  }
  return { previous, hadPrevious };
}

async function rollbackUploads(state) {
  await fsp.rm(UPLOADS_ROOT, { recursive: true, force: true }).catch(() => {});
  if (state?.hadPrevious) await fsp.rename(state.previous, UPLOADS_ROOT).catch(() => {});
  else await fsp.mkdir(UPLOADS_ROOT, { recursive: true });
}

router.post(
  "/restore",
  restoreLimit,
  restoreUploadMiddleware,
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "فایل پشتیبان انتخاب نشده است." });
    const db = getDb();
    if (!db) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(503).json({ error: "اتصال به پایگاه داده برقرار نیست." });
    }
    if (!beginExclusiveOperation("restore")) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(409).json({ error: "یک بازیابی دیگر در حال اجرا است." });
    }

    const token = jobToken();
    const jobDir = path.join(WORK_ROOT, `restore-${token}`);
    const extractDir = path.join(jobDir, "package");
    let uploadState = null;
    let previousCollections = null;
    let staged = null;

    try {
      await extractArchive(req.file.path, extractDir);
      const validated = await validateExtractedPackage(extractDir);
      staged = await stageDatabase(
        db,
        validated.databasePath,
        token,
        validated.manifest.databaseFile.documents
      );

      uploadState = await swapUploads(validated.uploadsDir, jobDir);
      try {
        previousCollections = await swapDatabase(db, staged.stages, token);
      } catch (error) {
        await rollbackUploads(uploadState);
        uploadState = null;
        throw error;
      }

      // Commit succeeded. Remove the old database and old uploads only now.
      for (const previousName of previousCollections.values()) {
        await db.collection(previousName).drop().catch(() => {});
      }
      if (uploadState?.hadPrevious) {
        await fsp
          .rm(uploadState.previous, { recursive: true, force: true })
          .catch(() => {});
      }

      logActivity(req, {
        action: "backup-restore",
        target: db.databaseName,
        status: 200,
        meta: `docs=${staged.documents} collections=${staged.collections} files=${validated.manifest.uploads.length}`,
      });
      res.json({
        ok: true,
        restoredAt: new Date().toISOString(),
        documents: staged.documents,
        collections: staged.collections,
        uploadFiles: validated.manifest.uploads.length,
        uploadBytes: validated.manifest.uploadBytes || 0,
      });
    } catch (error) {
      if (staged?.stages) {
        for (const stage of staged.stages.values()) {
          await db.collection(stage).drop().catch(() => {});
        }
      }
      logActivity(req, {
        action: "backup-restore",
        target: db.databaseName,
        success: false,
        meta: error?.message || "unknown",
      });
      const validation = error instanceof RestoreValidationError;
      res.status(validation ? 400 : 500).json({
        error: validation
          ? error.message
          : "بازیابی کامل نشد و داده‌های قبلی حفظ شدند. گزارش سرور را بررسی کنید.",
      });
    } finally {
      endExclusiveOperation("restore");
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
      await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  })
);

export default router;
