"use client";

/**
 * سیستم فرم بلّا
 * -----------------
 * پیش‌تر هر فرم در سایت یک «لیبل بالا + جعبهٔ سبز تخت» داشت که در هر
 * فایل دوباره تایپ شده بود. این یعنی هر تغییر طراحی باید ده‌ها جا تکرار
 * می‌شد — دلیل اینکه تغییر قبلی عملاً دیده نشد.
 *
 * حالا همهٔ فیلدهای سایت از همین سه کامپوننت می‌آیند، پس یک تغییر
 * در اینجا کل سایت را عوض می‌کند.
 *
 * رفتار پویای فیلد در globals.css (بلوک v28) تعریف شده است:
 * لیبل شناور، نوار طلایی که از وسط باز می‌شود، و بالا آمدن جعبه در فوکوس.
 */

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Shared = {
  label: string;
  /** متن راهنمای زیر فیلد. */
  hint?: ReactNode;
  /** پیام خطا؛ وقتی پر باشد کل فیلد قرمز می‌شود و جای راهنما را می‌گیرد. */
  error?: string;
  /** آیکن کوچک داخل فیلد (مثلاً آیکن lucide). */
  icon?: ReactNode;
  /** کلاس اضافی روی ظرف بیرونی، برای چیدمان در گرید. */
  wrapperClassName?: string;
};

function Frame({
  id,
  label,
  hint,
  error,
  icon,
  wrapperClassName = "",
  alwaysFloat = false,
  children,
}: Shared & {
  id: string;
  alwaysFloat?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wrapperClassName}>
      <div
        className={`field ${icon ? "field-has-icon" : ""} ${
          error ? "field-invalid" : ""
        } ${alwaysFloat ? "field-always-float" : ""}`}
      >
        {/* ترتیب مهم است: ورودی اول می‌آید تا سلکتورهای ~ در CSS
            بتوانند لیبل و نوار و آیکن را هدف بگیرند. */}
        {children}
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <span className="field-bar" aria-hidden="true" />
        {icon && (
          <span className="field-icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {(error || hint) && (
        <p className={`field-hint ${error ? "field-hint-error" : ""}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  icon,
  wrapperClassName,
  className = "",
  id,
  ...rest
}: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Frame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      icon={icon}
      wrapperClassName={wrapperClassName}
    >
      <input
        id={fieldId}
        // پلیس‌هولدر باید حتماً مقدار داشته باشد (حتی یک فاصله) وگرنه
        // قاعدهٔ :placeholder-shown کار نمی‌کند و لیبل هرگز بالا نمی‌رود.
        placeholder={rest.placeholder || " "}
        aria-invalid={error ? true : undefined}
        className={`field-input ${className}`}
        {...rest}
      />
    </Frame>
  );
}

export function TextField({
  label,
  hint,
  error,
  icon,
  wrapperClassName,
  className = "",
  id,
  rows = 3,
  ...rest
}: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Frame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      icon={icon}
      wrapperClassName={wrapperClassName}
    >
      <textarea
        id={fieldId}
        rows={rows}
        placeholder={rest.placeholder || " "}
        aria-invalid={error ? true : undefined}
        className={`field-input ${className}`}
        {...rest}
      />
    </Frame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  icon,
  wrapperClassName,
  className = "",
  id,
  children,
  ...rest
}: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Frame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      icon={icon}
      wrapperClassName={wrapperClassName}
      // سلکت پلیس‌هولدر ندارد، پس لیبلش همیشه بالا می‌ماند.
      alwaysFloat
    >
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={`field-input ${className}`}
        {...rest}
      >
        {children}
      </select>
      {/* فلش دلخواه؛ فلش پیش‌فرض مرورگر خاکستری و ناخوانا بود. */}
      <svg
        className="field-caret"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </Frame>
  );
}
