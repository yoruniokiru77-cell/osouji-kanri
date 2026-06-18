"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, CreditCard, MapPin, Upload, Users } from "lucide-react";
import { upsertWorkReport } from "@/app/actions";
import { reservationLabels, statusClass } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { ReservationStatus, Worker } from "@/lib/types";

type BookingOption = {
  id: string;
  scheduledAt: string;
  address: string;
  content: string;
  status: ReservationStatus;
  workerIds: string[];
};

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
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reportedAmount, setReportedAmount] = useState(0);
  const [changeAmount, setChangeAmount] = useState(previousChangeAmount);
  const [cashCollectedAmount, setCashCollectedAmount] = useState(0);
  const [statementUrl, setStatementUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const selected = bookings.find((booking) => booking.id === selectedId);
  const expectedCash = changeAmount - previousChangeAmount + reportedAmount;
  const difference = cashCollectedAmount - expectedCash;
  const cashReady =
    paymentMethod !== "cash" ||
    (cashCollectedAmount >= 0 && difference === 0);
  const cardReady = paymentMethod !== "card" || Boolean(statementUrl);
  const canSubmit =
    Boolean(selectedId) &&
    selectedWorkerIds.length > 0 &&
    reportedAmount > 0 &&
    cashReady &&
    cardReady &&
    !uploading;

  useEffect(() => {
    setSelectedWorkerIds(
      bookings.find((booking) => booking.id === selectedId)?.workerIds ?? [],
    );
  }, [bookings, selectedId]);

  const reconciliationLabel = useMemo(() => {
    if (reportedAmount <= 0) return "売上金額を入力してください";
    if (difference === 0) return "現金は一致しています";
    return `差額 ${new Intl.NumberFormat("ja-JP").format(difference)}円`;
  }, [difference, reportedAmount]);

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
    <form action={upsertWorkReport} className="staff-form">
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
            <option key={booking.id} value={booking.id}>
              {new Date(booking.scheduledAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              - {booking.content}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <div className="glass-card booking-preview">
          <div>
            <Clock3 size={15} />
            <strong>{new Date(selected.scheduledAt).toLocaleString("ja-JP")}</strong>
            <span className={statusClass(selected.status)}>{reservationLabels[selected.status]}</span>
          </div>
          <p><MapPin size={15} />{selected.address}</p>
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
            onChange={(event) => setReportedAmount(Number(event.target.value))}
            placeholder="0"
            required
            type="number"
          />
        </div>
        <small className="field-help">管理者の承認後、売上と給与へ反映されます。</small>
      </label>

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
          <h3>現金・釣銭チェック</h3>
          <label>
            <span>前回の釣銭残高</span>
            <div className="currency-input">
              <b>¥</b>
              <input name="previous_change_amount" readOnly type="number" value={previousChangeAmount} />
            </div>
          </label>
          <label>
            <span>今回の釣銭残高 *</span>
            <div className="currency-input">
              <b>¥</b>
              <input
                min="0"
                name="change_amount"
                onChange={(event) => setChangeAmount(Number(event.target.value))}
                type="number"
                value={changeAmount}
              />
            </div>
          </label>
          <label>
            <span>今回回収した現金 *</span>
            <div className="currency-input">
              <b>¥</b>
              <input
                min="0"
                name="cash_collected_amount"
                onChange={(event) => setCashCollectedAmount(Number(event.target.value))}
                type="number"
                value={cashCollectedAmount}
              />
            </div>
          </label>
          <div className={difference === 0 && reportedAmount > 0 ? "reconciliation-ok" : "reconciliation-error"}>
            <span>今回釣銭 - 前回釣銭 + 売上</span>
            <strong>{new Intl.NumberFormat("ja-JP").format(expectedCash)}円</strong>
            <small>{reconciliationLabel}</small>
          </div>
      </div>

      <label><span>今日の報告 *</span><textarea name="report_text" placeholder="作業内容・完了状況を記入してください" required rows={5} /></label>
      <label><span>課題・申し送り事項</span><textarea name="issues" placeholder="次回への申し送り、気になった点など" rows={4} /></label>
      <label><span>口コミ・お客様の反応</span><textarea name="customer_review" placeholder="お客様からのコメントや評価など" rows={4} /></label>
      <label><span>その他連絡事項</span><textarea name="notes" placeholder="管理者への連絡事項があれば" rows={3} /></label>
      <button className="primary-button green-button" disabled={!canSubmit} type="submit">
        <CheckCircle2 size={17} />報告を送信する
      </button>
    </form>
  );
}
