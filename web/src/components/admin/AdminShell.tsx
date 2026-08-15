"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Settings,
  Users,
  ScrollText,
  MessageSquare,
  Send,
  GraduationCap,
  DatabaseBackup,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { CrestImg } from "@/components/art";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Tailwind text colour for this entry's icon. */
  tint: string;
  exact?: boolean;
  // Hidden from staff admins and viewers. The server enforces this too — hiding
  // a link on its own would never be a real restriction.
  ownerOnly?: boolean;
};

const NAV: NavItem[] = [
  // Each entry keeps its own icon colour in every nav (sidebar, drawer and the
  // mobile bottom bar), so sections stay recognisable at a glance.
  {
    href: "/admin",
    label: "داشبورد",
    icon: LayoutDashboard,
    exact: true,
    tint: "text-sky-300",
  },
  { href: "/admin/products", label: "محصولات", icon: Package, tint: "text-amber-300" },
  { href: "/admin/orders", label: "سفارش‌ها", icon: ShoppingBag, tint: "text-emerald-300" },
  {
    href: "/admin/reviews",
    label: "نقد و بررسی‌ها",
    icon: MessageSquare,
    tint: "text-fuchsia-300",
  },
  { href: "/admin/users", label: "مدیریت کاربران", icon: Users, tint: "text-violet-300" },
  {
    href: "/admin/tutorials",
    label: "آموزش‌ها",
    icon: GraduationCap,
    tint: "text-lime-300",
  },
  { href: "/admin/notifications", label: "اطلاع‌رسانی", icon: Send, tint: "text-cyan-300" },
  { href: "/admin/logs", label: "لاگ فعالیت‌ها", icon: ScrollText, tint: "text-slate-300" },
  { href: "/admin/settings", label: "تنظیمات سایت", icon: Settings, tint: "text-gold-soft" },
  {
    href: "/admin/backup",
    label: "پشتیبان‌گیری",
    icon: DatabaseBackup,
    ownerOnly: true,
    tint: "text-rose-300",
  },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // RESPONSIVE FIX: seven nav items never fitted in a fixed bottom bar, so
  // small screens now get a proper slide-in drawer instead.
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // Close the drawer whenever the route changes, and lock body scrolling while
  // it is open so the page behind it does not move under the finger.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Owner-only links stay hidden until the role is known, so a staff admin
  // never sees them flash on screen during the first render.
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setRole(d?.role ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const nav = NAV.filter((item) => !item.ownerOnly || role === "owner");
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const logout = async () => {
    // Even if the request fails, the user must still land on the login page.
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    // ورود/خروج مدیر اکنون از صفحهٔ حساب کاربری انجام می‌شود.
    router.push("/account");
    router.refresh();
  };

  return (
    <div dir="rtl" className="flex min-h-screen bg-night text-cream">
      {/* Sidebar — پیش‌تر یک مستطیل سبز تخت بود که با بقیهٔ سایت جور درنمی‌آمد.
          حالا همان شیشهٔ تیرهٔ سایت با یک مهّ طلایی بسیار کمرنگ از بالاست. */}
      <aside className="glass-bar fixed inset-y-0 right-0 z-40 hidden w-60 flex-col border-l border-gold/15 bg-gradient-to-b from-gold/[0.06] via-transparent to-transparent px-4 py-6 lg:flex">
        <div className="flex items-center gap-2 px-1">
          <CrestImg className="w-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-gold">پنل مدیریت بلّا</p>
            <p className="text-[10px] text-sage">Bella Perfume Admin</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  active
                    ? "border border-gold/30 bg-gold/15 text-gold shadow-[0_6px_18px_-10px_rgba(212,175,55,0.7)]"
                    : "border border-transparent text-sage hover:border-gold/15 hover:bg-gold/5 hover:text-gold-soft"
                }`}
              >
                <Icon size={17} className={item.tint} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-gold/10 pt-4">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold text-sage hover:bg-gold/5 hover:text-gold-soft"
          >
            <ExternalLink size={17} />
            مشاهده سایت
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-right text-sm font-bold text-sage hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={17} />
            خروج از پنل
          </button>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-gold/15 glass-bar px-3 py-2.5 lg:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          className="rounded-xl border border-gold/25 p-2 text-gold active:bg-gold/10"
          aria-label="منوی مدیریت"
        >
          <Menu size={18} />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <CrestImg className="w-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-black text-gold">
              {nav.find((item) => (item.exact ? pathname === item.href : pathname?.startsWith(item.href)))
                ?.label || "پنل مدیریت"}
            </p>
            <p className="truncate text-[9.5px] text-sage">پنل مدیریت بلّا</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="rounded-xl border border-red-400/30 p-2 text-red-300 active:bg-red-400/10"
          aria-label="خروج"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Slide-in drawer (mobile + tablet) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="بستن منو"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 right-0 flex w-[17rem] max-w-[86vw] flex-col border-l border-gold/20 bg-night px-4 py-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <CrestImg className="w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gold">پنل مدیریت بلّا</p>
                  <p className="text-[10px] text-sage">Bella Perfume Admin</p>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1.5 text-sage active:text-gold"
                aria-label="بستن"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto">
              {nav.map((item) => {
                const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-bold transition-colors ${
                      active ? "bg-gold/15 text-gold" : "text-sage active:bg-gold/5"
                    }`}
                  >
                    <Icon size={17} className={item.tint} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-col gap-1 border-t border-gold/10 pt-3">
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold text-sage active:text-gold-soft"
              >
                <ExternalLink size={17} />
                مشاهده سایت
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-right text-sm font-bold text-red-300 active:bg-red-500/10"
              >
                <LogOut size={17} />
                خروج از پنل
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile bottom nav — scrollable so labels are never clipped */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 overflow-x-auto border-t border-gold/15 glass-bar px-2 py-1.5 lg:hidden">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[4.6rem] shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9.5px] font-bold ${
                active ? "bg-gold/12 text-gold" : "text-sage"
              }`}
            >
              <Icon size={17} className={item.tint} />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="min-h-screen w-full min-w-0 flex-1 px-3 pt-16 pb-24 sm:px-5 lg:mr-60 lg:px-8 lg:pt-8 lg:pb-10">
        {children}
      </main>
    </div>
  );
}
