import fs from "fs";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "products");

// BUG FIX: the folder never existed, so multer failed with ENOENT on the very
// first upload. Create it (recursively) at start-up.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || "bin";
    // Fully random name — the client-supplied filename is never used, so path
    // traversal (../../) and double extensions (shell.php.jpg) are impossible.
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 }, // 5MB, one file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED[file.mimetype] && (ext === "" || ALLOWED_EXT.has(ext))) cb(null, true);
    else cb(new Error("فقط تصاویر jpg، png، webp یا gif مجاز است."));
  },
});

// The mimetype sent by the browser is attacker-controlled, so verify the real
// file signature (magic bytes) after the upload finished.
const SIGNATURES = [
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

export function isRealImage(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);

    for (const sig of SIGNATURES) {
      if (sig.bytes.every((b, i) => buf[i] === b)) return true;
    }
    // WEBP = "RIFF" .... "WEBP"
    if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function removeFile(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}
