import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MapPin,
  Pencil,
  ReceiptText,
  Tags,
  Users,
  Wrench,
} from "lucide-react";
import { StaffLayout } from "@/components/StaffLayout";
import { WeeklyScheduleCalendar } from "@/components/WeeklyScheduleCalendar";
import { requireRole } from "@/lib/auth";
import { formatCurrency } from "@/lib/finance";
import { expenseLabels, reservationLabels, statusClass } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { Expense, ReservationWithRelations } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "Asia/Tokyo",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function shiftDate(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFormatter.format(date);
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function startOfWeekMonday(dateKey: string) {
  const date = dateFromKey(dateKey);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return dateKeyFormatter.format(date);
}

function isDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function createWeekCalendar(
  startDateKey: string,
  bookings: ReservationWithRelations[],
  reservationDateKey: (value: string) => string,
) {
  if (bookings.length === 0) return [];

  const firstWeekStartKey = startOfWeekMonday(shiftDate(startDateKey, 1));
  const firstDate = dateFromKey(firstWeekStartKey);
  const lastDate = dateFromKey(reservationDateKey(bookings[bookings.length - 1].scheduled_at));
  const weekCount = Math.max(
    1,
    Math.ceil((lastDate.getTime() - firstDate.getTime() + 1) / (7 * 24 * 60 * 60 * 1000)),
  );

  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const weekStartKey = shiftDate(firstWeekStartKey, weekIndex * 7);
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const dateKey = shiftDate(weekStartKey, dayIndex);
      return {
        dateKey,
        label: formatWeekDay(dateKey),
        bookings: bookings
          .filter((booking) => reservationDateKey(booking.scheduled_at) === dateKey)
          .map((booking) => ({
            id: booking.id,
            scheduledAt: booking.scheduled_at,
            content: booking.service_content,
            address: booking.address,
            customerName: booking.customer_name,
            customerPhone: booking.customer_phone,
          })),
      };
    });

    return {
      key: weekStartKey,
      label: `${formatShortDate(weekStartKey)} - ${formatShortDate(shiftDate(weekStartKey, 6))}`,
      days,
    };
  });
}

function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(dateFromKey(dateKey));
}

function formatWeekDay(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(dateFromKey(dateKey));
}

