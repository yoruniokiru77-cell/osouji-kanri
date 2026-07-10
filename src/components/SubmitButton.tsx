"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
  const [clicked, setClicked] = useState(false);
  const busy = pending || clicked;

  useEffect(() => {
    if (!clicked || pending) return;
    const timeoutId = window.setTimeout(() => setClicked(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [clicked, pending]);

  return (
    <button
      aria-busy={busy}
      className={className}
      disabled={disabled || pending}
      onClick={() => setClicked(true)}
      type="submit"
    >
      {busy ? (
        <span className="submit-button-pending">
          <span aria-hidden="true" className="submit-button-spinner" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
