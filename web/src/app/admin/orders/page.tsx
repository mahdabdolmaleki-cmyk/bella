"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import OrdersAdmin from "@/components/admin/OrdersAdmin";
import type { Order, Message } from "@/lib/types";

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [oRes, mRes] = await Promise.all([
          fetch("/api/admin/orders"),
          fetch("/api/admin/messages"),
        ]);
        if (oRes.status === 401 || mRes.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!oRes.ok || !mRes.ok) {
          setError("خطا در دریافت اطلاعات.");
          return;
        }
        const oData = await oRes.json();
        const mData = await mRes.json();
        setOrders(oData.orders ?? []);
        setMessages(mData.messages ?? []);
      } catch {
        setError("خطا در برقراری ارتباط با سرور.");
      }
    })();
  }, [router]);

  return (
    <AdminShell>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !orders || !messages ? (
        <div className="flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : (
        <OrdersAdmin initialOrders={orders} initialMessages={messages} />
      )}
    </AdminShell>
  );
}
