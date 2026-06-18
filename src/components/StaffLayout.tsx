"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ClipboardCheck, House, ReceiptText, Sparkles } from "lucide-react";

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
      <main className="staff-main">{children}</main>
      <nav className="staff-nav" aria-label="スタッフメニュー">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
