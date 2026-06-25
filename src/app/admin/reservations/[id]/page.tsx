import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { updateAdminReservation } from "@/app/actions";
import { AdminLayout } from "@/components/AdminLayout";
import { ReservationWorkItemsFieldset } from "@/components/ReservationWorkItemsFieldset";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { getCachedStaffMasters } from "@/lib/cached-data";
import { createClient } from "@/lib/supabase/server";
import { reservationLabels, statusClass } from "@/lib/labels";
import type { ReservationStatus } from "@/lib/types";

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function AdminReservationEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const profile = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [reservationResult, masters] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, scheduled_at, customer_name, customer_phone, address, service_content, service_content_id, service_category_id, parking_available, parking_notes, notes, status, reservation_workers(worker_id, is_supporter), reservation_service_contents(service_content_id, custom_name, quantity, sort_order), reservation_tools(tool_id), reservation_custom_tools(name, sort_order)",
      )
      .eq("id", id)
      .single(),
    getCachedStaffMasters(),
  ]);
  const reservation = reservationResult.data;
  const { categories, contents, serviceContentTools, tools, workers } = masters;

  if (!reservation) notFound();

  const month = query.month ?? reservation.scheduled_at.slice(0, 7);
  const selectedWorkerIds = new Set(
    (reservation.reservation_workers ?? [])
      .filter((assignment) => !assignment.is_supporter)
      .map((assignment) => assignment.worker_id),
  );
  const initialWorkItems =
    reservation.reservation_service_contents && reservation.reservation_service_contents.length > 0
      ? [...reservation.reservation_service_contents].sort((a, b) => a.sort_order - b.sort_order)
      : reservation.service_content_id
        ? [{ service_content_id: reservation.service_content_id, quantity: 1, sort_order: 0 }]
        : [];
  const initialToolIds = (reservation.reservation_tools ?? []).map((tool) => tool.tool_id);
  const initialCustomToolNames = [...(reservation.reservation_custom_tools ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((tool) => tool.name);
  const reservationStatus = reservation.status as ReservationStatus;

  return (
    <AdminLayout displayName={profile.display_name}>
      <div className="mobile-page">
        <Link className="back-link" href={`/admin/dashboard?month=${month}#schedules`}>
          <ArrowLeft size={16} />
          案件一覧へ戻る
        </Link>
        <section className="admin-section admin-edit-section">
          <div className="admin-section-heading">
            <div>
              <Save size={19} />
              <span>
                <h2>案件を編集</h2>
                <p>管理者側で予定内容と作業者を修正できます</p>
              </span>
            </div>
            <span className={statusClass(reservationStatus)}>{reservationLabels[reservationStatus]}</span>
          </div>
          <form action={updateAdminReservation} className="staff-form">
            <input name="reservation_id" type="hidden" value={reservation.id} />
            <input name="month" type="hidden" value={month} />
            <label>
              <span>日時 *</span>
              <input
                defaultValue={toDateTimeLocal(reservation.scheduled_at)}
                name="scheduled_at"
                required
                type="datetime-local"
              />
            </label>
            <label>
              <span>お客様名</span>
              <input defaultValue={reservation.customer_name ?? ""} name="customer_name" placeholder="例：山田様" />
            </label>
            <label>
              <span>電話番号</span>
              <input
                defaultValue={reservation.customer_phone ?? ""}
                inputMode="tel"
                name="customer_phone"
                placeholder="例：090-1234-5678"
                type="tel"
              />
            </label>
            <label>
              <span>住所 *</span>
              <input defaultValue={reservation.address} name="address" required />
            </label>
            <label>
              <span>区分 *</span>
              <select
                defaultValue={reservation.service_category_id ?? ""}
                name="service_category_id"
                required
              >
                <option disabled value="">区分を選択</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <ReservationWorkItemsFieldset
              contents={contents}
              initialCustomToolNames={initialCustomToolNames}
              initialManualToolIds={initialToolIds}
              initialWorkItems={initialWorkItems}
              serviceContentTools={serviceContentTools}
              tools={tools}
            />
            <fieldset className="tool-fieldset">
              <legend>作業担当者 *（複数選択可）</legend>
              <div className="worker-options">
                {workers.map((worker) => (
                  <label key={worker.id}>
                    <input
                      defaultChecked={selectedWorkerIds.has(worker.id)}
                      name="worker_ids"
                      type="checkbox"
                      value={worker.id}
                    />
                    <span>
                      <strong>{worker.name}</strong>
                      <small>{worker.worker_type === "employee" ? "従業員" : "外注"}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>駐車場 *</span>
              <select
                defaultValue={reservation.parking_available ? "true" : "false"}
                name="parking_available"
                required
              >
                <option value="true">あり</option>
                <option value="false">なし</option>
              </select>
            </label>
            <label>
              <span>駐車場メモ</span>
              <textarea
                defaultValue={reservation.parking_notes ?? ""}
                name="parking_notes"
                placeholder="駐車位置や近隣の駐車場所"
                rows={3}
              />
            </label>
            <label>
              <span>備考</span>
              <textarea defaultValue={reservation.notes ?? ""} name="notes" rows={5} />
            </label>
            <SubmitButton className="primary-button green-button" pendingLabel="変更を保存中...">
              <Save size={17} />
              変更を保存
            </SubmitButton>
          </form>
        </section>
      </div>
    </AdminLayout>
  );
}
