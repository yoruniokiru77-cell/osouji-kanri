import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { updateStaffReservation } from "@/app/actions";
import { StaffLayout } from "@/components/StaffLayout";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ServiceCategory, ServiceContent, Worker } from "@/lib/types";

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

export default async function StaffScheduleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole("staff");
  const { id } = await params;
  const supabase = await createClient();
  const [reservationResult, categoryResult, workerResult, contentResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, scheduled_at, address, service_content, service_content_id, service_category_id, parking_available, parking_notes, notes, status, reservation_staff!inner(staff_id), reservation_workers(worker_id)",
      )
      .eq("id", id)
      .eq("reservation_staff.staff_id", profile.id)
      .single(),
    supabase
      .from("service_categories")
      .select("id, name, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("workers")
      .select("id, name, worker_type, default_compensation_type, default_compensation_value, active")
      .eq("active", true)
      .order("worker_type")
      .order("name"),
    supabase
      .from("service_contents")
      .select("id, name, active")
      .eq("active", true)
      .order("name"),
  ]);
  const reservation = reservationResult.data;
  const categories = (categoryResult.data ?? []) as ServiceCategory[];
  const workers = (workerResult.data ?? []) as Worker[];
  const contents = (contentResult.data ?? []) as ServiceContent[];

  if (!reservation) notFound();

  const editable = reservation.status === "scheduled";
  const selectedWorkerIds = new Set(
    (reservation.reservation_workers ?? []).map((assignment) => assignment.worker_id),
  );

  return (
    <StaffLayout title="予定を編集">
      <div className="mobile-page">
        <Link className="back-link" href={`/staff/dashboard?date=${reservation.scheduled_at.slice(0, 10)}`}>
          <ArrowLeft size={16} />
          予定一覧へ戻る
        </Link>
        {!editable ? (
          <div className="empty-card">
            <p>完了済み、作業中、キャンセル済みの予定は変更できません。</p>
          </div>
        ) : (
          <form action={updateStaffReservation} className="staff-form">
            <input name="reservation_id" type="hidden" value={reservation.id} />
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
            <label>
              <span>作業内容 *</span>
              <select
                defaultValue={reservation.service_content_id ?? ""}
                name="service_content_id"
                required
              >
                <option disabled value="">作業内容を選択</option>
                {contents.map((content) => (
                  <option key={content.id} value={content.id}>{content.name}</option>
                ))}
              </select>
            </label>
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
              {workers.length === 0 ? (
                <p className="field-help">作業者マスタが未登録です。</p>
              ) : null}
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
            <button className="primary-button green-button" type="submit">
              <Save size={17} />
              変更を保存
            </button>
          </form>
        )}
      </div>
    </StaffLayout>
  );
}
