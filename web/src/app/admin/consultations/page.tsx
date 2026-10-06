"use client";
import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { Loader2 } from "lucide-react";

type Consultation = {
  id: number;
  forWhom: string;
  gender: string;
  ageRange: string;
  occasions: string[];
  image: string[];
  scentStylesLiked: string[];
  mostImportantCriteria: string;
  desiredEffect: string;
  budget: string;
  name: string;
  phone: string;
  recommendedProductId: number | null;
  recommendation: { productName: string; why: string; feeling: string; suitableFor: string; bestTime: string; similar: string[] };
  status: string;
  createdAt: string;
};

export default function ConsultationsAdmin() {
  const [list, setList] = useState<Consultation[] | null>(null);
  const load = async () => {
    const res = await fetch("/api/admin/consultations");
    const data = await res.json();
    setList(data.consultations || []);
  };
  useEffect(() => { load(); }, []);
  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/admin/consultations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  };
  return (
    <AdminShell>
      <h1 className="text-xl font-black text-cream">مشاوره عطر — ۹ سوالی</h1>
      {!list ? <div className="mt-6 flex gap-2 text-sage"><Loader2 size={16} className="animate-spin" /> بارگذاری...</div> : list.length===0 ? <p className="mt-6 text-sage">خالی</p> : (
        <div className="mt-6 space-y-4">
          {list.map((c)=>(
            <div key={c.id} className="rounded-2xl border border-gold/15 glass-panel p-4">
              <div className="flex justify-between"><span className="text-gold font-bold">#{c.id} {c.name} {c.phone}</span><span className="text-[11px] text-sage">{new Date(c.createdAt).toLocaleString("fa-IR")}</span></div>
              <p className="mt-2 text-[12px] text-sage">برای: {c.forWhom} | جنسیت: {c.gender} | سن: {c.ageRange} | موقعیت: {c.occasions.join("، ")} | تصویر: {c.image.join("، ")} | رایحه: {c.scentStylesLiked.join("، ")} | معیار: {c.mostImportantCriteria} | اثر: {c.desiredEffect} | بودجه: {c.budget}</p>
              <div className="mt-2 rounded bg-gold/5 p-2 text-[12px]"><b className="text-gold">{c.recommendation.productName}</b> — {c.recommendation.why}<br/>حس: {c.recommendation.feeling}<br/>بهترین زمان: {c.recommendation.bestTime}</div>
              <div className="mt-2 flex gap-1">{["جدید","بررسی شد","پاسخ داده شد"].map((s)=><button key={s} onClick={()=>updateStatus(c.id,s)} className={`rounded-full border px-3 py-1 text-[11px] ${c.status===s?"bg-gold/15 border-gold text-gold":"border-gold/20 text-sage"}`}>{s}</button>)}</div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
