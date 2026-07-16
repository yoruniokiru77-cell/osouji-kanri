"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AdminMonthForm({ selectedMonth }: { selectedMonth: string }) {
  const router = useRouter();
  const refreshInputRef = useRef<HTMLInputElement>(null);
  const refreshedOnMountRef = useRef(false);

  useEffect(() => {
    if (refreshedOnMountRef.current) return;
    refreshedOnMountRef.current = true;

    const params = new URLSearchParams(window.location.search);
    params.set("month", selectedMonth);
    params.set("refresh", String(Date.now()));
    router.replace(`/admin/dashboard?${params.toString()}`, { scroll: false });
  }, [router, selectedMonth]);

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