export default async function StaffDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; updated?: string }>;
}) {
  const profile = await requireRole("staff");
  const query = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const todayKey = dateKeyFormatter.format(now);
  const selectedDate = isDateKey(query.date) ? query.date! : todayKey;
  const reservationWindowStart = new Date(`${selectedDate}T00:00:00+09:00`);
  const reservationWindowEnd = new Date(reservationWindowStart);
  reservationWindowEnd.setDate(reservationWindowEnd.getDate() + 90);
  const [reservationResult, expenseResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, scheduled_at, customer_name, customer_phone, address, service_content, service_category_id, parking_available, parking_notes, notes, status, service_categories(id, name), reservation_staff!inner(staff_id), reservation_workers(worker_id, workers(id, name)), reservation_tools(tool_id)",
      )
      .eq("reservation_staff.staff_id", profile.id)
      .neq("status", "cancelled")
      .gte("scheduled_at", reservationWindowStart.toISOString())
      .lt("scheduled_at", reservationWindowEnd.toISOString())
      .order("scheduled_at"),
    supabase
      .from("expenses")
      .select(
        "id, staff_id, category_id, reservation_id, amount, note, status, receipt_url, created_at, expense_categories(id, name)",
      )
      .eq("staff_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const reservations = (reservationResult.data ?? []) as unknown as ReservationWithRelations[];
  const expenses = (expenseResult.data ?? []) as unknown as Expense[];
  const reservationDateKey = (value: string) => dateKeyFormatter.format(new Date(value));
  const selectedBookings = reservations.filter(
    (item) => reservationDateKey(item.scheduled_at) === selectedDate,
  );
  const upcoming = reservations.filter(
    (item) => reservationDateKey(item.scheduled_at) > selectedDate,
  );
  const upcomingWeeks = createWeekCalendar(selectedDate, upcoming, reservationDateKey);
  const pendingCount = expenses.filter((item) => item.status === "requested").length;
  const selectedDateLabel = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${selectedDate}T00:00:00+09:00`));
  const selectedHeading =
    selectedDate === todayKey ? "今日の予定" : `${selectedDateLabel}の予定`;

  return (
    <StaffLayout>
      <div className="mobile-page">
        <section className="greeting fade-up">
          <p>おはようございます</p>
          <h1>{profile.display_name} さん</h1>
          <span>{dateFormatter.format(now)}</span>
        </section>

        <section className="page-section fade-up delay-1">
          {query.updated === "1" ? <div className="success-banner">予定を変更しました</div> : null}
          <div className="section-heading">
            <h2>{selectedHeading}</h2>
            <span>{selectedBookings.length}件</span>
          </div>
          <div className="date-switcher">
            <Link
              aria-label="前日"
              className="date-arrow"
              href={`/staff/dashboard?date=${shiftDate(selectedDate, -1)}`}
            >
              <ChevronLeft size={18} />
            </Link>
            <form action="/staff/dashboard" className="date-picker-form" key={selectedDate}>
              <CalendarDays size={16} />
              <input
                aria-label="表示する日付"
                defaultValue={selectedDate}
                name="date"
                type="date"
              />
              <button type="submit">表示</button>
            </form>
            <Link
              aria-label="翌日"
              className="date-arrow"
              href={`/staff/dashboard?date=${shiftDate(selectedDate, 1)}`}
            >
              <ChevronRight size={18} />
            </Link>
          </div>
          {selectedDate !== todayKey ? (
            <Link className="today-link" href="/staff/dashboard">
              今日に戻る
            </Link>
          ) : null}

          {selectedBookings.length === 0 ? (
            <div className="empty-card">
              <CheckCircle2 size={30} />
              <p>この日の予定はありません</p>
            </div>
          ) : (
            <div className="card-list">
              {selectedBookings.map((booking) => (
                <article className="glass-card booking-card" key={booking.id}>
                  <div className="card-row">
                    <strong className="time">
                      <Clock3 size={15} />
                      {new Date(booking.scheduled_at).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                    <div className="booking-actions">
                      <span className={statusClass(booking.status)}>
                        {reservationLabels[booking.status]}
                      </span>
                      {booking.status !== "completed" ? (
                        <Link
                          aria-label="この予定の実績を報告"
                          className="icon-button report-button"
                          href={`/staff/report?booking=${booking.id}`}
                          title="実績報告"
                        >
                          <ClipboardCheck size={15} />
                        </Link>
                      ) : null}
                      {booking.status === "scheduled" ? (
                        <Link
                          aria-label="予定を編集"
                          className="icon-button"
                          href={`/staff/schedule/${booking.id}`}
                        >
                          <Pencil size={15} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <p className="location">
                    <MapPin size={15} />
                    {booking.address}
                  </p>
                  <p className="description">{booking.service_content}</p>
                  {booking.customer_name || booking.customer_phone ? (
                    <p className="customer-line">
                      <Users size={14} />
                      {[booking.customer_name, booking.customer_phone].filter(Boolean).join(" / ")}
                    </p>
                  ) : null}
                  <div className="meta-row">
                    {booking.service_categories?.name ? (
                      <span>
                        <Tags size={14} />
                        {booking.service_categories.name}
                      </span>
                    ) : null}
                    <span>
                      <Users size={14} />
                      {booking.reservation_workers
                        .map((assignment) => assignment.workers?.name)
                        .filter(Boolean)
                        .join("、") || "担当者未設定"}
                    </span>
                    <span className={booking.parking_available ? "positive" : "negative"}>
                      <Car size={14} />
                      駐車場{booking.parking_available ? "あり" : "なし"}
                    </span>
                    <span>
                      <Wrench size={14} />
                      道具 {booking.reservation_tools.length}点
                    </span>
                  </div>
                  {booking.parking_notes ? (
                    <p className="parking-note">
                      <Car size={14} />
                      {booking.parking_notes}
                    </p>
                  ) : null}
                  {booking.notes ? (
                    <p className="notice">
                      <AlertCircle size={14} />
                      {booking.notes}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="page-section fade-up delay-2">
          <div className="section-heading">
            <h2>クイックアクション</h2>
          </div>
          <div className="quick-grid">
            <Link className="quick-card" href="/staff/report">
              <span className="action-icon green">
                <ClipboardCheck size={19} />
              </span>
              <strong>実績報告</strong>
              <small>作業完了後に入力</small>
            </Link>
            <Link className="quick-card" href="/staff/expense">
              <span className="action-icon amber">
                <Banknote size={19} />
              </span>
              <strong>経費申請</strong>
              <small>{pendingCount ? `申請中 ${pendingCount}件` : "新しい経費を申請"}</small>
            </Link>
          </div>
        </section>

        {upcoming.length > 0 ? (
          <section className="page-section fade-up delay-3">
            <div className="section-heading">
              <h2>選択日より後の予定</h2>
              <span>{upcoming.length}件</span>
            </div>
            <WeeklyScheduleCalendar weeks={upcomingWeeks} />
          </section>
        ) : null}

        <section className="page-section fade-up delay-4">
          <div className="section-heading">
            <h2>経費申請状況</h2>
            <Link href="/staff/expense">すべて見る</Link>
          </div>
          {expenses.length === 0 ? (
            <div className="empty-card small">
              <ReceiptText size={24} />
              <p>申請履歴はありません</p>
            </div>
          ) : (
            <div className="compact-list">
              {expenses.map((expense) => (
                <div className="expense-row" key={expense.id}>
                  <div>
                    <strong>{expense.expense_categories?.name}</strong>
                    <small>
                      {expense.note || new Date(expense.created_at).toLocaleDateString("ja-JP")}
                    </small>
                  </div>
                  <div>
                    <strong>{formatCurrency(Number(expense.amount))}</strong>
                    <span className={statusClass(expense.status)}>
                      {expenseLabels[expense.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </StaffLayout>
  );
}
