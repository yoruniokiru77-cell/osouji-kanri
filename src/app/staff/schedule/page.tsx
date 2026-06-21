import { CalendarPlus } from "lucide-react";
import { createStaffReservation } from "@/app/actions";
import { StaffLayout } from "@/components/StaffLayout";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { getCachedStaffMasters } from "@/lib/cached-data";

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  await requireRole("staff");
  const params = await searchParams;
  const { categories, contents, tools, workers } = await getCachedStaffMasters();

  return (
    <StaffLayout title="予定登録">
      <div className="mobile-page">
        {params.success === "1" ? <div className="success-banner">予定を登録しました</div> : null}
        <p className="page-lead">
          訪問予定を登録します。売上金額は作業後の実績報告で入力します。
        </p>
        <form action={createStaffReservation} className="staff-form">
          <label>
            <span>日時 *</span>
            <input name="scheduled_at" required type="datetime-local" />
          </label>
          <label>
            <span>お客様名</span>
            <input name="customer_name" placeholder="例：山田様" />
          </label>
          <label>
            <span>電話番号</span>
            <input inputMode="tel" name="customer_phone" placeholder="例：090-1234-5678" type="tel" />
          </label>
          <label>
            <span>住所 *</span>
            <input name="address" placeholder="水戸市..." required />
          </label>
          <label>
            <span>区分 *</span>
            <select defaultValue="" name="service_category_id" required>
              <option disabled value="">区分を選択</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>作業内容 *</span>
            <select defaultValue="" name="service_content_id" required>
              <option disabled value="">作業内容を選択</option>
              {contents.map((content) => (
                <option key={content.id} value={content.id}>{content.name}</option>
              ))}
            </select>
          </label>
          <fieldset className="tool-fieldset">
            <legend>作業担当者 *（複数選択可）</legend>
            <div className="worker-options">
              {workers.map((worker) => (
                <label key={worker.id}>
                  <input name="worker_ids" type="checkbox" value={worker.id} />
                  <span>
                    <strong>{worker.name}</strong>
                    <small>{worker.worker_type === "employee" ? "従業員" : "外注"}</small>
                  </span>
                </label>
              ))}
            </div>
            {workers.length === 0 ? <p className="field-help">作業者マスタが未登録です。</p> : null}
          </fieldset>
          <label>
            <span>駐車場 *</span>
            <select defaultValue="true" name="parking_available" required>
              <option value="true">あり</option>
              <option value="false">なし</option>
            </select>
          </label>
          <label>
            <span>駐車場メモ</span>
            <textarea
              name="parking_notes"
              placeholder="例：建物裏の3番／近隣コインパーキングを利用／路上待機後にお客様へ連絡"
              rows={3}
            />
            <small className="field-help">
              駐車位置や、駐車場がない場合の停車場所を記入できます。
            </small>
          </label>
          <fieldset className="tool-fieldset">
            <legend>必要な道具</legend>
            <div className="tool-options">
              {tools.map((tool) => (
                <label key={tool.id}>
                  <input name="tool_ids" type="checkbox" value={tool.id} />
                  <span>{tool.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <span>備考・注意事項</span>
            <textarea name="notes" placeholder="訪問時の注意事項など" rows={4} />
          </label>
          <SubmitButton className="primary-button green-button" pendingLabel="予定を登録中...">
            <CalendarPlus size={17} />
            予定を登録する
          </SubmitButton>
        </form>
      </div>
    </StaffLayout>
  );
}
