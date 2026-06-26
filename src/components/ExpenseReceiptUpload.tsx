"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ExpenseReceiptUploadProps = {
  inputName?: string;
};

export function ExpenseReceiptUpload({ inputName = "receipt_url" }: ExpenseReceiptUploadProps) {
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError("");

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("ログイン情報を確認できません");
      setUploading(false);
      return;
    }

    const uploadedUrls: string[] = [];
    for (const [index, file] of files.entries()) {
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${auth.user.id}/expenses/${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from("receipts").getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }

    setReceiptUrls((current) => [...current, ...uploadedUrls]);
    setUploading(false);
    event.target.value = "";
  }

  function removeUrl(targetUrl: string) {
    setReceiptUrls((current) => current.filter((url) => url !== targetUrl));
  }

  return (
    <div className="receipt-upload-panel">
      <input name={inputName} type="hidden" value={receiptUrls.length > 0 ? JSON.stringify(receiptUrls) : ""} />
      <label className="statement-upload">
        <Upload size={17} />
        <span>{receiptUrls.length > 0 ? `${receiptUrls.length}枚添付済み` : "領収書画像を添付"}</span>
        <input accept="image/*" multiple onChange={handleUpload} type="file" />
      </label>
      {uploading ? <small>アップロード中...</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
      {receiptUrls.length > 0 ? (
        <div className="receipt-preview-list">
          {receiptUrls.map((url, index) => (
            <span key={url}>
              <a href={url} rel="noreferrer" target="_blank">画像{index + 1}</a>
              <button onClick={() => removeUrl(url)} type="button">削除</button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
