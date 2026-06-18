"use client";

import { Trash2 } from "lucide-react";
import { deleteWorker } from "@/app/actions";

export function DeleteWorkerForm({
  workerId,
  workerName,
}: {
  workerId: string;
  workerName: string;
}) {
  return (
    <form
      action={deleteWorker}
      onSubmit={(event) => {
        if (!window.confirm(`${workerName}を削除しますか？ 使用済みの場合は無効化されます。`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="worker_id" type="hidden" value={workerId} />
      <button className="icon-text-button delete" type="submit">
        <Trash2 size={15} />
        削除
      </button>
    </form>
  );
}
