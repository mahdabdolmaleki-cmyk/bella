"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  PenLine,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Eye,
  EyeOff,
  Tags,
} from "lucide-react";
import { toFa } from "@/lib/data";
import type { CategoryNode } from "@/lib/categories";

/**
 * مدیریت دسته‌بندی درختی.
 * ادمین می‌تواند دسته بسازد (در هر سطحی)، نامش را عوض کند، جابه‌جا/حذف کند
 * و فعال/غیرفعالش کند. حذف یک دسته، فرزندان و محصولاتش را به والدش می‌برد.
 */
export default function CategoriesAdmin() {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [addUnder, setAddUnder] = useState<number | null | undefined>(undefined);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/categories");
    if (r.ok) {
      const d = await r.json();
      setTree(d.categories || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (d: unknown, fb: string) => {
    setMsg((d as { error?: string })?.error || fb);
    setTimeout(() => setMsg(""), 3500);
  };

  const call = async (method: string, path: string, body?: unknown, okMsg?: string) => {
    setBusy(true);
    try {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return fail(d, "خطا در عملیات.");
      await load();
      if (okMsg) {
        setMsg(okMsg);
        setTimeout(() => setMsg(""), 2500);
      }
    } catch {
      fail(null, "خطا در برقراری ارتباط با سرور.");
    } finally {
      setBusy(false);
      setEditId(null);
      setAddUnder(undefined);
      setDraft("");
    }
  };

  const create = (parentId: number | null) => {
    const name = draft.trim();
    if (!name) return;
    void call("POST", "/api/admin/categories", { name, parentId }, "دسته ساخته شد.");
  };
  const rename = (id: number) => {
    const name = draft.trim();
    if (!name) return;
    void call("PUT", `/api/admin/categories/${id}`, { name }, "نام به‌روز شد.");
  };
  const remove = (n: CategoryNode) => {
    const kids = n.children?.length || 0;
    const warn = kids ? `\n(${toFa(kids)} زیرشاخه و محصولاتشان به دستهٔ والد منتقل می‌شوند.)` : "";
    if (!confirm(`دستهٔ «${n.name}» حذف شود؟${warn}`)) return;
    void call("DELETE", `/api/admin/categories/${n.id}`, undefined, "دسته حذف شد.");
  };
  const toggleActive = (n: CategoryNode) =>
    void call("PUT", `/api/admin/categories/${n.id}`, { active: n.active === false });
  const reorder = (siblings: CategoryNode[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const items = ids.map((id, i) => ({ id, order: i }));
    void call("POST", "/api/admin/categories/reorder", { items }, "ترتیب به‌روز شد.");
  };

  const AddRow = ({ parentId }: { parentId: number | null }) => (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create(parentId);
          if (e.key === "Escape") setAddUnder(undefined);
        }}
        placeholder="نام دستهٔ جدید…"
        className="w-48 rounded-lg border border-gold/25 bg-transparent px-2.5 py-1.5 text-xs text-cream focus:outline-none"
      />
      <button onClick={() => create(parentId)} className="rounded-lg border border-emerald-400/40 p-1.5 text-emerald-300" aria-label="افزودن">
        <Check size={14} />
      </button>
      <button
        onClick={() => {
          setAddUnder(undefined);
          setDraft("");
        }}
        className="rounded-lg border border-red-400/40 p-1.5 text-red-300"
        aria-label="انصراف"
      >
        <X size={14} />
      </button>
    </div>
  );

  const renderNodes = (nodes: CategoryNode[]) =>
    nodes.map((n, i) => (
      <li key={n.id} className="list-none">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/10 bg-gold/[0.03] px-2.5 py-2">
          <span className={`text-sm font-bold ${n.active === false ? "text-sage line-through" : "text-cream"}`}>
            {n.name}
          </span>
          {n.children && n.children.length > 0 ? (
            // دستهٔ دارای زیرشاخه: تعداد زیردسته‌هایش نمایش داده می‌شود.
            <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
              {toFa(n.children.length)} زیردسته
            </span>
          ) : (
            // برگ: تعداد محصولات خودش.
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-soft">
              {toFa(n.productCount || 0)} محصول
            </span>
          )}
          <div className="ms-auto flex items-center gap-1">
            {i > 0 && (
              <button onClick={() => reorder(nodes, i, -1)} className="rounded-lg p-1.5 text-sage hover:text-gold" aria-label="بالا">
                <ArrowUp size={14} />
              </button>
            )}
            {i < nodes.length - 1 && (
              <button onClick={() => reorder(nodes, i, 1)} className="rounded-lg p-1.5 text-sage hover:text-gold" aria-label="پایین">
                <ArrowDown size={14} />
              </button>
            )}
            <button
              onClick={() => toggleActive(n)}
              className={`rounded-lg p-1.5 ${n.active === false ? "text-sage" : "text-emerald-300"}`}
              aria-label="فعال/غیرفعال"
            >
              {n.active === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => {
                setEditId(n.id);
                setDraft(n.name);
                setAddUnder(undefined);
              }}
              className="rounded-lg p-1.5 text-sage hover:text-gold"
              aria-label="ویرایش نام"
            >
              <PenLine size={14} />
            </button>
            <button
              onClick={() => {
                setAddUnder(n.id);
                setDraft("");
                setEditId(null);
              }}
              className="rounded-lg p-1.5 text-sage hover:text-sky-300"
              aria-label="افزودن زیرشاخه"
            >
              <CornerDownLeft size={14} />
            </button>
            <button onClick={() => remove(n)} className="rounded-lg p-1.5 text-red-400/80 hover:text-red-400" aria-label="حذف">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {editId === n.id && (
          <div className="my-1.5 ms-4 flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename(n.id);
                if (e.key === "Escape") setEditId(null);
              }}
              className="w-48 rounded-lg border border-gold/25 bg-transparent px-2.5 py-1.5 text-xs text-cream focus:outline-none"
            />
            <button onClick={() => rename(n.id)} className="rounded-lg border border-emerald-400/40 p-1.5 text-emerald-300">
              <Check size={14} />
            </button>
            <button onClick={() => setEditId(null)} className="rounded-lg border border-red-400/40 p-1.5 text-red-300">
              <X size={14} />
            </button>
          </div>
        )}

        {addUnder === n.id && (
          <div className="my-1.5 ms-4">
            <AddRow parentId={n.id} />
          </div>
        )}

        {n.children && n.children.length > 0 && (
          <ul className="ms-4 mt-1.5 border-r border-gold/10 pr-3">{renderNodes(n.children)}</ul>
        )}
      </li>
    ));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sage">
        <Loader2 size={16} className="animate-spin" /> در حال بارگذاری دسته‌ها…
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tags className="text-gold" size={20} />
          <h1 className="text-lg font-black text-gold">دسته‌بندی محصولات</h1>
        </div>
        {addUnder === null ? (
          <AddRow parentId={null} />
        ) : (
          <button
            onClick={() => {
              setAddUnder(null);
              setDraft("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-black text-[#241a05]"
          >
            <Plus size={15} /> دستهٔ ریشهٔ جدید
          </button>
        )}
      </div>

      {msg && <p className="mt-3 text-xs text-gold-soft">{msg}</p>}

      <p className="mt-2 max-w-2xl text-xs text-sage">
        دسته‌ها درختی‌اند؛ برای ساختن زیرشاخه از دکمهٔ ↵ روی هر دسته استفاده کنید. انتخاب یک دسته
        در فروشگاه، محصولات همهٔ زیرشاخه‌هایش را هم نشان می‌دهد.
      </p>

      <div className="mt-4 rounded-2xl border border-gold/10 bg-gold/[0.02] p-3">
        {tree.length === 0 ? (
          <p className="py-6 text-center text-sm text-sage">هنوز دسته‌ای نیست. یک دستهٔ ریشه بسازید.</p>
        ) : (
          <ul>{renderNodes(tree)}</ul>
        )}
      </div>

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-xs text-sage">
          <Loader2 size={14} className="animate-spin" /> در حال اعمال…
        </div>
      )}
    </div>
  );
}
