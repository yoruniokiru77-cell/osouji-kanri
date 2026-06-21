"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, MapPin, Pencil, X } from "lucide-react";

export type WeekBooking = {
  id: string;
  scheduledAt: string;
  content: string;
  address: string;
  customerName: string | null;
  customerPhone: string | null;
};

export type WeekDay = {
  dateKey: string;
  label: string;
  bookings: WeekBooking[];
};

export type ScheduleWeek = {
  key: string;
  label: string;
  days: WeekDay[];
};

export function WeeklyScheduleCalendar({ weeks }: { weeks: ScheduleWeek[] }) {
  const [selectedDay, setSelectedDay] = useState<WeekDay | null>(null);

  return (
    <>
      <div className="week-calendar-list">
        {weeks.map((week, index) => (
          <article className="week-calendar" key={week.key}>
            <header>
              <strong>第{index + 1}週</strong>
              <span>{week.label}</span>
            </header>
            <div className="week-grid">
              {week.days.map((day) => (
                <button
                  className={day.bookings.length > 0 ? "week-day has-bookings" : "week-day"}
                  key={day.dateKey}
                  onClick={() => setSelectedDay(day)}
                  type="button"
                >
                  <span className="week-day-header">
                    <span>{day.label}</span>
                    <strong>{day.bookings.length}件</strong>
                  </span>
                  <span className="week-day-items">
                    {day.bookings.length === 0 ? (
                      <span className="week-empty">予定なし</span>
                    ) : (
                      day.bookings.map((booking) => (
                        <span className="week-booking" key={booking.id}>
                          <time>{formatTime(booking.scheduledAt)}</time>
                          <span>{booking.content}</span>
                          <ChevronRight size={13} />
                        </span>
                      ))
                    )}
                  </span>
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      {selectedDay ? (
        <div
          aria-modal="true"
          className="schedule-modal-backdrop"
          onClick={() => setSelectedDay(null)}
          role="dialog"
        >
          <div className="schedule-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span><CalendarDays size={15} />{selectedDay.label}</span>
                <strong>{selectedDay.bookings.length}件の予定</strong>
              </div>
              <button aria-label="閉じる" onClick={() => setSelectedDay(null)} type="button">
                <X size={18} />
              </button>
            </header>
            {selectedDay.bookings.length === 0 ? (
              <p className="schedule-modal-empty">この日の予定はありません。</p>
            ) : (
              <div className="schedule-modal-list">
                {selectedDay.bookings.map((booking) => (
                  <article className="schedule-modal-item" key={booking.id}>
                    <time><Clock3 size={14} />{formatTime(booking.scheduledAt)}</time>
                    <strong>{booking.content}</strong>
                    <p><MapPin size={14} />{booking.address}</p>
                    {booking.customerName || booking.customerPhone ? (
                      <small>{[booking.customerName, booking.customerPhone].filter(Boolean).join(" / ")}</small>
                    ) : null}
                    <Link className="schedule-edit-link" href={`/staff/schedule/${booking.id}`}>
                      <Pencil size={14} />
                      編集
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}
