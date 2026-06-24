import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  MapPin,
  ReceiptText,
  Save,
  Tags,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import {
  reviewWorkReport,
  saveServiceCategory,
  saveWorker,
  updateExpenseStatus,
} from "@/app/actions";
import { AdminLayout } from "@/components/AdminLayout";
import { DeleteWorkerForm } from "@/components/DeleteWorkerForm";
import { DeleteServiceCategoryForm } from "@/components/DeleteServiceCategoryForm";
import { PurchaseExpenseForm } from "@/components/PurchaseExpenseForm";
import { requireRole } from "@/lib/auth";
import { getCachedAdminDashboardData } from "@/lib/cached-data";
import { calculateSummary, formatCurrency } from "@/lib/finance";
import { expenseLabels, reservationLabels, statusClass } from "@/lib/labels";
import type { ReservationWithRelations } from "@/lib/types";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00+09:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year}年${Number(value)}月`;
}

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

function paymentLabel(method: string) {
  return { cash: "現金", card: "カード", invoice: "請求書", other: "その他" }[method] ?? method;
}

function hasApprovedReport(reservation: ReservationWithRelations) {
  return reservation.work_reports.some((report) => report.approval_status === "approved");
}

function isApprovedCompleted(reservation: ReservationWithRelations) {
  return reservation.status === "completed" && hasApprovedReport(reservation);
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const selectedMonth = params.month ?? new Date().toISOString().slice(0, 7);
  const range = monthRange(selectedMonth);
  const { workers, categories, reservations, expenses } = await getCachedAdminDashboardData(
    range.start,
    range.end,
  );
  const summary = calculateSummary(reservations, expenses);
  const pendingReports = reservations.flatMap((reservation) =>
    reservation.work_reports
      .filter((report) => report.approval_status === "pending")
      .map((report) => ({ reservation, report })),
  );
  const approvedReports = reservations.flatMap((reservation) =>
    reservation.work_reports
      .filter((report) => report.approval_status === "approved" && reservation.status === "completed")
      .map((report) => ({ reservation, report })),
  );
  const unreportedReservations = reservations.filter(
    (reservation) =>
      reservation.status === "scheduled" &&
      new Date(reservation.scheduled_at) < new Date() &&
      reservation.work_reports.length === 0,
  );
  const pendingExpenses = expenses.filter((expense) => expense.status === "requested");
  const completedCount = reservations.filter(isApprovedCompleted).length;
  const scheduledCount = reservations.filter((item) => item.status === "scheduled").length;
  const categorySales = categories
    .map((category) => {
      const categoryReservations = reservations.filter(
        (item) => isApprovedCompleted(item) && item.service_category_id === category.id,
      );
      return {
        id: category.id,
        name: category.name,
        count: categoryReservations.length,
        sales: categoryReservations.reduce((sum, item) => sum + Number(item.amount), 0),
      };
    })
    .filter((item) => item.count > 0 || categories.find((category) => category.id === item.id)?.active)
    .sort((a, b) => b.sales - a.sales);

  return (
    <AdminLayout displayName={profile.display_name}>
      <header className="admin-topbar">
        <div>
          <p>管理ダッシュボード</p>
          <h1>{monthLabel(selectedMonth)}の運営状況</h1>
        </div>
        <form className="admin-month-form">
          <input defaultValue={selectedMonth} name="month" type="month" />
          <button type="submit">表示</button>
        </form>
      </header>

      <section className="admin-section" id="overview">
        <div className="admin-summary-grid">
          <article className="summary-tile">
            <span className="summary-icon green"><CircleDollarSign size={20} /></span>
            <div><small>確定売上</small><strong>{formatCurrency(summary.totalSales)}</strong></div>
            <em>{completedCount}件完了</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon blue"><Banknote size={20} /></span>
            <div><small>給与・外注費</small><strong>{formatCurrency(summary.totalPayroll + summary.totalContractorCosts)}</strong></div>
            <em>給与 {formatCurrency(summary.totalPayroll)}</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon amber"><ReceiptText size={20} /></span>
            <div><small>購入済み経費</small><strong>{formatCurrency(summary.purchasedExpenses)}</strong></div>
            <em>{expenses.filter((item) => item.status === "purchased").length}件</em>
          </article>
          <article className="summary-tile profit">
            <span className="summary-icon green"><TrendingUp size={20} /></span>
            <div><small>純利益</small><strong>{formatCurrency(summary.netProfit)}</strong></div>
            <em>売上から給与・外注・経費を控除</em>
          </article>
        </div>

        <div className="attention-strip">
          <div>
            <ClipboardCheck size={18} />
            <span>実績承認待ち</span>
            <strong>{pendingReports.length}件</strong>
          </div>
          <div>
            <CheckCircle2 size={18} />
            <span>承認済み実績</span>
            <strong>{approvedReports.length}件</strong>
          </div>
          <div>
            <AlertTriangle size={18} />
            <span>未報告案件</span>
            <strong>{unreportedReservations.length}件</strong>
          </div>
          <div>
            <ReceiptText size={18} />
            <span>経費承認待ち</span>
            <strong>{pendingExpenses.length}件</strong>
          </div>
          <div>
            <CalendarDays size={18} />
            <span>今月の予定</span>
            <strong>{scheduledCount}件</strong>
          </div>
        </div>
      </section>

      <section className="admin-section" id="unreported">
        <div className="admin-section-heading">
          <div><AlertTriangle size={19} /><span><h2>未報告案件</h2><p>作業日を過ぎても実績報告がない案件</p></span></div>
          <strong>{unreportedReservations.length}件</strong>
        </div>
        {unreportedReservations.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle2 size={25} />
            <p>未報告の案件はありません</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>日付</th><th>案件名</th><th>作業者</th><th>住所</th></tr></thead>
              <tbody>
                {unreportedReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="nowrap">{formatDateTime(reservation.scheduled_at)}</td>
                    <td><strong>{reservation.service_content}</strong></td>
                    <td>{workerNames(reservation) || "未設定"}</td>
                    <td>{reservation.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section" id="approvals">
        <div className="admin-section-heading">
          <div><ClipboardCheck size={19} /><span><h2>承認待ちの実績</h2><p>承認すると売上と給与計算へ反映されます</p></span></div>
          <strong>{pendingReports.length}件</strong>
        </div>
        {pendingReports.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle2 size={25} />
            <p>承認待ちの実績報告はありません</p>
          </div>
        ) : (
          <div className="approval-list">
            {pendingReports.map(({ reservation, report }) => (
              <article className="approval-item" key={report.id}>
                <div className="approval-main">
                  <div className="approval-title">
                    <strong>{reservation.service_content}</strong>
                    <span>{formatDateTime(reservation.scheduled_at)}</span>
                  </div>
                  <p><MapPin size={14} />{reservation.address}</p>
                  {reservation.customer_name || reservation.customer_phone ? (
                    <p>
                      <Users size={14} />
                      {[reservation.customer_name, reservation.customer_phone].filter(Boolean).join(" / ")}
                    </p>
                  ) : null}
                  <div className="approval-report">
                    <span>完了報告</span>
                    <p>{report.report_text}</p>
                    {report.issues ? <p className="warning-text"><AlertTriangle size={14} />{report.issues}</p> : null}
                  </div>
                  <div className="payment-review">
                    <span>支払方法: {paymentLabel(report.payment_method)}</span>
                    {report.payment_method === "card" && report.card_statement_url ? (
                      <a href={report.card_statement_url} rel="noreferrer" target="_blank">カード明細を確認</a>
                    ) : null}
                    {report.payment_method === "cash" ? (
                      <span>
                        前回釣銭 {formatCurrency(Number(report.previous_change_amount))} /
                        現在残高 {formatCurrency(Number(report.current_cash_balance))} /
                        今回釣銭 {formatCurrency(Number(report.change_amount))} /
                        管理者へ渡す {formatCurrency(Number(report.cash_collected_amount))}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="approval-side">
                  <small>報告売上</small>
                  <strong>{formatCurrency(Number(report.reported_amount))}</strong>
                  <span><Users size={13} />{workerNames(reservation) || "担当未設定"}</span>
                  <div className="approval-actions">
                    <form action={reviewWorkReport}>
                      <input name="report_id" type="hidden" value={report.id} />
                      <input name="decision" type="hidden" value="approved" />
                      <button className="button" type="submit">承認する</button>
                    </form>
                    <form action={reviewWorkReport}>
                      <input name="report_id" type="hidden" value={report.id} />
                      <input name="decision" type="hidden" value="rejected" />
                      <button className="button danger" type="submit">差し戻す</button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section" id="approved-reports">
        <div className="admin-section-heading">
          <div><CheckCircle2 size={19} /><span><h2>承認済み実績</h2><p>確定売上と給与計算に反映済みの案件</p></span></div>
          <strong>{approvedReports.length}件</strong>
        </div>
        {approvedReports.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle2 size={25} />
            <p>承認済みの実績はありません</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>区分</th>
                  <th>案件</th>
                  <th>作業者</th>
                  <th>支払</th>
                  <th className="numeric">売上</th>
                </tr>
              </thead>
              <tbody>
                {approvedReports.map(({ reservation, report }) => (
                  <tr key={report.id}>
                    <td className="nowrap">{formatDateTime(reservation.scheduled_at)}</td>
                    <td>{reservation.service_categories?.name ?? "未設定"}</td>
                    <td>
                      <strong>{reservation.customer_name || "お客様名未入力"}</strong>
                      <small>{reservation.service_content}</small>
                      <small>{reservation.address}</small>
                    </td>
                    <td>{workerNames(reservation) || "未設定"}</td>
                    <td>{paymentLabel(report.payment_method)}</td>
                    <td className="numeric">{formatCurrency(Number(report.reported_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section" id="finance">
        <div className="admin-section-heading">
          <div><Banknote size={19} /><span><h2>給与・外注費</h2><p>承認済み実績から自動集計</p></span></div>
        </div>
        <div className="finance-columns">
          <article className="finance-panel">
            <header><span><UserRound size={17} />従業員給与</span><strong>{formatCurrency(summary.totalPayroll)}</strong></header>
            {summary.payroll.map((item) => (
              <div className="finance-row" key={item.staffName}><span>{item.staffName}</span><strong>{formatCurrency(item.amount)}</strong></div>
            ))}
            {summary.payroll.length === 0 ? <p className="muted">給与データはありません</p> : null}
          </article>
          <article className="finance-panel">
            <header><span><Users size={17} />外注費</span><strong>{formatCurrency(summary.totalContractorCosts)}</strong></header>
            {summary.contractorCosts.map((item) => (
              <div className="finance-row" key={item.workerName}><span>{item.workerName}</span><strong>{formatCurrency(item.amount)}</strong></div>
            ))}
            {summary.contractorCosts.length === 0 ? <p className="muted">外注費データはありません</p> : null}
          </article>
        </div>
        <div className="category-sales">
          <h3><Tags size={17} />区分別売上</h3>
          <div className="category-sales-grid">
            {categorySales.map((item) => (
              <article key={item.id}>
                <span>{item.name}</span>
                <strong>{formatCurrency(item.sales)}</strong>
                <small>{item.count}件</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-section" id="schedules">
        <div className="admin-section-heading">
          <div><CalendarDays size={19} /><span><h2>案件一覧</h2><p>予定から完了まで月単位で確認</p></span></div>
          <strong>{reservations.length}件</strong>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>日時</th><th>区分</th><th>案件内容</th><th>作業者</th><th>状態</th><th className="numeric">売上</th></tr></thead>
            <tbody>
              {reservations.map((reservation) => (
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
                  <td><span className={statusClass(reservation.status)}>{reservationLabels[reservation.status]}</span></td>
                  <td className="numeric">{isApprovedCompleted(reservation) ? formatCurrency(Number(reservation.amount)) : "-"}</td>
                </tr>
              ))}
              {reservations.length === 0 ? <tr><td colSpan={6}>この月の案件はありません</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section" id="expenses">
        <div className="admin-section-heading">
          <div><ReceiptText size={19} /><span><h2>経費管理</h2><p>申請の承認と領収書付き購入処理</p></span></div>
          <strong>{expenses.length}件</strong>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>申請日</th><th>申請者・項目</th><th>状態</th><th className="numeric">金額</th><th>操作</th></tr></thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="nowrap">{new Date(expense.created_at).toLocaleDateString("ja-JP")}</td>
                  <td><strong>{expense.expense_categories?.name}</strong><small>{expense.profiles?.display_name} / {expense.note || "備考なし"}</small></td>
                  <td><span className={statusClass(expense.status)}>{expenseLabels[expense.status]}</span></td>
                  <td className="numeric">{formatCurrency(Number(expense.amount))}</td>
                  <td>
                    <div className="table-actions">
                      {expense.status === "requested" ? (
                        <>
                          <form action={updateExpenseStatus}>
                            <input name="expense_id" type="hidden" value={expense.id} />
                            <input name="status" type="hidden" value="approved" />
                            <button className="button" type="submit">承認</button>
                          </form>
                          <form action={updateExpenseStatus}>
                            <input name="expense_id" type="hidden" value={expense.id} />
                            <input name="status" type="hidden" value="rejected" />
                            <button className="button danger" type="submit">却下</button>
                          </form>
                        </>
                      ) : null}
                      {expense.status === "approved" ? <PurchaseExpenseForm expenseId={expense.id} /> : null}
                      {expense.receipt_url ? <a className="text-link" href={expense.receipt_url} rel="noreferrer" target="_blank">領収書</a> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 ? <tr><td colSpan={5}>この月の経費申請はありません</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section" id="categories">
        <div className="admin-section-heading">
          <div><Tags size={19} /><span><h2>区分マスタ</h2><p>予定登録で選択する区分を管理</p></span></div>
          <strong>{categories.filter((item) => item.active).length}件</strong>
        </div>
        <form action={saveServiceCategory} className="master-create-form">
          <label><span>区分名</span><input name="name" required /></label>
          <button className="button" type="submit">区分を追加</button>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table master-table">
            <thead><tr><th>区分名</th><th>状態</th><th className="numeric">今月の売上</th><th>操作</th></tr></thead>
            <tbody>
              {categories.map((category) => {
                const sales = categorySales.find((item) => item.id === category.id);
                return (
                  <tr key={category.id}>
                    <td>
                      <form action={saveServiceCategory} className="inline-edit-form">
                        <input name="category_id" type="hidden" value={category.id} />
                        <input defaultValue={category.name} name="name" required />
                        <select defaultValue={category.active ? "true" : "false"} name="active">
                          <option value="true">有効</option>
                          <option value="false">無効</option>
                        </select>
                        <button aria-label={`${category.name}を保存`} className="table-icon-button save" type="submit">
                          <Save size={15} />
                        </button>
                      </form>
                    </td>
                    <td><span className={category.active ? "status green" : "status red"}>{category.active ? "有効" : "無効"}</span></td>
                    <td className="numeric">{formatCurrency(sales?.sales ?? 0)}</td>
                    <td><DeleteServiceCategoryForm categoryId={category.id} categoryName={category.name} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section" id="workers">
        <div className="admin-section-heading">
          <div><Users size={19} /><span><h2>作業者マスタ</h2><p>従業員と外注先の報酬設定</p></span></div>
          <strong>{workers.filter((item) => item.active).length}名</strong>
        </div>
        <form action={saveWorker} className="worker-create-form">
          <label><span>作業者名</span><input name="name" required /></label>
          <label><span>区分</span><select name="worker_type"><option value="employee">従業員</option><option value="contractor">外注</option></select></label>
          <label><span>報酬方式</span><select name="compensation_type"><option value="percentage">歩合率</option><option value="fixed">固定額</option></select></label>
          <label><span>歩合率・固定額</span><input min="0" name="compensation_value" required type="number" /></label>
          <button className="button" type="submit">作業者を追加</button>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table worker-master-table">
            <thead><tr><th>作業者名</th><th>区分</th><th>報酬方式</th><th>歩合率・固定額</th><th>状態</th><th>操作</th></tr></thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td colSpan={5}>
                    <form action={saveWorker} className="worker-row-form">
                      <input name="worker_id" type="hidden" value={worker.id} />
                      <input defaultValue={worker.name} name="name" required />
                      <select defaultValue={worker.worker_type} name="worker_type">
                        <option value="employee">従業員</option>
                        <option value="contractor">外注</option>
                      </select>
                      <select defaultValue={worker.default_compensation_type} name="compensation_type">
                        <option value="percentage">歩合率</option>
                        <option value="fixed">固定額</option>
                      </select>
                      <input defaultValue={worker.default_compensation_value} min="0" name="compensation_value" required step="0.01" type="number" />
                      <select defaultValue={worker.active ? "true" : "false"} name="active">
                        <option value="true">有効</option>
                        <option value="false">無効</option>
                      </select>
                      <button aria-label={`${worker.name}を保存`} className="table-icon-button save" type="submit"><Save size={15} /></button>
                    </form>
                  </td>
                  <td><DeleteWorkerForm workerId={worker.id} workerName={worker.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
