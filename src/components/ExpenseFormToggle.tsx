"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

export function ExpenseFormToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="action-card" onClick={() => setOpen((value) => !value)} type="button">
        <span className="action-icon amber"><Plus size={20} /></span>
        <span>
          <strong>新規経費申請</strong>
          <small>タップして申請フォームを開く</small>
        </span>
        <ChevronDown className={open ? "rotate" : ""} size={18} />
      </button>
      {open ? children : null}
    </>
  );
}
