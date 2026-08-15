export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
        <p className="text-sm text-sage">در حال بارگذاری…</p>
      </div>
    </div>
  );
}
