"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/lib/types";

// کد یک‌بارمصرف می‌تواند با پیامک یا ایمیل فرستاده شود؛ کاربر انتخاب می‌کند.
export type OtpChannel = "sms" | "email";

// در پروفایل، کاربر می‌تواند همهٔ این فیلدها — حتی ایمیل و شماره — را ویرایش کند.
type ProfileInput = Partial<
  Pick<User, "name" | "email" | "phone" | "address" | "province" | "city" | "postalCode">
>;

type LoginInput = {
  phone?: string;
  email?: string;
  ticket: string;
  name?: string;
};

// وقتی شمارهٔ مدیر اصلی وارد شود، سرور به‌جای کاربر، { admin: true } برمی‌گرداند.
type LoginResult = { admin: boolean; user: User | null };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  logout: () => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<void>;
  refresh: () => Promise<void>;
  requestOtp: (opts: {
    phone?: string;
    email?: string;
    channel?: OtpChannel;
  }) => Promise<{ retryAfter: number; devCode?: string; sentTo?: string; channel: OtpChannel }>;
  verifyOtp: (opts: { phone?: string; email?: string; code: string }) => Promise<string>;
};

const Ctx = createContext<AuthCtx | null>(null);

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
};

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || "خطایی رخ داد.");
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // تنها راه ورود: کد یک‌بارمصرف. اگر سرور admin=true بدهد، کاربر مدیر است
  // و نشست مشتری ساخته نمی‌شود؛ صفحه باید به /admin هدایت کند.
  const login = useCallback(async (input: LoginInput): Promise<LoginResult> => {
    const data = await jsonFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (data?.admin) {
      setUser(null);
      return { admin: true, user: null };
    }
    setUser(data.user ?? null);
    return { admin: false, user: data.user ?? null };
  }, []);

  const requestOtp = useCallback(
    async (opts: { phone?: string; email?: string; channel?: OtpChannel }) => {
      const channel: OtpChannel = opts.channel === "email" ? "email" : "sms";
      const data = await jsonFetch("/api/otp/request", {
        method: "POST",
        body: JSON.stringify({
          channel,
          ...(opts.phone ? { phone: opts.phone } : {}),
          ...(opts.email ? { email: opts.email } : {}),
        }),
      });
      return {
        retryAfter: Number(data?.retryAfter) || 60,
        devCode: data?.devCode,
        sentTo: data?.sentTo,
        channel: (data?.channel === "email" ? "email" : channel) as OtpChannel,
      };
    },
    []
  );

  const verifyOtp = useCallback(
    async (opts: { phone?: string; email?: string; code: string }) => {
      const data = await jsonFetch("/api/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          code: opts.code,
          ...(opts.phone ? { phone: opts.phone } : {}),
          ...(opts.email ? { email: opts.email } : {}),
        }),
      });
      return String(data?.ticket || "");
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore network errors on logout */
    }
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    const data = await jsonFetch("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    setUser(data.user);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateProfile,
        refresh,
        requestOtp,
        verifyOtp,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
