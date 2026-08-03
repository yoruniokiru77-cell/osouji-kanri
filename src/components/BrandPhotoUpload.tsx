"use client";

import { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BrandPhotoUploadProps = {
  reservationId: string;
};

export function BrandPhotoUpload({ reservationId }: BrandPhotoUploadProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
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
      const path = `${auth.user.id}/${reservationId}/${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("brand-photos")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from("brand-photos").getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }

    setPhotoUrls((current) => [...current, ...uploadedUrls]);
    setUploading(false);
    event.target.value = "";
  }

  function removeUrl(targetUrl: string) {
    setPhotoUrls((current) => current.filter((url) => url !== targetUrl));
  }

  return (
    <div className="receipt-upload-panel brand-photo-upload">
      <input name="brand_photo_urls" type="hidden" value={photoUrls.length > 0 ? JSON.stringify(photoUrls) : ""} />
      <label className="statement-upload">
        <Camera size={17} />
        <span>{photoUrls.length > 0 ? `${photoUrls.length}枚添付済み` : "ブランド案件写真を添付"}</span>
        <Upload size={16} />
        <input accept="image/*" multiple onChange={handleUpload} type="file" />
      </label>
      {uploading ? <small>アップロード中...</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
      {photoUrls.length > 0 ? (
        <div className="receipt-preview-list">
          {photoUrls.map((url, index) => (
            <span key={url}>
              <a href={url} rel="noreferrer" target="_blank">写真{index + 1}</a>
              <button onClick={() => removeUrl(url)} type="button">削除</button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
