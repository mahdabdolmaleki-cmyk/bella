/**
 * آماده‌سازی عکس برای آپلود در پنل ادمین.
 *
 * چرا این لازم است:
 *  ۱) عکس‌های دوربین گوشی امروز به‌راحتی ۴ تا ۱۰ مگابایت‌اند و سقف آپلود
 *     سرور را رد می‌کنند؛ ادمین هم فقط یک خطا می‌دید.
 *  ۲) بعضی گوشی‌های اندروید mimetype را «image/jpg» می‌فرستند و آیفون‌ها
 *     HEIC — که قبلاً آپلود را با خطای ۵۰۰ می‌شکست.
 *  ۳) عکس ۶ مگابایتیِ محصول در سایت هم فقط浪费 پهنای باند است.
 *
 * راه‌حل: اگر فایل بزرگ‌تر از حد یا فرمتش نامناسب باشد، با canvas به JPEG
 * حداکثر ۱۶۰۰ پیکسل با کیفیت ۰.۸۵ تبدیل می‌شود — همیشه سبک، همیشه قابل
 * نمایش در همهٔ مرورگرها. HEIC فقط در سافاری decode می‌شود؛ در بقیهٔ
 * مرورگرها همان فایل اصلی می‌رود و سرور پیام روشن HEIC برمی‌گرداند.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
/** عکس‌های کوچک‌تر از این نیازی به فشرده‌سازی ندارند. */
const COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;

const DIRECT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type PreparedImage = {
  file: File | Blob;
  /** نام فایل با پسند درست (سرور پسوند را بررسی می‌کند). */
  fileName: string;
  /** آیا فشرده‌سازی انجام شد؟ فقط برای لاگ/UI. */
  compressed: boolean;
};

async function canvasToJpeg(blob: Blob): Promise<Blob | null> {
  // آدرس امن برای decode — blob: در CSP مجاز است.
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // پس‌زمینهٔ سفید: عکس‌های JPEG بدون کانال آلفا مشکل رنگی نمی‌گیرند
    if (blob.type === "image/png" || blob.type === "image/webp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((out) => resolve(out), "image/jpeg", JPEG_QUALITY),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** عکس را برای آپلود آماده می‌کند (در صورت نیاز فشرده/تبدیل می‌شود). */
export async function prepareImageForUpload(input: File): Promise<PreparedImage> {
  const type = (input.type || "").toLowerCase();

  const needsWork =
    !DIRECT_TYPES.has(type) || input.size > COMPRESS_THRESHOLD || type === "image/jpg";

  if (needsWork) {
    const converted = await canvasToJpeg(input);
    // اگر decode شد (حتی HEIC در سافاری) خروجی همیشه JPEG تمیز است.
    if (converted && (converted.size < input.size || !DIRECT_TYPES.has(type))) {
      return {
        file: converted,
        fileName: "photo.jpg",
        compressed: true,
      };
    }
  }

  // فایل از قبل مناسب است — یا decode ممکن نبود (HEIC در کروم) که خودِ سرور
  // پیام روشن برمی‌گرداند.
  const ext = (input.name.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();
  return { file: input, fileName: input.name || `photo${ext}`, compressed: false };
}

/** FormData آمادهٔ ارسال به /api/admin/upload */
export function uploadForm(prepared: PreparedImage): FormData {
  const form = new FormData();
  form.append("file", prepared.file, prepared.fileName);
  return form;
}
