"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  disabled = false,
  pendingLabel = "送信中...",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={disabled || pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}
