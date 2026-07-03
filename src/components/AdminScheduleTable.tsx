"use client";

import { CalendarDays, Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { reopenWorkReport } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { formatCurrency } from "@/lib/finance";
import { reservationLabels, statusClass } from "@/lib/labels";
import type { ReservationWithRelations, Worker } from "@/lib/types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function workerNames(reservation: ReservationWithRelations) {
  return reservation.reservation_workers
    .map((item) => item.workers?.name)
    .filter(Boolean)
    .join("、");
}

function hasApprovedReport(reservation: ReservationWithRelations) {
  return reservation.work_reports.some((report) => report.approval_status === "approved");
}

function approvedReportFor(reservation: ReservationWithRelations) {
  return reservation.work_reports.find((report) => report.approval_status === "approved");
}

function isApprovedCompleted(reservation: ReservationWithRelations) {
  return reservation.status === "completed" && hasApprovedReport(reservation);
}

export function AdminScheduleTable({
  reservations,
  selectedMonth,
  workers,
}: {
  reservations: ReservationWithRelations[];
  selectedMonth: string;
  workers: Worker[];
}) {
  const [selectedWorker, setSelectedWorker] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [showReported, setShowReported] = useState(false);

  const visibleReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const matchesWorker =
          !selectedWorker ||
          reservation.reservation_workers.some((assignment) => assignment.worker_id === selectedWorker);
        const matchesCancelled = showCancelled || reservation.status !== "cancelled";
        const matchesReported = showReported || reservation.work_reports.length === 0;
        return matchesWorker && matchesCancelled && matchesReported;
      }),
    [reservations, selectedWorker, showCancelled, showReported],
  );

  return (
    <>
      <div className="admin-section-heading">
        <div>
          <CalendarDays size={19} />
          <span>
            <h2>案件一覧</h2>
            <p>通常はキャンセル・報告済みを非表示</p>
          </span>
        </div>
        <strong>{visibleReservations.length}件</strong>
      </div>
      <div className="schedule-filter-form">
        <label>
          <span>作業者</span>
          <select onChange={(event) => setSelectedWorker(event.target.value)} value={selectedWorker}>
            <option value="">全員</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-filter">
          <input
            checked={showCancelled}
            onChange={(event) => setShowCancelled(event.target.checked)}
            type="checkbox"
          />
          <span>キャンセルを表示</span>
        </label>
        <label className="check-filter">
          <input checked={showReported} onChange={(event) => setShowReported(event.target.checked)} type="checkbox" />
          <span>報告済みも表示</span>
        </label>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>区分</th>
              <th>案件内容</th>
              <th>作業者</th>
              <th>状態</th>
              <th className="numeric">売上</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleReservations.map((reservation) => {
              const approvedReport = approvedReportFor(reservation);
              return (
                <tr key={reservation.id}>
                  <td className="nowrap">{formatDateTime(reservation.scheduled_at)}</td>
                  <td>{reservation.service_categories?.name ?? "未設定"}</td>
                  <td>
                    <strong>{reservation.service_content}</strong>
                    <small>{reservation.address}</small>
                    {reservation.customer_name || reservation.customer_phone ? (
                      <small>{[reservation.customer_name, reservation.customer_phone].filter(Boolean).join(" / ")}</small>
                    ) : null}
                  </td>
                  <td>{workerNames(reservation) || "未設定"}</td>
                  <td>
                    <span className={statusClass(reservation.status)}>{reservationLabels[reservation.status]}</span>
                  </td>
                  <td className="numeric">
                    {isApprovedCompleted(reservation) ? formatCurrency(Number(reservation.amount)) : "-"}
                  </td>
                  <td>
                    <div className="table-actions">
                      <Link className="icon-text-button" href={`/admin/reservations/${reservation.id}?month=${selectedMonth}`}>
                        <Pencil size={14} />
                        編集
                      </Link>
                      {approvedReport && reservation.status === "completed" ? (
                        <form action={reopenWorkReport}>
                          <input name="report_id" type="hidden" value={approvedReport.id} />
                          <SubmitButton className="button" pendingLabel="戻し中...">
                            承認待ちへ戻す
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleReservations.length === 0 ? (
              <tr>
                <td colSpan={7}>表示条件に合う案件はありません</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
