"use client";
import type { CSSProperties } from "react";
import { iconTone, iconUrl, type IconName } from "@/lib/icons";

/**
 * Renders one icon from the self-hosted pack in `public/icons`.
 *
 * The SVG is applied as a CSS mask rather than an <img>, because a plain image
 * cannot be recoloured from CSS — it would always render in whatever colour is
 * baked into the file. With a mask the file supplies the *shape* and the
 * element's background supplies the *colour*, so every icon can carry its own
 * tone (see ICON_TONES) and a caller can still override it.
 *
 * Browsers without mask support fall back to the original SVG as a background
 * image; see the `.site-icon` rule in globals.css.
 */
export default function SiteIcon({
  name,
  size = 20,
  fallback = "sparkles",
  className = "",
  alt = "",
  tone,
}: {
  name?: string;
  size?: number;
  fallback?: IconName;
  className?: string;
  alt?: string;
  /**
   * Overrides the icon's built-in colour. Pass any CSS colour, or "current"
   * to inherit the surrounding text colour (useful for nav items that change
   * colour on hover / when active).
   */
  tone?: string;
}) {
  const url = `url("${iconUrl(name, fallback)}")`;
  const color = tone === "current" ? "currentColor" : (tone ?? iconTone(name, fallback));

  const style = {
    width: size,
    height: size,
    backgroundColor: color,
    WebkitMaskImage: url,
    maskImage: url,
    // Custom property drives the no-mask fallback in globals.css.
    "--icon-url": url,
  } as CSSProperties;

  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`site-icon ${className}`}
      style={style}
    />
  );
}
