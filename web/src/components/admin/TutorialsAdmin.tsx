"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  PenLine,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  GraduationCap,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Reply,
  Type,
  Film,
  Lightbulb,
} from "lucide-react";
import { toFa } from "@/lib/data";
import { prepareImageForUpload, uploadForm } from "@/lib/prepareUpload";
import {
  BLOCK_LABELS,
  faDate,
  type TutorialAdminDTO,
  type TutorialBlock,
  type TutorialBlockType,
  type TutorialCommentAdmin,
} from "@/lib/tutorials";

/* ====================================================================== */
/*  مدیریت آموزش‌ها                                                */
/*  دو تب: مطالب آموزشی و صف نظرات.                             */
/* ====================================================================== */

const EMPTY: TutorialAdminDTO = {
  id: 0,
  title: "",
  category: "عمومی",
  excerpt: "",
  cover: "",
  video: "",
  blocks: [],
  hasVideo: false,
  likes: 0,
  dislikes: 0,
  views: 0,
  published: true,
  order: 0,
  createdAt: "",
  updatedAt: "",
};

const BLOCK_ICON: Record<TutorialBlockType, typeof Type> = {
  text: Type,
  image: ImagePlus,
  video: Film,
  note: Lightbulb,
};

const inputCls =
  "w-full rounded-xl glass-input px-3 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:outline-none";

