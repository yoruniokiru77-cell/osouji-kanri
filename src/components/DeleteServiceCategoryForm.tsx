"use client";

import { Trash2 } from "lucide-react";
import { deleteServiceCategory } from "@/app/actions";

export function DeleteServiceCategoryForm({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  return (
    <form
      action={deleteServiceCategory}
      onSubmit={(event) => {
        if (!window.confirm(`${categoryName}を削除しますか？ 使用済みの場合は無効化されます。`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="category_id" type="hidden" value={categoryId} />
      <button aria-label={`${categoryName}を削除`} className="table-icon-button delete" type="submit">
        <Trash2 size={15} />
      </button>
    </form>
  );
}
