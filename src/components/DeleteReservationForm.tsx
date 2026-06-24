"use client";

import { Trash2 } from "lucide-react";
import { cancelStaffReservation } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function DeleteReservationForm({
  reservationId,
  scheduledDate,
}: {
  reservationId: string;
  scheduledDate: string;
}) {
  return (
    <form
      action={cancelStaffReservation}
      className="staff-form danger-zone"
      onSubmit={(event) => {
        if (!window.confirm("この予定を削除しますか？削除するとスタッフ画面の予定一覧から非表示になります。")) {
          event.preventDefault();
        }
      }}
    >
      <input name="reservation_id" type="hidden" value={reservationId} />
      <input name="scheduled_date" type="hidden" value={scheduledDate} />
      <SubmitButton className="secondary-button danger-button" pendingLabel="予定を削除中...">
        <Trash2 size={17} />
        予定を削除
      </SubmitButton>
    </form>
  );
}
