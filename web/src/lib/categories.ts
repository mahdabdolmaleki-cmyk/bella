/**
 * دسته‌بندی درختی — نوع مشترک و توابع کمکی.
 *
 * سرور دسته‌ها را به‌صورت درخت (با `children`) در `/api/categories` می‌دهد.
 * محصول‌ها با «شناسهٔ» گره وصل می‌شوند (نه نام)، تا تغییر نام یک دسته هیچ
 * محصولی را بی‌دسته نکند.
 */
export type CategoryNode = {
  id: number;
  name: string;
  parentId: number | null;
  order: number;
  icon?: string;
  /** در نسخهٔ ادمین: فعال/غیرفعال بودن گره. */
  active?: boolean;
  /** در نسخهٔ ادمین: تعداد محصولِ روی این گره. */
  productCount?: number;
  children?: CategoryNode[];
};

/** پهن کردن درخت به لیست خطی با عمق هر گره (برای select یا فهرست مسطح). */
export function flattenTree(
  nodes: CategoryNode[],
  depth = 0,
  acc: Array<CategoryNode & { depth: number }> = [],
): Array<CategoryNode & { depth: number }> {
  for (const n of nodes) {
    acc.push({ ...n, depth });
    if (n.children?.length) flattenTree(n.children, depth + 1, acc);
  }
  return acc;
}

/** پیدا کردن یک گره بر اساس شناسه در درخت. */
export function findNode(nodes: CategoryNode[], id: number | null): CategoryNode | null {
  if (id == null) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * مسیر ریشه تا گرهٔ موردنظر (شامل خود گره) به‌صورت فهرستی از شناسه‌ها.
 * برای هایلایت کردن اجدادِ گرهٔ انتخاب‌شده در فروشگاه استفاده می‌شود.
 * اگر گره پیدا نشود، آرایهٔ خالی برمی‌گردد.
 */
export function pathToNode(
  nodes: CategoryNode[],
  id: number | null,
  trail: number[] = [],
): number[] {
  if (id == null) return [];
  for (const n of nodes) {
    const next = [...trail, n.id];
    if (n.id === id) return next;
    if (n.children?.length) {
      const hit = pathToNode(n.children, id, next);
      if (hit.length) return hit;
    }
  }
  return [];
}

/**
 * نام کامل یک دسته از ریشه تا خودش — مثلاً «ادکلن / مردانه / شیرین».
 * در پنل ادمین (کارت محصول، گروه‌بندی کمپین‌ها) استفاده می‌شود تا نام کامل
 * دسته دیده شود، نه فقط نام گرهٔ آخر. اگر گره پیدا نشود، «بدون دسته».
 */
export function categoryPathName(nodes: CategoryNode[], id: number | null): string {
  if (id == null) return "بدون دسته";
  const ids = pathToNode(nodes, id);
  if (!ids.length) return "بدون دسته";
  const names = ids.map((nid) => findNode(nodes, nid)?.name).filter(Boolean) as string[];
  return names.length ? names.join(" / ") : "بدون دسته";
}
