import type { ExpenseStatus, ReservationStatus } from "@/lib/types";

export const reservationLabels: Record<ReservationStatus, string> = {
  scheduled: "予定",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
};

export const expenseLabels: Record<ExpenseStatus, string> = {
  requested: "承認待ち",
  approved: "承認済み",
  purchased: "購入済み",
  rejected: "却下",
};

export function statusClass(status: string) {
  if (status === "completed" || status === "purchased") return "status green";
  if (status === "in_progress" || status === "requested") return "status amber";
  if (status === "cancelled" || status === "rejected") return "status red";
  return "status blue";
}
