"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, CreditCard, MapPin, Upload, Users } from "lucide-react";
import { upsertWorkReport } from "@/app/actions";
import { reservationLabels, statusClass } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/SubmitButton";
import type { ReservationStatus, Worker } from "@/lib/types";

type ReportStatus = "pending" | "approved" | "rejected";

type BookingOption = {
  id: string;
  scheduledAt: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string;
  categoryName: string | null;
  content: string;
  reportStatus: ReportStatus | null;
  status: ReservationStatus;
  workerIds: string[];
};

const reportDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

const reportPreviewDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

function dateFromSupabase(value: string) {
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

function bookingLabel(booking: BookingOption) {
  return [
    reportDateTimeFormatter.format(dateFromSupabase(booking.scheduledAt)),
    booking.customerName || "お客様名未入力",
    booking.categoryName || "区分未設定",
    booking.content,
  ].join(" - ");
}

export function StaffReportForm({
  bookings,
  initialBookingId = "",
  previousChangeAmount,
  workers,
}: {
  bookings: BookingOption[];
  initialBookingId?: string;
  previousChangeAmount: number;
  workers: Worker[];
}) {
  const [selectedId, setSelectedId] = useState(initialBookingId);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>(
    bookings.find((booking) => booking.id === initialBookingId)?.workerIds ?? [],
  );
  const [hasSupporter, setHasSupporter] = useState(false);
  const [supporterWorkerIds, setSupporterWorkerIds] = useState<string[]>([]);
  const [customSupporterName, setCustomSupporterName] = useState("");
  const [customSupporterAmountInput, setCustomSupporterAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reportedAmountInput, setReportedAmountInput] = useState("");
  const [currentCashBalanceInput, setCurrentCashBalanceInput] = useState("");
  const [cashCollectedAmountInput, setCashCollectedAmountInput] = useState("");
  const [statementUrl, setStatementUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const selected = bookings.find((booking) => booking.id === selectedId);
  const selectedIsApproved = selected?.reportStatus === "approved";
  const reportedAmount = Number(reportedAmountInput || 0);
  const customSupporterAmount = Number(customSupporterAmountInput || 0);
  const currentCashBalance = Number(currentCashBalanceInput || 0);
  const cashCollectedAmount = Number(cashCollectedAmountInput || 0);
  const nextChangeAmount = currentCashBalance - cashCollectedAmount;
  const cashReady =
    paymentMethod !== "cash" ||
    (reportedAmount > 0 &&
      currentCashBalanceInput !== "" &&
      currentCashBalance >= 0 &&
      cashCollectedAmountInput !== "" &&
      cashCollectedAmount >= 0 &&
      nextChangeAmount >= 0);
  const cardReady = paymentMethod !== "card" || Boolean(statementUrl);
  const canSubmit =
    Boolean(selectedId) &&
    !selectedIsApproved &&
    selectedWorkerIds.length > 0 &&
    reportedAmount > 0 &&
    (!hasSupporter ||
      supporterWorkerIds.length > 0 ||
      (customSupporterName.trim() !== "" &&
        Number.isInteger(customSupporterAmount) &&
        customSupporterAmount > 0)) &&
    cashReady &&
    cardReady &&
    !uploading;
  const canPressSubmit = Boolean(selectedId) && !selectedIsApproved && selectedWorkerIds.length > 0 && !uploading;

  useEffect(() => {
    setSelectedWorkerIds(
      bookings.find((booking) => booking.id === selectedId)?.workerIds ?? [],
    );
    setHasSupporter(false);
    setSupporterWorkerIds([]);
    setCustomSupporterName("");
    setCustomSupporterAmountInput("");
  }, [bookings, selectedId]);

  const reconciliationLabel = useMemo(() => {
    if (reportedAmount <= 0) return "売上金額を入力してください";
    if (currentCashBalanceInput === "") return "現在の残高を入力してください";
    if (cashCollectedAmountInput === "") return "管理者へ渡す金額を入力してください";
    if (nextChangeAmount < 0) return "管理者へ渡す金額が現在の残高を超えています";
    return `次回繰越は ${new Intl.NumberFormat("ja-JP").format(nextChangeAmount)}円です`;
  }, [cashCollectedAmountInput, currentCashBalanceInput, nextChangeAmount, reportedAmount]);

  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    setSubmitMessage("");

    if (!selectedId) {
      event.preventDefault();
      setSubmitMessage("対象案件を選択してください。");
      return;
    }
    if (selectedIsApproved) {
      event.preventDefault();
      setSubmitMessage("承認済みの報告は再提出できません。修正が必要な場合は管理者へ連絡してください。");
      return;
    }
    if (selectedWorkerIds.length === 0) {
      event.preventDefault();
      setSubmitMessage("当日の作業担当者を1人以上選択してください。");
      return;
    }
    if (!Number.isInteger(reportedAmount) || reportedAmount <= 0) {
      event.preventDefault();
      setSubmitMessage("売上金額を1円以上の整数で入力してください。");
      return;
    }
    if (
      hasSupporter &&
      supporterWorkerIds.length === 0 &&
      (customSupporterName.trim() === "" ||
        !Number.isInteger(customSupporterAmount) ||
        customSupporterAmount <= 0)
    ) {
      event.preventDefault();
      setSubmitMessage("応援者ありの場合は、作業者を選択するか、その他の名前と金額を入力してください。");
      return;
    }
    if (paymentMethod === "card" && !statementUrl) {
      event.preventDefault();
      setSubmitMessage("カード決済の場合は、カード明細画像を添付してください。");
      return;
    }
    if (paymentMethod === "cash" && !cashReady) {
      event.preventDefault();
      setSubmitMessage(
        "管理者へ渡す金額は、現在の残高以下で入力してください。",
      );
    }
  }

  async function uploadStatement(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setUploadError("ログイン情報を確認できません");
      setUploading(false);
      return;
    }
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${auth.user.id}/${selectedId || "unselected"}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("payment-statements")
      .upload(path, file, { upsert: true });

    if (error) {
      setUploadError(error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("payment-statements").getPublicUrl(path);
    setStatementUrl(data.publicUrl);
    setUploading(false);
  }

  return (
    <form action={upsertWorkReport} className="staff-form" onSubmit={validateBeforeSubmit}>
      <label>
        <span>対象案件 *</span>
        <select
          name="reservation_id"
          onChange={(event) => setSelectedId(event.target.value)}
          required
          value={selectedId}
        >
          <option value="">案件を選択してください</option>
          {bookings.map((booking) => (
            <option disabled={booking.reportStatus === "approved"} key={booking.id} value={booking.id}>
              {bookingLabel(booking)}
              {booking.reportStatus === "approved"
                ? "（承認済み）"
                : booking.reportStatus === "rejected"
                  ? "（差し戻し・再提出可）"
                  : booking.reportStatus === "pending"
                    ? "（承認待ち）"
                    : ""}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <div className="glass-card booking-preview">
          <div>
            <Clock3 size={15} />
            <strong>{reportPreviewDateTimeFormatter.format(dateFromSupabase(selected.scheduledAt))}</strong>
            <span className={statusClass(selected.status)}>{reservationLabels[selected.status]}</span>
            {selected.reportStatus === "approved" ? <span className="status green">承認済み</span> : null}
            {selected.reportStatus === "pending" ? <span className="status blue">承認待ち</span> : null}
            {selected.reportStatus === "rejected" ? <span className="status red">差し戻し</span> : null}
          </div>
          <p><MapPin size={15} />{selected.address}</p>
          {selected.customerName || selected.customerPhone ? (
            <p>
              <Users size={15} />
              {[selected.customerName, selected.customerPhone].filter(Boolean).join(" / ")}
            </p>
          ) : null}
          {selected.reportStatus === "approved" ? (
            <p className="field-help">承認済みのため、スタッフ側から再提出はできません。</p>
          ) : null}
          {selected.reportStatus === "rejected" ? (
            <p className="field-help">差し戻しされた報告です。内容を修正して再提出できます。</p>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <fieldset className="tool-fieldset">
          <legend><Users size={15} />当日の作業担当者 *（給与・外注費に反映）</legend>
          <p className="field-help">休んだ人は外し、当日参加した人を追加してください。</p>
          <div className="worker-options">
            {workers.map((worker) => (
              <label key={worker.id}>
                <input
                  checked={selectedWorkerIds.includes(worker.id)}
                  name="worker_ids"
                  onChange={(event) => {
                    setSelectedWorkerIds((current) =>
                      event.target.checked
                        ? [...current, worker.id]
                        : current.filter((id) => id !== worker.id),
                    );
                  }}
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
      ) : null}

      <label>
        <span>売上金額 *</span>
        <div className="currency-input">
          <b>¥</b>
          <input
            min="1"
            name="reported_amount"
            onChange={(event) => setReportedAmountInput(event.target.value)}
            placeholder="0"
            required
            type="number"
            value={reportedAmountInput}
          />
        </div>
        <small className="field-help">管理者の承認後、売上と給与へ反映されます。</small>
      </label>

      <fieldset className="tool-fieldset support-fieldset">
        <legend>応援者</legend>
        <div className="segmented-options">
          <label>
            <input
              checked={!hasSupporter}
              name="has_supporter"
              onChange={() => setHasSupporter(false)}
              type="radio"
              value="false"
            />
            <span>なし</span>
          </label>
          <label>
            <input
              checked={hasSupporter}
              name="has_supporter"
              onChange={() => setHasSupporter(true)}
              type="radio"
              value="true"
            />
            <span>あり</span>
          </label>
        </div>
        {hasSupporter ? (
          <div className="support-panel">
            <div className="worker-options">
              {workers.map((worker) => (
                <label key={worker.id}>
                  <input
                    checked={supporterWorkerIds.includes(worker.id)}
                    name="support_worker_ids"
                    onChange={(event) => {
                      setSupporterWorkerIds((current) =>
                        event.target.checked
                          ? [...current, worker.id]
                          : current.filter((id) => id !== worker.id),
                      );
                    }}
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
            <div className="support-custom-grid">
              <label>
                <span>その他の応援者名</span>
                <input
                  name="custom_supporter_name"
                  onChange={(event) => setCustomSupporterName(event.target.value)}
                  placeholder="例：山田さん"
                  value={customSupporterName}
                />
              </label>
              <label>
                <span>その他の金額</span>
                <div className="currency-input">
                  <b>¥</b>
                  <input
                    min="0"
                    name="custom_supporter_amount"
                    onChange={(event) => setCustomSupporterAmountInput(event.target.value)}
                    placeholder="0"
                    type="number"
                    value={customSupporterAmountInput}
                  />
                </div>
              </label>
            </div>
            <p className="field-help">
              その他に入力した金額は固定額の外注費として管理画面へ反映されます。
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="payment-method-fieldset">
        <legend>支払方法 *</legend>
        <div className="payment-method-options">
          {[
            ["cash", "現金"],
            ["card", "カード"],
            ["invoice", "請求書"],
            ["other", "その他"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                defaultChecked={value === "cash"}
                name="payment_method"
                onChange={() => setPaymentMethod(value)}
                type="radio"
                value={value}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="payment-panel card-payment-panel">
          <input name="card_statement_url" type="hidden" value={statementUrl} />
          <label className="statement-upload">
            <CreditCard size={17} />
            <span>{statementUrl ? "カード明細を添付済み" : "カード明細画像を添付 *"}</span>
            <Upload size={16} />
            <input accept="image/*" onChange={uploadStatement} type="file" />
          </label>
          {uploading ? <small>アップロード中...</small> : null}
          {uploadError ? <small className="form-error">{uploadError}</small> : null}
      </div>

      <div className="payment-panel cash-reconciliation cash-payment-panel">
          <h3>現金残高チェック</h3>
          <label>
            <span>前回の残高（自動表示）</span>
            <div className="currency-input">
              <b>¥</b>
              <input name="previous_change_amount" readOnly type="number" value={previousChangeAmount} />
            </div>
          </label>
          <label>
            <span>現在の残高（手入力）*</span>
            <div className="currency-input">
              <b>¥</b>
              <input
                min="0"
                name="current_cash_balance"
                onChange={(event) => setCurrentCashBalanceInput(event.target.value)}
                placeholder="0"
                required={paymentMethod === "cash"}
                type="number"
                value={currentCashBalanceInput}
              />
            </div>
          </label>
          <label>
            <span>管理者へ渡す金額 *</span>
            <div className="currency-input">
              <b>¥</b>
              <input
                min="0"
                max={currentCashBalance || undefined}
                name="cash_collected_amount"
                onChange={(event) => setCashCollectedAmountInput(event.target.value)}
                type="number"
                value={cashCollectedAmountInput}
              />
            </div>
          </label>
          <input name="change_amount" type="hidden" value={Math.max(nextChangeAmount, 0)} />
          <div className={cashReady && reportedAmount > 0 ? "reconciliation-ok" : "reconciliation-error"}>
            <span>現在の残高（手入力）</span>
            <strong>{new Intl.NumberFormat("ja-JP").format(currentCashBalance)}円</strong>
            <span>現在の残高 - 管理者へ渡す金額 = 次回繰越</span>
            <strong>{new Intl.NumberFormat("ja-JP").format(Math.max(nextChangeAmount, 0))}円</strong>
            <small>{reconciliationLabel}</small>
          </div>
      </div>

      <label><span>今日の報告 *</span><textarea name="report_text" placeholder="作業内容・完了状況を記入してください" required rows={5} /></label>
      <label><span>課題・申し送り事項</span><textarea name="issues" placeholder="次回への申し送り、気になった点など" rows={4} /></label>
      <label><span>口コミ・お客様の反応</span><textarea name="customer_review" placeholder="お客様からのコメントや評価など" rows={4} /></label>
      <label><span>その他連絡事項</span><textarea name="notes" placeholder="管理者への連絡事項があれば" rows={3} /></label>
      {submitMessage ? <p className="form-error" aria-live="polite">{submitMessage}</p> : null}
      {!submitMessage && !canSubmit && canPressSubmit ? (
        <p className="field-help" aria-live="polite">
          {paymentMethod === "cash" && !cashReady
            ? "現金の場合は、管理者へ渡す金額を現在の残高以下で入力してください。"
            : paymentMethod === "card" && !cardReady
              ? "カードの場合は、明細画像を添付すると送信できます。"
              : "必須項目を入力してください。"}
        </p>
      ) : null}
      <SubmitButton
        className="primary-button green-button"
        disabled={!canPressSubmit}
        pendingLabel="報告を送信中..."
      >
        <CheckCircle2 size={17} />報告を送信する
      </SubmitButton>
    </form>
  );
}
