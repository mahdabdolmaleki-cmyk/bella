// مدل‌های مشترک بخش آموزش (آکادمی بلّا).
// هم صفحات عمومی و هم پنل ادمین از همین تایپ‌ها استفاده می‌کنند.

export type TutorialBlockType = "text" | "image" | "video" | "note";

export type TutorialBlock = {
  type: TutorialBlockType;
  text: string;
  src: string;
};

export type TutorialCard = {
  id: number;
  title: string;
  category: string;
  excerpt: string;
  cover: string;
  hasVideo: boolean;
  likes: number;
  dislikes: number;
  views: number;
  createdAt: string;
};

export type TutorialDTO = TutorialCard & {
  video: string;
  blocks: TutorialBlock[];
};

export type TutorialAdminDTO = TutorialDTO & {
  published: boolean;
  order: number;
  updatedAt: string;
};

export type TutorialComment = {
  id: number;
  tutorial: number;
  name: string;
  body: string;
  createdAt: string;
  reply: { body: string; author: string; at: string | null } | null;
};

export type TutorialCommentAdmin = TutorialComment & {
  status: "pending" | "approved" | "rejected";
  user: string | null;
};

export const BLOCK_LABELS: Record<TutorialBlockType, string> = {
  text: "متن",
  image: "عکس",
  video: "ویدئو",
  note: "نکته",
};

/**
 * نشانی ویدئو را به چیزی که واقعاً قابل پخش است ترجمه می‌کند.
 *
 * کاربر معمولاً لینک صفحهٔ آپارات/یوتیوب را کپی می‌کند، نه لینک embed را؛
 * اگر همان را داخل iframe بگذاریم صفحهٔ خالی نشان می‌دهد. پس خودمان
 * تبدیلش می‌کنیم.
 */
export function videoEmbed(
  raw: string,
): { kind: "file" | "iframe"; src: string } | null {
  const url = (raw || "").trim();
  if (!url) return null;

  // فایل مستقیم (آپلود خودمان یا mp4 خارجی)
  if (/^[/]uploads[/]/.test(url) || /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(url)) {
    return { kind: "file", src: url };
  }

  const youtube = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
  if (youtube) {
    return { kind: "iframe", src: "http" + "s://www.youtube.com/embed/" + youtube[1] };
  }

  // آپارات: هم /v/XXXX هم فرم embed رسمی‌اش.
  const aparat = /aparat\.com\/(?:v\/|video\/video\/embed\/videohash\/)([A-Za-z0-9]+)/.exec(url);
  if (aparat) {
    return {
      kind: "iframe",
      src:
        "http" +
        "s://www.aparat.com/video/video/embed/videohash/" +
        aparat[1] +
        "/vt/frame",
    };
  }

  // هر نشانی https دیگری را مستقیم در iframe می‌گذاریم.
  if (/^https:[/][/]/i.test(url)) return { kind: "iframe", src: url };
  return null;
}

/** تاریخ خوانای فارسی برای کارت‌ها و نظرات. */
export function faDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}
