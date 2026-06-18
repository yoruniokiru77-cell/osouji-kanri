import { CheckCircle2 } from "lucide-react";
import { StaffLayout } from "@/components/StaffLayout";
import { StaffReportForm } from "@/components/StaffReportForm";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReservationWithRelations, Worker } from "@/lib/types";

export default async function StaffReportPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; booking?: string }>;
}) {
  const profile = await requireRole("staff");
  const params = await searchParams;
  const supabase = await createClient();
  const [reservationResult, latestCashResult, workerResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, scheduled_at, address, amount, service_content, service_category_id, parking_available, parking_notes, notes, status, reservation_staff!inner(staff_id, profiles(id, display_name, role, commission_rate)), reservation_workers(worker_id, compensation_type, compensation_value, workers(id, name, worker_type, default_compensation_type, default_compensation_value, active)), reservation_tools(tools(id, name)), work_reports(*)",
      )
      .eq("reservation_staff.staff_id", profile.id)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("work_reports")
      .select("change_amount")
      .eq("staff_id", profile.id)
      .eq("payment_method", "cash")
      .not("change_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workers")
      .select("id, name, worker_type, default_compensation_type, default_compensation_value, active")
      .eq("active", true)
      .order("worker_type")
      .order("name"),
  ]);
  const reservations = (reservationResult.data ?? []) as unknown as ReservationWithRelations[];
  const workers = (workerResult.data ?? []) as Worker[];
  const previousChangeAmount = Number(latestCashResult.data?.change_amount ?? 0);

  if (params.success === "1") {
    return (
      <StaffLayout title="実績報告">
        <div className="success-state">
          <span><CheckCircle2 size={34} /></span>
          <h1>報告を送信しました</h1>
          <p>管理者の承認後、売上と給与へ反映されます。</p>
          <a className="secondary-button" href="/staff/report">別の案件を報告する</a>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="実績報告">
      <div className="mobile-page">
        <p className="page-lead">作業完了後に売上、決済情報、作業内容を入力してください。</p>
        <StaffReportForm
          initialBookingId={params.booking}
          previousChangeAmount={previousChangeAmount}
          bookings={reservations.map((booking) => ({
            id: booking.id,
            scheduledAt: booking.scheduled_at,
            address: booking.address,
            content: booking.service_content,
            status: booking.status,
            workerIds: booking.reservation_workers.map((assignment) => assignment.worker_id),
          }))}
          workers={workers}
        />
      </div>
    </StaffLayout>
  );
}
