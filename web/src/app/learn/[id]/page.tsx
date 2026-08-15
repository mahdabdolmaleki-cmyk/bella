"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Lightbulb,
  MessageSquare,
  Loader2,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { Field, TextField } from "@/components/Field";
import VideoPlayer from "@/components/VideoPlayer";
import { useAuth } from "@/components/AuthContext";
import { toFa } from "@/lib/data";
import {
  faDate,
  videoEmbed,
  type TutorialComment,
  type TutorialDTO,
} from "@/lib/tutorials";

/**
 * صفحهٔ یک آموزش.
 *
 * کلاینت‌کامپوننت است چون لایک/دیس‌لایک و نظرات هر دو تعاملی‌اند و رأی خود
 * کاربر باید بلافاصله روی دکمه دیده شود.
 */
export default function TutorialPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { user } = useAuth();

  const [tutorial, setTutorial] = useState<TutorialDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [myVote, setMyVote] = useState(0);
  const [voting, setVoting] = useState(false);

  const [comments, setComments] = useState<TutorialComment[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.name) setName((prev) => prev || user.name);
  }, [user]);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setMissing(true);
      return;
    }
    let alive = true;
    fetch(`/api/tutorials/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("404"))))
      .then((d) => {
        if (!alive) return;
        setTutorial(d.tutorial);
        setMyVote(d.myVote ?? 0);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const loadComments = useCallback(() => {
    if (!Number.isFinite(id)) return;
    fetch(`/api/tutorials/${id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {});
  }, [id]);

  useEffect(() => loadComments(), [loadComments]);

  async function vote(value: 1 | -1) {
    if (voting || !tutorial) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/tutorials/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (res.ok) {
        setMyVote(data.myVote ?? 0);
        setTutorial({ ...tutorial, likes: data.likes, dislikes: data.dislikes });
      }
    } catch {
      /* شبکه قطع بوده — شمارنده دست‌نخورده می‌ماند. */
    } finally {
      setVoting(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/tutorials/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ثبت نظر انجام نشد.");
      } else {
        setSent(true);
        setBody("");
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setSending(false);
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <BookOpen size={40} className="mx-auto text-gold/40" />
        <p className="mt-4 text-sm text-sage">این آموزش پیدا نشد.</p>
        <Link href="/learn" className="btn-ghost mt-6 inline-flex rounded-full px-5 py-2.5 text-xs font-bold">
          بازگشت به آکادمی
        </Link>
      </div>
    );
  }

  if (!tutorial) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24">
        <div className="h-64 animate-pulse rounded-3xl glass-panel" />
      </div>
    );
  }

  const mainVideo = videoEmbed(tutorial.video);

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 text-right sm:py-16">
      {/* BUG FIX (v31): لینک بازگشت inline-flex بود و چیپ دسته هم inline-block؛
          هر دو سطری بودند پس کنار هم می‌نشستند و mt-5 چیپ را پایین می‌کشید
          تا روی عنوان بیفتد. حالا هر کدام در بلوک خودش قرار دارند. */}
      <div>
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 text-xs font-bold text-gold-soft transition-colors hover:text-gold"
        >
          <ArrowRight size={14} /> آکادمی بلّا
        </Link>
      </div>

      <div className="mt-5">
        <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-bold text-gold-soft">
          {tutorial.category}
        </span>
      </div>
      <h1 className="mt-3 text-2xl leading-[1.7] font-black text-cream sm:text-3xl sm:leading-[1.6]">
        {tutorial.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-sage">
        <span>{faDate(tutorial.createdAt)}</span>
        <span className="flex items-center gap-1.5">
          <Eye size={12} className="text-sky-300" /> {toFa(tutorial.views)} بازدید
        </span>
      </div>

      {tutorial.excerpt && (
        <p className="mt-5 rounded-2xl glass-soft p-4 text-sm leading-8 text-cream/90">
          {tutorial.excerpt}
        </p>
      )}

      {tutorial.cover && (
        <div className="relative mt-6 h-56 overflow-hidden rounded-3xl sm:h-72">
          <Image
            src={tutorial.cover}
            alt={tutorial.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {mainVideo && (
        <div className="mt-6">
          {mainVideo.kind === "file" ? (
            // فایل آپلودشده با پخش‌کنندهٔ خود سایت پخش می‌شود؛ لینک آپارات/یوتیوب
            // مجبوریم در iframe خودشان بماند چون فایل خامی تحویل نمی‌دهند.
            <VideoPlayer src={mainVideo.src} poster={tutorial.cover} title={tutorial.title} />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-gold/20 bg-black">
              <iframe
                src={mainVideo.src}
                title={tutorial.title}
                allowFullScreen
                className="aspect-video w-full"
              />
            </div>
          )}
        </div>
      )}

      {/* ── بدنهٔ مطلب ──────────────────────────────────── */}
      <div className="mt-8 space-y-6">
        {tutorial.blocks.map((block, i) => {
          if (block.type === "text") {
            return (
              <p key={i} className="whitespace-pre-line text-sm leading-9 text-cream/90">
                {block.text}
              </p>
            );
          }
          if (block.type === "note") {
            return (
              <div
                key={i}
                // v32: زرد کهربایی با طلایی سایت قاطی می‌شد؛ فیروزه‌ای روشن هم دیده می‌شود
                // هم روی سبز تیره تمیز می‌نشیند.
                className="flex gap-3 rounded-2xl border border-teal-300/30 bg-teal-300/[0.09] p-4 shadow-[0_0_28px_-16px_rgba(45,212,191,0.65)]"
              >
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-teal-300" />
                <p className="whitespace-pre-line text-sm leading-8 text-cream/90">{block.text}</p>
              </div>
            );
          }
          if (block.type === "image") {
            return (
              <figure key={i}>
                <div className="relative h-60 overflow-hidden rounded-2xl sm:h-80">
                  <Image
                    src={block.src}
                    alt={block.text || tutorial.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 768px"
                    className="object-cover"
                  />
                </div>
                {block.text && (
                  <figcaption className="mt-2 text-center text-[11px] text-sage">
                    {block.text}
                  </figcaption>
                )}
              </figure>
            );
          }
          const embed = videoEmbed(block.src);
          if (!embed) return null;
          return (
            <figure key={i}>
              <div className={embed.kind === "file" ? "" : "overflow-hidden rounded-2xl border border-gold/20 bg-black"}>
                {embed.kind === "file" ? (
                  <VideoPlayer src={embed.src} title={block.text || tutorial.title} />
                ) : (
                  <iframe
                    src={embed.src}
                    title={block.text || tutorial.title}
                    allowFullScreen
                    className="aspect-video w-full"
                  />
                )}
              </div>
              {block.text && (
                <figcaption className="mt-2 text-center text-[11px] text-sage">
                  {block.text}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>

      {/* ── لایک / دیس‌لایک ─────────────────────────────── */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 rounded-3xl glass-panel p-5">
        <p className="ml-auto text-xs text-sage">این آموزش برایتان مفید بود؟</p>
        <button
          onClick={() => vote(1)}
          disabled={voting}
          aria-pressed={myVote === 1}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-300 disabled:opacity-60 ${
            myVote === 1
              ? "bg-emerald-400 text-[#0b1a12] shadow-[0_6px_20px_-6px_rgba(52,211,153,0.7)]"
              : "border border-emerald-300/40 text-emerald-200 hover:bg-emerald-300/10"
          }`}
        >
          <ThumbsUp size={15} /> {toFa(tutorial.likes)}
        </button>
        <button
          onClick={() => vote(-1)}
          disabled={voting}
          aria-pressed={myVote === -1}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-300 disabled:opacity-60 ${
            myVote === -1
              ? "bg-rose-400 text-[#2a0b0b] shadow-[0_6px_20px_-6px_rgba(251,113,133,0.7)]"
              : "border border-rose-300/40 text-rose-200 hover:bg-rose-300/10"
          }`}
        >
          <ThumbsDown size={15} /> {toFa(tutorial.dislikes)}
        </button>
      </div>

      {/* ── نظرات (بدون ستاره) ────────────────────────── */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-black text-cream">
          <MessageSquare size={18} className="text-gold" /> نظرات
          <span className="text-xs font-normal text-sage">({toFa(comments.length)})</span>
        </h2>

        <form onSubmit={submitComment} className="mt-4 rounded-3xl glass-panel p-4 sm:p-5">
          {sent ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={18} />
              نظر شما ثبت شد و پس از تأیید مدیر نمایش داده می‌شود.
            </div>
          ) : (
            <>
              <Field
                label="نام شما"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
              <TextField
                label="نظر شما"
                wrapperClassName="mt-4"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                required
                error={error || undefined}
              />
              <button
                type="submit"
                disabled={sending}
                className="btn-emerald mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-bold disabled:opacity-60"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                ثبت نظر
              </button>
            </>
          )}
        </form>

        <div className="mt-5 space-y-3">
          {comments.length === 0 ? (
            <p className="py-6 text-center text-xs text-sage">
              هنوز نظری ثبت نشده — اولین نفر باشید.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-2xl glass-soft p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-cream">{c.name}</span>
                  <span className="text-[10px] text-sage">{faDate(c.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs leading-7 text-cream/85">{c.body}</p>
                {c.reply && (
                  <div className="mt-3 rounded-xl border-r-2 border-gold/50 bg-gold/[0.06] p-3">
                    <span className="text-[11px] font-bold text-gold-soft">
                      {c.reply.author || "پاسخ مدیر"}
                    </span>
                    <p className="mt-1 whitespace-pre-line text-xs leading-7 text-cream/85">
                      {c.reply.body}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </article>
  );
}
