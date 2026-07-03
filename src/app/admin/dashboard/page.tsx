import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  MapPin,
  Pencil,
  ReceiptText,
  Save,
  Tags,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  reopenWorkReport,
  reviewWorkReport,
  saveServiceCategory,
  saveWorker,
  updateExpenseStatus,
} from "@/app/actions";
import { AdminLayout } from "@/components/AdminLayout";
import { DeleteWorkerForm } from "@/components/DeleteWorkerForm";
import { DeleteServiceCategoryForm } from "@/components/DeleteServiceCategoryForm";
import { PurchaseExpenseForm } from "@/components/PurchaseExpenseForm";
import { SubmitButton } from "@/components/SubmitButton";
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

function parseReceiptUrls(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [value];
  } catch {
    return [value];
  }
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

function isOtaWorkerName(name?: string) {
  return Boolean(name?.includes("太田"));
}

function isIchijoReservation(reservation: ReservationWithRelations) {
  return Boolean(reservation.service_categories?.name?.includes("一条"));
}

function otaSalesShare(reservation: ReservationWithRelations) {
  const normalWorkers = reservation.reservation_workers.filter(
    (assignment) => !assignment.is_supporter && assignment.workers,
  );
  if (normalWorkers.length === 0) return 0;

  const includesOta = normalWorkers.some((assignment) => isOtaWorkerName(assignment.workers?.name));
  if (!includesOta) return 0;

  return Math.floor(Number(reservation.amount) / normalWorkers.length);
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    schedule_worker?: string;
    show_cancelled?: string;
    show_reported?: string;
  }>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const selectedMonth = params.month ?? new Date().toISOString().slice(0, 7);
  const selectedScheduleWorker = params.schedule_worker ?? "";
  const showCancelledSchedules = params.show_cancelled === "1";
  const showReportedSchedules = params.show_reported === "1";
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
  const linkedCleaningReservationIds = new Set(
    expenses.flatMap((expense) => expense.expense_reservations?.map((link) => link.reservation_id) ?? []),
  );
  const unlinkedIchijoReservations = reservations.filter(
    (reservation) => isIchijoReservation(reservation) && !linkedCleaningReservationIds.has(reservation.id),
  );
  const completedCount = reservations.filter(isApprovedCompleted).length;
  const scheduledCount = reservations.filter((item) => item.status === "scheduled").length;
  const otaTotalSales = reservations
    .filter(isApprovedCompleted)
    .reduce((sum, item) => sum + otaSalesShare(item), 0);
  const otaPayroll = summary.payroll
    .filter((item) => isOtaWorkerName(item.staffName))
    .reduce((sum, item) => sum + item.amount, 0);
  const totalContractorAndSupportCosts = summary.totalContractorCosts;
  const taxSummaryRows = [
    { label: "全体売上", value: summary.totalSales },
    { label: "太田給料", value: otaPayroll },
    { label: "外注・応援費", value: totalContractorAndSupportCosts },
    { label: "購入済み経費", value: summary.purchasedExpenses },
    { label: "申告用利益", value: summary.netProfit },
  ];
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
  const visibleScheduleReservations = reservations.filter((reservation) => {
    const matchesWorker =
      !selectedScheduleWorker ||
      reservation.reservation_workers.some((assignment) => assignment.worker_id === selectedScheduleWorker);
    const matchesCancelled = showCancelledSchedules || reservation.status !== "cancelled";
    const matchesReported = showReportedSchedules || reservation.work_reports.length === 0;
    return matchesWorker && matchesCancelled && matchesReported;
  });

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
            <div><small>全体売上</small><strong>{formatCurrency(summary.totalSales)}</strong></div>
            <em>{completedCount}件完了</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon blue"><UserRound size={20} /></span>
            <div><small>太田売上</small><strong>{formatCurrency(otaTotalSales)}</strong></div>
            <em>複数作業者は人数割り</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon blue"><Banknote size={20} /></span>
            <div><small>太田給料</small><strong>{formatCurrency(otaPayroll)}</strong></div>
            <em>承認済み実績から計算</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon amber"><Users size={20} /></span>
            <div><small>外注・応援費</small><strong>{formatCurrency(totalContractorAndSupportCosts)}</strong></div>
            <em>すきぴ・その他応援</em>
          </article>
          <article className="summary-tile">
            <span className="summary-icon amber"><ReceiptText size={20} /></span>
            <div><small>購入済み経費</small><strong>{formatCurrency(summary.purchasedExpenses)}</strong></div>
            <em>{expenses.filter((item) => item.status === "purchased").length}件</em>
          </article>
          <article className="summary-tile profit">
            <span className="summary-icon green"><TrendingUp size={20} /></span>
            <div><small>申告用利益</small><strong>{formatCurrency(summary.netProfit)}</strong></div>
            <em>全体売上から給与・外注・経費を控除</em>
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
            <AlertTriangle size={18} />
            <span>一条領収書未紐づけ</span>
            <strong>{unlinkedIchijoReservations.length}件</strong>
          </div>
          <div>
            <CalendarDays size={18} />
            <span>今月の予定</span>
            <strong>{scheduledCount}件</strong>
          </div>
        </div>
      </section>

      <section className="admin-section" id="ichijo-cleaning">
        <div className="admin-section-heading">
          <div><ReceiptText size={19} /><span><h2>一条クリーニング領収書確認</h2><p>スタッフが領収書経費に紐づけていない一条案件を確認</p></span></div>
          <strong>{unlinkedIchijoReservations.length}件</strong>
        </div>
        {unlinkedIchijoReservations.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle2 size={25} />
            <p>未紐づけの一条案件はありません</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>日時</th><th>区分</th><th>案件</th><th>作業者</th><th>状態</th></tr></thead>
              <tbody>
                {unlinkedIchijoReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="nowrap">{formatDateTime(reservation.scheduled_at)}</td>
                    <td>{reservation.service_categories?.name ?? "未設定"}</td>
                    <td>
                      <strong>{reservation.customer_name || reservation.service_content}</strong>
                      <small>{reservation.service_content}</small>
                      <small>{reservation.address}</small>
                    </td>
                    <td>{workerNames(reservation) || "未設定"}</td>
                    <td><span className={statusClass(reservation.status)}>{reservationLabels[reservation.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  <span><Users size={13} />{workerNames(reservation) || "担当未設定"}</span>
                  <div className="approval-actions">
                    <form action={reviewWorkReport} className="approval-amount-form">
                      <input name="report_id" type="hidden" value={report.id} />
                      <input name="reservation_id" type="hidden" value={reservation.id} />
                      <input name="decision" type="hidden" value="approved" />
                      <label>
                        <small>承認売上</small>
                        <span className="currency-input">
                          <b>¥</b>
                          <input
                            defaultValue={Number(report.reported_amount)}
                            min="0"
                            name="approved_amount"
                            required
                            type="number"
                          />
                        </span>
                      </label>
                      <fieldset>
                        <legend>作業者</legend>
                        <div className="approval-worker-options">
                          {workers.filter((worker) => worker.active).map((worker) => (
                            <label key={worker.id}>
                              <input
                                defaultChecked={reservation.reservation_workers.some(
                                  (assignment) =>
                                    assignment.worker_id === worker.id && !assignment.is_supporter,
                                )}
                                name="admin_worker_ids"
                                type="checkbox"
                                value={worker.id}
                              />
                              <span>{worker.name}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <SubmitButton className="button" pendingLabel="承認中...">
                        承認する
                      </SubmitButton>
                    </form>
                    <form action={reviewWorkReport}>
                      <input name="report_id" type="hidden" value={report.id} />
                      <input name="decision" type="hidden" value="rejected" />
                      <SubmitButton className="button danger" pendingLabel="差し戻し中...">
                        差し戻す
                      </SubmitButton>
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
                  <th>操作</th>
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
                    <td>
                      <form action={reopenWorkReport}>
                        <input name="report_id" type="hidden" value={report.id} />
                        <SubmitButton className="button" pendingLabel="戻し中...">
                          承認待ちへ戻す
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section" id="finance">
        <div className="admin-section-heading">
          <div><Banknote size={19} /><span><h2>給与・確定申告用集計</h2><p>承認済み実績から月次の売上・給料・外注・経費を確認</p></span></div>
        </div>
        <div className="finance-columns">
          <article className="finance-panel">
            <header><span><UserRound size={17} />従業員給与</span><strong>{formatCurrency(summary.totalPayroll)}</strong></header>
            <div className="finance-row highlight"><span>太田売上合計</span><strong>{formatCurrency(otaTotalSales)}</strong></div>
            <div className="finance-row highlight"><span>太田給料</span><strong>{formatCurrency(otaPayroll)}</strong></div>
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
        <div className="tax-summary">
          <h3><ReceiptText size={17} />確定申告用の月次内訳</h3>
          <div className="tax-summary-grid">
            {taxSummaryRows.map((row) => (
              <article key={row.label}>
                <span>{row.label}</span>
                <strong>{formatCurrency(row.value)}</strong>
              </article>
            ))}
          </div>
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
          <div><CalendarDays size={19} /><span><h2>案件一覧</h2><p>通常はキャンセル・報告済みを非表示</p></span></div>
          <strong>{visibleScheduleReservations.length}件</strong>
        </div>
        <form className="schedule-filter-form">
          <input name="month" type="hidden" value={selectedMonth} />
          <label>
            <span>作業者</span>
            <select defaultValue={selectedScheduleWorker} name="schedule_worker">
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
              defaultChecked={showCancelledSchedules}
              name="show_cancelled"
              type="checkbox"
              value="1"
            />
            <span>キャンセルを表示</span>
          </label>
          <label className="check-filter">
            <input
              defaultChecked={showReportedSchedules}
              name="show_reported"
              type="checkbox"
              value="1"
            />
            <span>報告済みも表示</span>
          </label>
          <button className="button" type="submit">表示</button>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>日時</th><th>区分</th><th>案件内容</th><th>作業者</th><th>状態</th><th className="numeric">売上</th><th>操作</th></tr></thead>
            <tbody>
              {visibleScheduleReservations.map((reservation) => {
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
                    <td><span className={statusClass(reservation.status)}>{reservationLabels[reservation.status]}</span></td>
                    <td className="numeric">{isApprovedCompleted(reservation) ? formatCurrency(Number(reservation.amount)) : "-"}</td>
                    <td>
                      <div className="table-actions">
                        <Link
                          className="icon-text-button"
                          href={`/admin/reservations/${reservation.id}?month=${selectedMonth}`}
                        >
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
              {visibleScheduleReservations.length === 0 ? <tr><td colSpan={7}>表示条件に合う案件はありません</td></tr> : null}
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
              {expenses.map((expense) => {
                const receiptUrls = parseReceiptUrls(expense.receipt_url);
                return (
                  <tr key={expense.id}>
                    <td className="nowrap">{new Date(expense.created_at).toLocaleDateString("ja-JP")}</td>
                    <td>
                      <strong>{expense.expense_categories?.name}</strong>
                      <small>{expense.profiles?.display_name} / {expense.note || "備考なし"}</small>
                      {expense.expense_reservations && expense.expense_reservations.length > 0 ? (
                        <small>
                          紐づけ:{" "}
                          {expense.expense_reservations
                            .map((link) => link.reservations?.customer_name || link.reservations?.service_content)
                            .filter(Boolean)
                            .join("、")}
                        </small>
                      ) : null}
                      {receiptUrls.length > 0 ? (
                        <small className="inline-links">
                          領収書:{" "}
                          {receiptUrls.map((url, index) => (
                            <a className="text-link" href={url} key={url} rel="noreferrer" target="_blank">
                              画像{index + 1}
                            </a>
                          ))}
                        </small>
                      ) : null}
                    </td>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
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
