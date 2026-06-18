"use client";

import { useState } from "react";
import { updateExpenseStatus } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

export function PurchaseExpenseForm({ expenseId }: { expenseId: string }) {
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    const supabase = createClient();
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${expenseId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("receipts").getPublicUrl(path);
    setReceiptUrl(data.publicUrl);
    setUploading(false);
  }

  return (
    <form action={updateExpenseStatus} className="purchase-form">
      <input name="expense_id" type="hidden" value={expenseId} />
      <input name="status" type="hidden" value="purchased" />
      <input name="receipt_url" type="hidden" value={receiptUrl} />
      <label className="receipt-upload">
        <span>{receiptUrl ? "領収書添付済み" : "領収書を選択"}</span>
        <input accept="image/*" onChange={handleUpload} type="file" />
      </label>
      {error ? <small className="form-error">{error}</small> : null}
      <button className="button" disabled={!receiptUrl || uploading} type="submit">
        {uploading ? "アップロード中" : "購入済みにする"}
      </button>
    </form>
  );
}
