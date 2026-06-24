import { AlertCircle, CheckCircle2 } from "lucide-react";
import { StaffLayout } from "@/components/StaffLayout";
import { StaffReportForm } from "@/components/StaffReportForm";
import { requireRole } from "@/lib/auth";
import { getCachedStaffReportData } from "@/lib/cached-data";

export default async function StaffReportPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; booking?: string; error?: string }>;
}) {
  const profile = await requireRole("staff");
  const params = await searchParams;
  const { previousChangeAmount, reservations, workers } = await getCachedStaffReportData(profile.id);

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
        {params.error ? (
          <div className="form-error-box">
            <AlertCircle size={18} />
            <span>{params.error}</span>
          </div>
        ) : null}
        <StaffReportForm
          initialBookingId={params.booking}
          previousChangeAmount={previousChangeAmount}
          bookings={reservations.map((booking) => ({
            id: booking.id,
            scheduledAt: booking.scheduled_at,
            customerName: booking.customer_name,
            customerPhone: booking.customer_phone,
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
