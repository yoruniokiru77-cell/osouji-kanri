import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  ReceiptText,
  Sparkles,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

const navigation = [
  { href: "/admin/dashboard#overview", label: "概要", icon: LayoutDashboard },
  { href: "/admin/dashboard#approvals", label: "実績承認", icon: ClipboardCheck },
  { href: "/admin/dashboard#finance", label: "給与・収支", icon: Banknote },
  { href: "/admin/dashboard#schedules", label: "案件一覧", icon: CalendarDays },
  { href: "/admin/dashboard#expenses", label: "経費", icon: ReceiptText },
  { href: "/admin/dashboard#categories", label: "区分", icon: Tags },
  { href: "/admin/dashboard#workers", label: "作業者", icon: Users },
  { href: "/admin/masters", label: "マスタ", icon: Settings },
];

export function AdminLayout({
  children,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin/dashboard">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span>
            <strong>CleanPro</strong>
            <small>管理者</small>
          </span>
        </Link>
        <nav aria-label="管理メニュー" className="admin-navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link href={item.href} key={item.href}>
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-user">
          <span>管理者</span>
          <small>管理者アカウント</small>
          <LogoutButton />
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
