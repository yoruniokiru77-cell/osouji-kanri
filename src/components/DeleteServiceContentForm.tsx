"use client";

import { Trash2 } from "lucide-react";
import { deleteServiceContent } from "@/app/actions";

export function DeleteServiceContentForm({
  contentId,
  contentName,
}: {
  contentId: string;
  contentName: string;
}) {
  return (
    <form
      action={deleteServiceContent}
      onSubmit={(event) => {
        if (!window.confirm(`「${contentName}」を削除しますか？使用中の場合は無効になります。`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="content_id" type="hidden" value={contentId} />
      <button aria-label={`${contentName}を削除`} className="table-icon-button delete" type="submit">
        <Trash2 size={15} />
      </button>
    </form>
  );
}
