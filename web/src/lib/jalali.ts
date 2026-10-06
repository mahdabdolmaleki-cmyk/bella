// ---------------------------------------------------------------------------
// تبدیل تاریخ شمسی ↔ میلادی (v41) — الگوریتم jalaali-js (MIT, J. Rooijani)
// دقیقاً از منبع jalaali-js 1.2.7 پورت شده تا وابستگی به npm اضافه نشود.
// کاربرد: ویرایش «تاریخ انقضای کد تخفیف» در پنل ادمین به شمسی؛ ذخیرهٔ نهایی
// همیشه ISO میلادی است تا مقایسهٔ انقضا در سرور استاندارد بماند.
// ---------------------------------------------------------------------------

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number, withoutLeap?: boolean) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  let n: number;

  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error("jalali: year out of range");

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (withoutLeap) return { gy, march } as { gy: number; march: number; leap?: number };

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185)
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export type JalaliParts = { jy: number; jm: number; jd: number };

/** میلادی (Date یا ISO) → اجزای شمسی؛ null خارج از بازه. */
export function toJalali(input: Date | string): JalaliParts | null {
  const d =
    typeof input === "string" ? new Date(`${input.slice(0, 10)}T12:00:00Z`) : input;
  if (!Number.isFinite(d.getTime())) return null;
  try {
    const y = typeof input === "string" ? d.getUTCFullYear() : d.getFullYear();
    const m = typeof input === "string" ? d.getUTCMonth() + 1 : d.getMonth() + 1;
    const day = typeof input === "string" ? d.getUTCDate() : d.getDate();
    return d2j(g2d(y, m, day));
  } catch {
    return null;
  }
}

/** اجزای شمسی → ISO میلادی «YYYY-MM-DD»؛ null اگر نامعتبر. */
export function jalaliToIso(jy: number, jm: number, jd: number): string | null {
  if (!Number.isFinite(jy) || !Number.isFinite(jm) || !Number.isFinite(jd)) return null;
  if (jy < 1300 || jy > 1450 || jm < 1 || jm > 12) return null;
  let leap = false;
  try {
    leap = jalCal(jy).leap === 0;
  } catch {
    return null;
  }
  const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : leap ? 30 : 29;
  if (jd < 1 || jd > maxDay) return null;
  const g = d2g(j2d(jy, jm, jd));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export const faDigits = (s: string | number) => String(s).replace(/\d/g, (c) => FA_DIGITS[+c]);

/** ISO میلادی → «۱۴۰۵-۰۷-۱۳» (ارقام فارسی)؛ خالی → "". */
export function jalaliFromIso(iso: string): string {
  if (!iso) return "";
  const p = toJalali(iso);
  if (!p) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return faDigits(`${p.jy}-${pad(p.jm)}-${pad(p.jd)}`);
}
