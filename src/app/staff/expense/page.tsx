import { ReceiptText } from "lucide-react";
import { createExpense } from "@/app/actions";
import { ExpenseFormToggle } from "@/components/ExpenseFormToggle";
import { StaffLayout } from "@/components/StaffLayout";
import { requireRole } from "@/lib/auth";
import { formatCurrency } from "@/lib/finance";
import { expenseLabels, statusClass } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { Expense, ExpenseCategory, ReservationWithRelations } from "@/lib/types";

export default async function StaffExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const profile = await requireRole("staff");
  const params = await searchParams;
  const supabase = await createClient();
  const [categoryResult, reservationResult, expenseResult] = await Promise.all([
    supabase.from("expense_categories").select("id, name").order("name"),
    supabase
      .from("reservations")
      .select(
        "id, scheduled_at, address, amount, service_content, parking_available, notes, status, reservation_staff!inner(staff_id), reservation_tools(tools(id, name)), work_reports(*)",
      )
      .eq("reservation_staff.staff_id", profile.id)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("expenses")
      .select(
        "id, staff_id, category_id, reservation_id, amount, note, status, receipt_url, created_at, profiles(id, display_name, role, commission_rate), expense_categories(id, name)",
      )
      .eq("staff_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);
  const categories = (categoryResult.data ?? []) as ExpenseCategory[];
  const reservations = (reservationResult.data ?? []) as unknown as ReservationWithRelations[];
  const expenses = (expenseResult.data ?? []) as unknown as Expense[];

  return (
    <StaffLayout title="経費申請">
      <div className="mobile-page">
        {params.success === "1" ? <div className="success-banner">経費申請を送信しました</div> : null}
        <ExpenseFormToggle>
          <form action={createExpense} className="staff-form glass-card inset-form">
            <h2>経費申請フォーム</h2>
            <label><span>経費項目 *</span><select name="category_id" required><option value="">項目を選択</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>金額 *</span><div className="currency-input"><b>¥</b><input min="1" name="amount" placeholder="0" required type="number" /></div></label>
            <label><span>関連案件（任意）</span><select name="reservation_id"><option value="">案件に紐付けない</option>{reservations.map((item) => <option key={item.id} value={item.id}>{new Date(item.scheduled_at).toLocaleDateString("ja-JP")} - {item.service_content}</option>)}</select></label>
            <label><span>メモ・詳細</span><textarea name="note" placeholder="例：近隣コインパーキング2時間分" rows={3} /></label>
            <button className="primary-button amber-button" type="submit">申請する</button>
          </form>
        </ExpenseFormToggle>

        <section className="page-section">
          <div className="section-heading"><h2>申請履歴</h2><span>{expenses.length}件</span></div>
          {expenses.length === 0 ? <div className="empty-card"><ReceiptText size={26} /><p>申請履歴はありません</p></div> : (
            <div className="card-list">
              {expenses.map((expense) => (
                <article className="expense-card glass-card" key={expense.id}>
                  <span className="action-icon amber"><ReceiptText size={17} /></span>
                  <div><strong>{expense.expense_categories?.name}</strong><p>{expense.note || "詳細なし"}</p><small>{new Date(expense.created_at).toLocaleDateString("ja-JP")}</small></div>
                  <div><strong>{formatCurrency(Number(expense.amount))}</strong><span className={statusClass(expense.status)}>{expenseLabels[expense.status]}</span></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </StaffLayout>
  );
}
