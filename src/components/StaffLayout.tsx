"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ClipboardCheck, House, ReceiptText, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "/staff/dashboard", label: "ホーム", icon: House },
  { href: "/staff/schedule", label: "予定登録", icon: CalendarPlus },
  { href: "/staff/report", label: "報告", icon: ClipboardCheck },
  { href: "/staff/expense", label: "経費申請", icon: ReceiptText },
];

export function StaffLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState("");

  useEffect(() => {
    setPendingHref("");
  }, [pathname]);

  return (
    <div className="staff-app">
      <header className="staff-header">
        <Link className="brand" href="/staff/dashboard">
          <span className="brand-mark"><Sparkles size={16} /></span>
          <span>CleanPro</span>
          <small>スタッフ</small>
        </Link>
        {title ? <strong>{title}</strong> : <span />}
      </header>
      {pendingHref ? <div className="route-loading-bar" /> : null}
      <main className={pendingHref ? "staff-main route-pending" : "staff-main"}>{children}</main>
      <nav className="staff-nav" aria-label="スタッフメニュー">
        {items.map((item) => {
          const active = pathname === item.href;
          const pending = pendingHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              className={[active ? "active" : "", pending ? "pending" : ""].filter(Boolean).join(" ")}
              href={item.href}
              key={item.href}
              onClick={() => {
                if (!active) setPendingHref(item.href);
              }}
              prefetch
            >
              <Icon size={20} />
              <span>{pending ? "読込中" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