export default function TutorialsAdmin() {
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [pending, setPending] = useState(0);

  return (
    <div className="max-w-4xl pb-12">
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl glass-bar p-1.5">
        <button
          onClick={() => setTab("posts")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            tab === "posts" ? "bg-gold/15 text-gold" : "text-sage hover:text-cream"
          }`}
        >
          <GraduationCap size={15} className="text-emerald-300" /> مطالب آموزشی
        </button>
        <button
          onClick={() => setTab("comments")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            tab === "comments" ? "bg-gold/15 text-gold" : "text-sage hover:text-cream"
          }`}
        >
          <MessageSquare size={15} className="text-fuchsia-300" /> نظرات
          {pending > 0 && (
            <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-[10px] text-rose-200">
              {toFa(pending)}
            </span>
          )}
        </button>
      </div>

      {tab === "posts" ? <PostsTab /> : null}
      {/* تب نظرات همیشه مانت می‌ماند تا شمارندهٔ «در انتظار» روی تب به‌روز بماند. */}
      <div className={tab === "comments" ? "" : "hidden"}>
        <CommentsTab onPending={setPending} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  تب ۱: مطالب                                                    */
/* ---------------------------------------------------------------- */

function PostsTab() {
  const [rows, setRows] = useState<TutorialAdminDTO[] | null>(null);
  const [draft, setDraft] = useState<TutorialAdminDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tutorials");
      if (!res.ok) {
        setError("خطا در دریافت آموزش‌ها.");
        return;
      }
      const data = await res.json();
      setRows(data.tutorials ?? []);
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const isNew = !draft.id;
      const res = await fetch(
        isNew ? "/api/admin/tutorials" : `/api/admin/tutorials/${draft.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ذخیره انجام نشد.");
        return;
      }
      setDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      await load();
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("این آموزش و همهٔ نظراتش حذف شود؟")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/tutorials/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    return (
      <Editor
        draft={draft}
        setDraft={setDraft}
        onSave={save}
        onCancel={() => setDraft(null)}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setDraft({ ...EMPTY })}
          className="btn-emerald inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
        >
          <Plus size={15} /> آموزش جدید
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300">
            <Check size={14} /> ذخیره شد
          </span>
        )}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl glass-soft p-6 text-center text-sm text-sage">
          هنوز آموزشی ساخته نشده است.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl glass-panel p-3"
            >
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-moss/50">
                {t.cover ? (
                  <Image src={t.cover} alt="" fill sizes="80px" className="object-cover"
                      unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center">
                    <GraduationCap size={18} className="text-gold/40" />
                  </span>
                )}
              </div>

              <div className="min-w-[160px] flex-1 text-right">
                <p className="text-sm font-bold text-cream">{t.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-sage">
                  <span className="rounded-full border border-gold/25 px-2 py-0.5 text-gold-soft">
                    {t.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp size={11} className="text-emerald-300" /> {toFa(t.likes)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsDown size={11} className="text-rose-300" /> {toFa(t.dislikes)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye size={11} className="text-sky-300" /> {toFa(t.views)}
                  </span>
                  {!t.published && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <EyeOff size={11} /> پیش‌نویس
                    </span>
                  )}
                </p>
              </div>

              <button
                onClick={() => setDraft({ ...t })}
                className="btn-sky inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold"
              >
                <PenLine size={13} /> ویرایش
              </button>
              <button
                onClick={() => remove(t.id)}
                disabled={busy}
                className="btn-rose inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-50"
              >
                <Trash2 size={13} /> حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  ویرایشگر یک آموزش                                          */
/* ---------------------------------------------------------------- */

function Editor({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  error,
}: {
  draft: TutorialAdminDTO;
  setDraft: (value: TutorialAdminDTO) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
}) {
  const coverRef = useRef<HTMLInputElement>(null);
  const blockRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const blockVideoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // ویدئو تا ۱۰۰ مگابایت است و ممکن است دقیقه‌ها طول بکشد؛ بدون نمایش
  // درصد پیشرفت، کاربر فکر می‌کند صفحه هنگ کرده و دوباره کلیک می‌کند.
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [videoErr, setVideoErr] = useState("");

  const set = (patch: Partial<TutorialAdminDTO>) => setDraft({ ...draft, ...patch });

  async function upload(file: File): Promise<string> {
    // BUG FIX: عکس‌های سنگین/HEIC قبل از ارسال به JPEG بهینه تبدیل می‌شوند
    // تا آپلود کاور و عکس‌های آموزش هرگز به‌خاطر حجم یا فرمت شکست نخورد.
    const prepared = await prepareImageForUpload(file);
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: uploadForm(prepared),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "آپلود انجام نشد.");
    return data.url as string;
  }

  /**
   * آپلود ویدئو به /api/admin/upload-video.
   *
   * عمداً XMLHttpRequest و نه fetch: فقط XHR رویداد progress آپلود می‌دهد
   * و برای فایل چندده مگابایتی بدون آن تجربهٔ کاربری فاجعه است.
   */
  function uploadVideoFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/upload-video");
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setVideoPct(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        let data: { url?: string; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* پاسخ غیر JSON — پیام عمومی می‌دهیم. */
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
        else reject(new Error(data.error || "آپلود ویدئو انجام نشد."));
      };
      xhr.onerror = () => reject(new Error("ارتباط با سرور قطع شد."));
      xhr.send(form);
    });
  }

  /** مسیر مشترک هر دو دکمهٔ آپلود ویدئو (ویدئوی اصلی و بلوک‌ها). */
  async function handleVideoFile(file: File, apply: (url: string) => void) {
    setVideoErr("");
    setVideoPct(0);
    try {
      apply(await uploadVideoFile(file));
    } catch (err) {
      setVideoErr(err instanceof Error ? err.message : "آپلود ویدئو انجام نشد.");
    } finally {
      setVideoPct(null);
    }
  }

  // بلوک‌ها را همیشه از روی خود درافت می‌سازیم و هیچ پارسر پاک‌کننده‌ای
  // وسط راه نیست — همان اشتباهی که قبلاً با «نماد جدید» پیش آمد.
  const setBlock = (index: number, patch: Partial<TutorialBlock>) => {
    const blocks = draft.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    set({ blocks });
  };

  const addBlock = (type: TutorialBlockType) =>
    set({ blocks: [...draft.blocks, { type, text: "", heading: "", src: "" }] });

  const removeBlock = (index: number) =>
    set({ blocks: draft.blocks.filter((_, i) => i !== index) });

  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    set({ blocks });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl glass-panel p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-black text-gold-soft">
          {draft.id ? "ویرایش آموزش" : "آموزش جدید"}
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] text-sage">عنوان</span>
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="مثلاً: چگونه عطر را درست نگهداری کنیم؟"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-[11px] text-sage">دسته‌بندی</span>
            <input
              className={inputCls}
              value={draft.category}
              onChange={(e) => set({ category: e.target.value })}
              placeholder="مثلاً: نگهداری عطر"
              list="tutorial-categories"
            />
            <span className="mt-1 block text-[10px] text-sage/70">
              هر نام تازه‌ای که بنویسید، خودبه‌خود یک دستهٔ تازه در صفحهٔ آموزش می‌سازد.
            </span>
          </label>

          <label>
            <span className="mb-1.5 block text-[11px] text-sage">ترتیب نمایش (کوچکتر = بالاتر)</span>
            <input
              type="number"
              className={inputCls}
              value={draft.order}
              onChange={(e) => set({ order: Number(e.target.value) || 0 })}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] text-sage">خلاصه (زیر عنوان کارت)</span>
            <textarea
              className={inputCls}
              rows={2}
              value={draft.excerpt}
              onChange={(e) => set({ excerpt: e.target.value })}
            />
          </label>

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] text-sage">
              ویدئوی اصلی (اختیاری)
            </span>
            {/* درخواست مدیر: تکست‌باکس مسیر/لینک حذف شد — ویدئوی اصلی فقط
                با دکمهٔ آپلود انتخاب می‌شود و نام فایل به‌صورت چیپ نمایش
                می‌یابد (مثل بلوک‌های ویدئویی پایین فرم). */}
            <div className="flex flex-wrap items-center gap-2">
              {draft.video ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl glass-soft px-3 py-2">
                  <Film size={14} className="shrink-0 text-emerald-300" />
                  <span dir="ltr" className="max-w-[240px] truncate text-[11px] text-cream/90">
                    {draft.video.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => set({ video: "" })}
                    className="btn-ghost mr-auto rounded-full px-3 py-1 text-[10.5px] font-bold"
                  >
                    حذف ویدئو
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoRef.current?.click()}
                  disabled={videoPct !== null}
                  className="btn-emerald inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-50"
                >
                  {videoPct !== null ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Film size={13} />
                  )}
                  آپلود ویدئو
                </button>
              )}
              <span className="text-[10.5px] text-sage">
                حداکثر ۱۰۰ مگابایت — mp4 ، webm یا mov
              </span>
            </div>
            {videoPct !== null && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold transition-all"
                    style={{ width: `${videoPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10.5px] text-sage">در حال آپلود… {videoPct}٪</p>
              </div>
            )}
            {videoErr && <p className="mt-1.5 text-[11px] text-rose-300">{videoErr}</p>}
          </div>
        </div>

        <input
          ref={videoRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            await handleVideoFile(file, (url) => set({ video: url }));
          }}
        />

        {/* کاور */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-moss/50">
            {draft.cover ? (
              <Image src={draft.cover} alt="" fill sizes="96px" className="object-cover"
                      unoptimized />
            ) : (
              <span className="flex h-full items-center justify-center">
                <ImagePlus size={18} className="text-gold/40" />
              </span>
            )}
          </div>
          <button
            onClick={() => coverRef.current?.click()}
            disabled={uploading}
            className="btn-sky inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            عکس کاور
          </button>
          {draft.cover && (
            <button
              onClick={() => set({ cover: "" })}
              className="btn-ghost rounded-full px-4 py-2 text-[11px] font-bold"
            >
              حذف کاور
            </button>
          )}
          <label className="mr-auto flex items-center gap-2 text-xs text-sage">
            <input
              type="checkbox"
              className="glass-check"
              checked={draft.published}
              onChange={(e) => set({ published: e.target.checked })}
            />
            منتشر شود
          </label>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              try {
                set({ cover: await upload(file) });
              } catch {
                /* پیام خطای آپلود در پایین فرم نشان داده می‌شود. */
              } finally {
                setUploading(false);
              }
            }}
          />
        </div>
      </div>

      {/* بلوک‌های محتوا */}
      <div className="rounded-3xl glass-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="ml-auto text-sm font-black text-gold-soft">محتوای آموزش</span>
          {(Object.keys(BLOCK_LABELS) as TutorialBlockType[]).map((type) => {
            const Icon = BLOCK_ICON[type];
            return (
              <button
                key={type}
                onClick={() => addBlock(type)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1.5 text-[11px] font-bold text-gold-soft transition-colors hover:bg-gold/10"
              >
                <Icon size={13} /> {BLOCK_LABELS[type]}
              </button>
            );
          })}
        </div>

        {draft.blocks.length === 0 ? (
          <p className="rounded-2xl glass-soft p-5 text-center text-xs text-sage">
            هنوز بلوکی اضافه نشده — از دکمه‌های بالا متن، عکس یا ویدئو بیافزایید.
          </p>
        ) : (
          <div className="space-y-3">
            {draft.blocks.map((block, i) => {
              const Icon = BLOCK_ICON[block.type];
              return (
                <div key={i} className="rounded-2xl glass-soft p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-gold-soft">
                      <Icon size={13} /> {BLOCK_LABELS[block.type]} {toFa(i + 1)}
                    </span>
                    <button
                      onClick={() => moveBlock(i, -1)}
                      className="mr-auto rounded-lg border border-gold/25 p-1.5 text-gold-soft hover:bg-gold/10"
                      aria-label="بالا"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => moveBlock(i, 1)}
                      className="rounded-lg border border-gold/25 p-1.5 text-gold-soft hover:bg-gold/10"
                      aria-label="پایین"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => removeBlock(i)}
                      className="rounded-lg border border-rose-400/30 p-1.5 text-rose-300 hover:bg-rose-400/10"
                      aria-label="حذف"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {block.type === "image" && (
                    <div className="mb-2 flex items-center gap-3">
                      <div className="relative h-14 w-20 overflow-hidden rounded-lg bg-moss/50">
                        {block.src ? (
                          <Image src={block.src} alt="" fill sizes="80px" className="object-cover"
                      unoptimized />
                        ) : (
                          <span className="flex h-full items-center justify-center">
                            <ImagePlus size={16} className="text-gold/40" />
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (blockRef.current) {
                            blockRef.current.dataset.index = String(i);
                            blockRef.current.click();
                          }
                        }}
                        className="btn-sky rounded-full px-4 py-2 text-[11px] font-bold"
                      >
                        آپلود عکس
                      </button>
                    </div>
                  )}

                  {/* v32: فرم لینک حذف شد — بلوک ویدئو فقط فایل آپلودی می‌پذیرد. */}
                  {block.type === "video" && (
                    <div className="mb-2">
                      {block.src ? (
                        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl glass-soft px-3 py-2">
                          <Film size={14} className="shrink-0 text-emerald-300" />
                          <span dir="ltr" className="truncate text-[11px] text-cream/90">
                            {block.src.split("/").pop()}
                          </span>
                          <button
                            type="button"
                            onClick={() => setBlock(i, { src: "" })}
                            className="btn-ghost mr-auto rounded-full px-3 py-1 text-[10.5px] font-bold"
                          >
                            حذف فایل
                          </button>
                        </div>
                      ) : (
                        <p className="mb-2 text-[10.5px] text-sage">
                          هنوز ویدئویی آپلود نشده — حداکثر ۱۰۰ مگابایت، mp4 ، webm یا mov
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (blockVideoRef.current) {
                            blockVideoRef.current.dataset.index = String(i);
                            blockVideoRef.current.click();
                          }
                        }}
                        disabled={videoPct !== null}
                        className="btn-emerald mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-50"
                      >
                        {videoPct !== null ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Film size={13} />
                        )}
                        آپلود ویدئو
                      </button>
                    </div>
                  )}

                  {(block.type === "text" || block.type === "note") && (
                    <input
                      value={block.heading ?? ""}
                      maxLength={120}
                      onChange={(e) => setBlock(i, { heading: e.target.value })}
                      placeholder="سرتیتر این بخش (اختیاری) — با طلاییِ برجسته نشان داده می‌شود"
                      className={`${inputCls} mb-2 border-gold/25 font-bold`}
                    />
                  )}
                  <textarea
                    className={inputCls}
                    rows={block.type === "text" ? 5 : 2}
                    value={block.text}
                    onChange={(e) => setBlock(i, { text: e.target.value })}
                    placeholder={
                      block.type === "text"
                        ? "متن این بخش… (پاراگراف‌ها را با خط خالی جدا کنید؛ همه در یک باکس زیر سرتیتر نمایش داده می‌شوند)"
                        : block.type === "note"
                          ? "متن نکته…"
                          : "زیرنویس (اختیاری)"
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        <input
          ref={blockVideoRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          hidden
          onChange={async (e) => {
            const index = Number(e.currentTarget.dataset.index);
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !Number.isFinite(index)) return;
            await handleVideoFile(file, (url) => setBlock(index, { src: url }));
          }}
        />

        <input
          ref={blockRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const index = Number(e.currentTarget.dataset.index);
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !Number.isFinite(index)) return;
            setUploading(true);
            try {
              setBlock(index, { src: await upload(file) });
            } catch {
              /* خطای آپلود — بلوک دست‌نخورده می‌ماند. */
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={busy}
          className="btn-emerald inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-bold disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} ذخیره
        </button>
        <button
          onClick={onCancel}
          className="btn-ghost inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
        >
          <X size={14} /> انصراف
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  تب ۲: نظرات                                                   */
/* ---------------------------------------------------------------- */

function CommentsTab({ onPending }: { onPending: (value: number) => void }) {
  // Comments are published immediately now; show the newest of every status.
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("all");
  const [rows, setRows] = useState<TutorialCommentAdmin[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    try {
      const res = await fetch(`/api/admin/tutorial-comments${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.comments ?? []);
      onPending(data.pending ?? 0);
    } catch {
      /* خطای شبکه — فهرست قبلی روی صفحه می‌ماند. */
    }
  }, [filter, onPending]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: number, payload: Record<string, unknown>) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/tutorial-comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setReplyFor(null);
      setReplyText("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("این نظر حذف شود؟")) return;
    setBusyId(id);
    try {
      await fetch(`/api/admin/tutorial-comments/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: "pending", label: "در انتظار تأیید" },
            { key: "approved", label: "تأییدشده" },
            { key: "rejected", label: "ردشده" },
            { key: "all", label: "همه" },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-[11px] font-bold transition-all ${
              filter === f.key
                ? "bg-gold text-[#241a05]"
                : "border border-gold/30 text-gold-soft hover:bg-gold/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl glass-soft p-6 text-center text-sm text-sage">
          نظری در این بخش نیست.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-2xl glass-panel p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-bold text-cream">{c.name}</span>
                <span className="text-[10px] text-sage">{faDate(c.createdAt)}</span>
                <span className="text-[10px] text-sage">آموزش #{toFa(c.tutorial)}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-xs leading-7 text-cream/85">{c.body}</p>

              {c.reply && (
                <div className="mt-3 rounded-xl border-r-2 border-gold/50 bg-gold/[0.06] p-3 text-xs text-cream/85">
                  <span className="font-bold text-gold-soft">{c.reply.author}</span>
                  <p className="mt-1 whitespace-pre-line leading-7">{c.reply.body}</p>
                </div>
              )}

              {replyFor === c.id && (
                <div className="mt-3">
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="پاسخ شما…"
                  />
                  <button
                    onClick={() => patch(c.id, { reply: replyText })}
                    disabled={busyId === c.id}
                    className="btn-emerald mt-2 rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-50"
                  >
                    ثبت پاسخ
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {c.status !== "approved" && (
                  <button
                    onClick={() => patch(c.id, { status: "approved" })}
                    disabled={busyId === c.id}
                    className="btn-emerald inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-50"
                  >
                    <Check size={12} /> تأیید
                  </button>
                )}
                {c.status !== "rejected" && (
                  <button
                    onClick={() => patch(c.id, { status: "rejected" })}
                    disabled={busyId === c.id}
                    className="btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-50"
                  >
                    <X size={12} /> رد
                  </button>
                )}
                <button
                  onClick={() => {
                    setReplyFor(replyFor === c.id ? null : c.id);
                    setReplyText(c.reply?.body || "");
                  }}
                  className="btn-sky inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold"
                >
                  <Reply size={12} /> پاسخ
                </button>
                <button
                  onClick={() => remove(c.id)}
                  disabled={busyId === c.id}
                  className="btn-rose inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-50"
                >
                  <Trash2 size={12} /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
