"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ServiceContent, ServiceContentTool, Tool } from "@/lib/types";

type WorkItem = {
  customName: string;
  id: string;
  serviceContentId: string;
  quantity: number;
};

type Props = {
  initialCustomToolNames?: string[];
  contents: ServiceContent[];
  initialManualToolIds?: string[];
  initialWorkItems?: { custom_name?: string | null; service_content_id: string | null; quantity: number }[];
  serviceContentTools: ServiceContentTool[];
  tools: Tool[];
};

function createItem(serviceContentId = ""): WorkItem {
  return {
    customName: "",
    id: crypto.randomUUID(),
    quantity: 1,
    serviceContentId,
  };
}

export function ReservationWorkItemsFieldset({
  contents,
  initialCustomToolNames = [],
  initialManualToolIds = [],
  initialWorkItems = [],
  serviceContentTools,
  tools,
}: Props) {
  const [items, setItems] = useState<WorkItem[]>(
    initialWorkItems.length > 0
      ? initialWorkItems.map((item) => ({
          customName: item.custom_name ?? "",
          id: crypto.randomUUID(),
          quantity: Math.max(1, item.quantity),
          serviceContentId: item.service_content_id ?? "__other__",
        }))
      : [createItem()],
  );
  const [customToolNames, setCustomToolNames] = useState<string[]>(
    initialCustomToolNames.length > 0 ? initialCustomToolNames : [""],
  );
  const [manualToolIds, setManualToolIds] = useState(() => new Set(initialManualToolIds));

  const selectedContentIds = useMemo(
    () => new Set(items.map((item) => item.serviceContentId).filter((id) => id && id !== "__other__")),
    [items],
  );

  const autoToolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const mapping of serviceContentTools) {
      if (selectedContentIds.has(mapping.service_content_id)) {
        ids.add(mapping.tool_id);
      }
    }
    return ids;
  }, [selectedContentIds, serviceContentTools]);

  const submittedToolIds = useMemo(() => {
    const ids = new Set(manualToolIds);
    for (const toolId of autoToolIds) ids.add(toolId);
    return [...ids];
  }, [autoToolIds, manualToolIds]);

  const updateItem = (id: string, patch: Partial<WorkItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeItem = (id: string) => {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)));
  };

  const updateCustomToolName = (index: number, value: string) => {
    setCustomToolNames((current) => current.map((name, currentIndex) => (currentIndex === index ? value : name)));
  };

  const removeCustomToolName = (index: number) => {
    setCustomToolNames((current) =>
      current.length === 1 ? current : current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const toggleManualTool = (toolId: string, checked: boolean) => {
    setManualToolIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(toolId);
      } else {
        next.delete(toolId);
      }
      return next;
    });
  };

  return (
    <>
      <fieldset className="tool-fieldset work-items-fieldset">
        <legend>作業内容 *（複数選択可）</legend>
        <div className="work-item-list">
          {items.map((item, index) => (
            <div className="work-item-row" key={item.id}>
              <label>
                <span>作業内容</span>
                <select
                  name="service_content_ids"
                  onChange={(event) =>
                    updateItem(item.id, {
                      customName: event.target.value === "__other__" ? item.customName : "",
                      serviceContentId: event.target.value,
                    })
                  }
                  required={index === 0}
                  value={item.serviceContentId}
                >
                  <option disabled value="">作業内容を選択</option>
                  {contents.map((content) => (
                    <option key={content.id} value={content.id}>{content.name}</option>
                  ))}
                  <option value="__other__">その他</option>
                </select>
              </label>
              <label className="quantity-field">
                <span>台数・数量</span>
                <input
                  min={1}
                  name="service_quantities"
                  onChange={(event) =>
                    updateItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })
                  }
                  required
                  type="number"
                  value={item.quantity}
                />
              </label>
              <button
                aria-label="作業内容を削除"
                className="icon-button danger"
                disabled={items.length === 1}
                onClick={() => removeItem(item.id)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
              {item.serviceContentId === "__other__" ? (
                <label className="work-item-custom-field">
                  <span>その他の作業内容 *</span>
                  <input
                    name="service_custom_names"
                    onChange={(event) => updateItem(item.id, { customName: event.target.value })}
                    placeholder="例：窓清掃、床ワックス"
                    required
                    value={item.customName}
                  />
                </label>
              ) : (
                <input name="service_custom_names" type="hidden" value="" />
              )}
            </div>
          ))}
        </div>
        <button
          className="secondary-button compact-button"
          onClick={() => setItems((current) => [...current, createItem()])}
          type="button"
        >
          <Plus size={16} />
          作業内容を追加
        </button>
        <p className="field-help">
          エアコンなど台数がある作業は数量に入力してください。
        </p>
      </fieldset>

      <fieldset className="tool-fieldset">
        <legend>必要な道具</legend>
        <div className="tool-options">
          {tools.map((tool) => {
            const autoSelected = autoToolIds.has(tool.id);
            const checked = autoSelected || manualToolIds.has(tool.id);
            return (
              <label className={autoSelected ? "auto-selected-tool" : ""} key={tool.id}>
                <input
                  checked={checked}
                  disabled={autoSelected}
                  onChange={(event) => toggleManualTool(tool.id, event.target.checked)}
                  type="checkbox"
                  value={tool.id}
                />
                <span>
                  {tool.name}
                  {autoSelected ? <small>自動</small> : null}
                </span>
              </label>
            );
          })}
        </div>
        {submittedToolIds.map((toolId) => (
          <input key={toolId} name="tool_ids" type="hidden" value={toolId} />
        ))}
        {serviceContentTools.length === 0 ? (
          <p className="field-help">作業内容と道具の紐づけは未設定です。必要な道具は手動で選択してください。</p>
        ) : null}
        <div className="custom-tool-list">
          <p className="field-help">マスタにない道具は1つずつ入力できます。</p>
          {customToolNames.map((name, index) => (
            <div className="custom-tool-row" key={`custom-tool-${index}`}>
              <input
                name="custom_tool_names"
                onChange={(event) => updateCustomToolName(index, event.target.value)}
                placeholder="例：特殊洗剤、延長ホース"
                value={name}
              />
              <button
                aria-label="手入力道具を削除"
                className="icon-button danger"
                disabled={customToolNames.length === 1}
                onClick={() => removeCustomToolName(index)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="secondary-button compact-button"
            onClick={() => setCustomToolNames((current) => [...current, ""])}
            type="button"
          >
            <Plus size={16} />
            道具を手入力で追加
          </button>
        </div>
      </fieldset>
    </>
  );
}
