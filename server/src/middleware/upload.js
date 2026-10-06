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
  // BUG FIX: خیلی از گوشی‌های اندروید/دوربین‌ها mimetype را «image/jpg»
  // (بدون e) می‌فرستند؛ قبلاً همین باعث رد شدن عکس‌های کاملاً سالم می‌شد.
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".gif"]);

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
  // 10MB, one file — BUG FIX: سقف ۵ مگابایت برای عکس‌های گوشی‌های امروزی
  // کم است؛ عکس معمولی دوربین موبایل به‌راحتی از ۵ مگابایت رد می‌شود.
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED[file.mimetype] && (ext === "" || ALLOWED_EXT.has(ext))) cb(null, true);
    else if (file.mimetype === "image/heic" || file.mimetype === "image/heif" || ext === ".heic" || ext === ".heif") {
      // آیفون‌ها به‌صورت پیش‌فرض HEIC می‌گیرند. مرورگرهای دسکتاپ این فرمت را
      // نمایش نمی‌دهند، پس با پیام روشن رد می‌شود نه خطای مبهم ۵۰۰.
      cb(new Error("عکس با فرمت HEIC پشتیبانی نمی‌شود. لطفاً در تنظیمات دوربین «Most Compatible» را انتخاب کنید یا عکس را به JPG تبدیل کنید."));
    }
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

// ===========================================================================
// VIDEO UPLOADS (v31) — مخصوص بخش آموزش
// ===========================================================================
// عمداً از آپلود عکس جداست: محدودیت حجم خیلی بزرگ‌تر است و اگر همان
// ۱۰۰ مگابایت را به آپلود تصویر می‌دادیم، مسیرهای قدیمی هم باز می‌شدند.
export const VIDEO_DIR = path.join(__dirname, "..", "..", "uploads", "videos");
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const ALLOWED_VIDEO = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mp4", // .mov — همان کانتینر MP4 است
};
const ALLOWED_VIDEO_EXT = new Set([".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".mov"]);

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_VIDEO[file.mimetype] || "mp4";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`);
  },
});

export const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 10 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_VIDEO[file.mimetype] && (ext === "" || ALLOWED_VIDEO_EXT.has(ext))) {
      cb(null, true);
    } else {
      cb(new Error("فقط ویدئوی mp4، webm یا mov مجاز است."));
    }
  },
});

/**
 * بررسی امضای واقعی فایل ویدئو.
 *
 * mimetype را مرورگر می‌فرستد و قابل جعل است؛ دقیقاً مثل عکس‌ها بعد از
 * آپلود، بایت‌های ابتدایی فایل را می‌خوانیم.
 *   MP4/MOV : بایت‌های ۴ تا ۷ برابر "ftyp"
 *   WebM    : 1A 45 DF A3 (هدر Matroska)
 *   OGG     : "OggS"
 */
export function isRealVideo(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);

    if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
    if (buf.slice(0, 4).toString("ascii") === "OggS") return true;
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

