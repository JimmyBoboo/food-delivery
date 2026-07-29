import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-fairway-200 bg-white px-3 py-2.5 text-sm text-fairway-900";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-fairway-900">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-fairway-600">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-fairway-600"
      />
      <span className="text-sm text-fairway-900">{label}</span>
    </label>
  );
}
