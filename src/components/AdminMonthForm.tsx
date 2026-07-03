"use client";

import { useRef } from "react";

export function AdminMonthForm({ selectedMonth }: { selectedMonth: string }) {
  const refreshInputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="admin-month-form"
      onSubmit={() => {
        if (refreshInputRef.current) {
          refreshInputRef.current.value = String(Date.now());
        }
      }}
    >
      <input defaultValue={selectedMonth} name="month" type="month" />
      <input defaultValue={String(Date.now())} name="refresh" ref={refreshInputRef} type="hidden" />
      <button type="submit">表示</button>
    </form>
  );
}
