import { ReceiptText } from "lucide-react";
import { addExpenseReceipts, createExpense } from "@/app/actions";
import { ExpenseFormToggle } from "@/components/ExpenseFormToggle";
import { ExpenseReceiptUpload } from "@/components/ExpenseReceiptUpload";
import { StaffLayout } from "@/components/StaffLayout";
import { requireRole } from "@/lib/auth";
import { getCachedStaffExpenseData } from "@/lib/cached-data";
import { parseReservationDate } from "@/lib/datetime";
import { formatCurrency } from "@/lib/finance";
import { expenseLabels, statusClass } from "@/lib/labels";
import type { ReservationWithRelations } from "@/lib/types";

function isIchijoReservation(reservation: ReservationWithRelations) {
  return Boolean(reservation.service_categories?.name?.includes("一条"));
}

function reservationOptionLabel(reservation: ReservationWithRelations) {
  return [
    parseReservationDate(reservation.scheduled_at).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
    }),
    reservation.customer_name || reservation.service_content,
    reservation.service_categories?.name,
  ]
    .filter(Boolean)
    .join(" / ");
}

function parseReceiptUrls(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [value];
  } catch {
    return [value];
  }
}

export default async function StaffExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string; success?: string }>;
}) {
  const profile = await requireRole("staff");
  const params = await searchParams;
  const { categories, expenses, reservations } = await getCachedStaffExpenseData(profile.id);
  const linkedIchijoReservationIds = new Set(
    expenses
      .filter((expense) => expense.status !== "rejected")
      .flatMap((expense) => expense.expense_reservations?.map((link) => link.reservation_id) ?? []),
  );
  const ichijoReservations = reservations.filter(
    (reservation) => isIchijoReservation(reservation) && !linkedIchijoReservationIds.has(reservation.id),
  );

  return (
    <StaffLayout title="経費申請">
      <div className="mobile-page">
        {params.success === "1" ? <div className="success-banner">経費申請を送信しました</div> : null}
        {params.receipt === "1" ? <div className="success-banner">領収書画像を追加しました</div> : null}
        <ExpenseFormToggle>
          <form action={createExpense} className="staff-form glass-card inset-form">
            <h2>経費申請フォーム</h2>
            <label><span>経費項目 *</span><select name="category_id" required><option value="">項目を選択</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>金額 *</span><div className="currency-input"><b>¥</b><input min="1" name="amount" placeholder="0" required type="number" /></div></label>
            <label><span>関連案件（任意）</span><select name="reservation_id"><option value="">案件に紐付けない</option>{reservations.map((item) => <option key={item.id} value={item.id}>{parseReservationDate(item.scheduled_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} - {item.service_content}</option>)}</select></label>
            <div>
              <span className="form-label">領収書画像</span>
              <ExpenseReceiptUpload />
            </div>
            {ichijoReservations.length > 0 ? (
              <fieldset className="form-check-panel">
                <legend>一条案件のクリーニング領収書に紐づけ</legend>
                <p className="field-help">2日分をまとめて出した場合は、該当する案件をすべて選択してください。</p>
                <div className="check-list">
                  {ichijoReservations.map((reservation) => (
                    <label key={reservation.id}>
                      <input name="linked_reservation_ids" type="checkbox" value={reservation.id} />
                      <span>{reservationOptionLabel(reservation)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
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
                  <div>
                    <strong>{expense.expense_categories?.name}</strong>
                    <p>{expense.note || "詳細なし"}</p>
                    {expense.expense_reservations && expense.expense_reservations.length > 0 ? (
                      <small>
                        紐づけ:{" "}
                        {expense.expense_reservations
                          .map((link) => link.reservations?.customer_name || link.reservations?.service_content)
                          .filter(Boolean)
                          .join("、")}
                      </small>
                    ) : null}
                    {parseReceiptUrls(expense.receipt_url).length > 0 ? (
                      <small>
                        領収書:{" "}
                        {parseReceiptUrls(expense.receipt_url).map((url, index) => (
                          <a className="text-link" href={url} key={url} rel="noreferrer" target="_blank">
                            画像{index + 1}
                          </a>
                        ))}
                      </small>
                    ) : null}
                    <small>{new Date(expense.created_at).toLocaleDateString("ja-JP")}</small>
                  </div>
                  <div><strong>{formatCurrency(Number(expense.amount))}</strong><span className={statusClass(expense.status)}>{expenseLabels[expense.status]}</span></div>
                  {expense.status !== "rejected" ? (
                    <form action={addExpenseReceipts} className="expense-receipt-add-form">
                      <input name="expense_id" type="hidden" value={expense.id} />
                      <ExpenseReceiptUpload inputName="receipt_urls" />
                      <button className="button" type="submit">領収書を追加</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </StaffLayout>
  );
}
