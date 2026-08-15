import type { SocialIconKey } from "@/lib/socials";

/**
 * آیکن شبکه‌های اجتماعی.
 *
 * عمداً آیکن خام SVG است و نه تصویر آپلودی، چون مدیر فقط باید از یک
 * فهرست انتخاب کند و درگیر آپلود لوگو و پس‌زمینهٔ شفاف نشود. همهٔ مسیرها
 * در viewBox ۲۴×۲۴ و با currentColor رنگ می‌گیرند.
 */
export default function SocialGlyph({
  icon,
  size = 22,
}: {
  icon: SocialIconKey;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (icon) {
    case "telegram":
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.9 4.3 18.9 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L6.9 12.9 2.3 11.5c-1-.3-1-1 .2-1.5l18-6.9c.8-.3 1.6.2 1.4 1.2z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3" y="3" width="18" height="18" rx="5.5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.4-.2-3 .8.8-2.9-.2-.4A8 8 0 0 1 12 4zm-3.3 4.4c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.8 4.3 3.8 2.1.8 2.6.7 3 .6.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.1-.7.1l-.8 1c-.1.2-.3.2-.6.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.3 0-.5.1-.6l.5-.6c.1-.2.1-.4 0-.6l-.8-2c-.2-.4-.4-.4-.6-.4z" />
        </svg>
      );
    case "rubika":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2zm0 4.2 5.2 2.6L12 11.4 6.8 8.8 12 6.2zM5.5 10.6 11 13.3v5.4l-5.5-2.7v-5.4zm7.5 8.1v-5.4l5.5-2.7v5.4L13 18.7z" />
        </svg>
      );
    case "eitaa":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 6.3-1.7 8c-.1.6-.5.7-1 .4l-2.7-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.8 5-4.5c.2-.2-.1-.3-.4-.1l-6.2 3.9-2.7-.8c-.6-.2-.6-.6.1-.9l10.5-4c.5-.2 1 .1.8.7z" />
        </svg>
      );
    case "bale":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2.2 4.4 6.4v8.4L12 21.8l7.6-7V6.4L12 2.2zm0 3.6 4.4 2.4-4.4 2.4-4.4-2.4L12 5.8zM6.6 10.2l4.3 2.4v5.1l-4.3-4v-3.5zm6.5 7.5v-5.1l4.3-2.4v3.5l-4.3 4z" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M3 12h18M12 2.8c2.5 2.6 3.8 5.8 3.8 9.2S14.5 18.6 12 21.2C9.5 18.6 8.2 15.4 8.2 12S9.5 5.4 12 2.8z" />
        </svg>
      );
  }
}
