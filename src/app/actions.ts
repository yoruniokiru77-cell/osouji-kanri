"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole } from "@/lib/auth";
import { CACHE_TAGS, clearCachedData } from "@/lib/cached-data";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readNumber(formData: FormData, key: string) {
  return Number(readString(formData, key));
}

type ServiceItemInput = {
  custom_name: string | null;
  service_content_id: string | null;
  quantity: number;
  sort_order: number;
};

function readServiceItems(formData: FormData) {
  const ids = formData.getAll("service_content_ids").map(String);
  const quantities = formData.getAll("service_quantities").map(String);
  const customNames = formData.getAll("service_custom_names").map(String);
  const seen = new Set<string>();
  const items: ServiceItemInput[] = [];

  ids.forEach((id, index) => {
    const selectedId = id.trim();
    if (!selectedId) return;
    const quantity = Number(quantities[index] ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("作業内容の台数・数量は1以上の整数で入力してください");
    }
    const isOther = selectedId === "__other__";
    const customName = String(customNames[index] ?? "").trim();
    if (isOther && !customName) {
      throw new Error("その他を選んだ場合は作業内容を入力してください");
    }

    const dedupeKey = isOther ? `custom:${customName}` : `master:${selectedId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({
      custom_name: isOther ? customName : null,
      quantity,
      service_content_id: isOther ? null : selectedId,
      sort_order: items.length,
    });
  });

  if (items.length === 0) {
    throw new Error("作業内容を1つ以上選択してください");
  }

  return items;
}

function buildServiceContentLabel(
  serviceItems: ServiceItemInput[],
  serviceContents: { id: string; name: string }[],
) {
  const names = new Map(serviceContents.map((content) => [content.id, content.name]));
  return serviceItems
    .map((item) => {
      const name = item.service_content_id ? names.get(item.service_content_id) : item.custom_name;
      if (!name) return null;
      return item.quantity > 1 ? `${name} x${item.quantity}` : name;
    })
    .filter(Boolean)
    .join("、");
}

async function getToolIdsWithAutoMappings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceItems: ServiceItemInput[],
  manualToolIds: string[],
) {
  const toolIds = new Set(manualToolIds.filter(Boolean));
  const serviceContentIds = serviceItems
    .map((item) => item.service_content_id)
    .filter((id): id is string => Boolean(id));
  if (serviceContentIds.length === 0) return [...toolIds];
  const { data } = await supabase
    .from("service_content_tools")
    .select("tool_id")
    .in("service_content_id", serviceContentIds);

  for (const mapping of data ?? []) {
    if (mapping.tool_id) toolIds.add(mapping.tool_id);
  }

  return [...toolIds];
}

function readCustomToolNames(formData: FormData) {
  return [...new Set(formData.getAll("custom_tool_names").map(String).map((name) => name.trim()).filter(Boolean))];
}

function readCustomSupporters(formData: FormData) {
  if (readString(formData, "has_supporter") !== "true") return [];
  const name = readString(formData, "custom_supporter_name");
  const amount = readNumber(formData, "custom_supporter_amount");
  if (!name) return [];
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("その他の応援者金額は1円以上の整数で入力してください");
  }
  return [{ amount, name }];
}

function revalidateStaffData() {
  clearCachedData(CACHE_TAGS.staff);
  revalidatePath("/staff/dashboard");
  revalidatePath("/staff/report");
  revalidatePath("/staff/expense");
}

function revalidateAdminData() {
  clearCachedData(CACHE_TAGS.admin);
  revalidatePath("/admin/dashboard");
}

function revalidateMasterData() {
  clearCachedData(CACHE_TAGS.masters);
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/report");
  revalidatePath("/staff/expense");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/masters");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect("/login?error=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  redirect(profile?.role === "admin" ? "/admin/dashboard" : "/staff/dashboard");
}

export async function signInAdmin(formData: FormData) {
  const supabase = await createClient();
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect("/admin/login?error=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    redirect("/admin/login?error=role");
  }

  redirect("/admin/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createReservation(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();

  const staffIds = formData.getAll("staff_ids").map(String);
  const toolIds = formData.getAll("tool_ids").map(String);

  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      scheduled_at: readString(formData, "scheduled_at"),
      customer_name: readString(formData, "customer_name") || null,
      customer_phone: readString(formData, "customer_phone") || null,
      address: readString(formData, "address"),
      amount: readNumber(formData, "amount"),
      service_content: readString(formData, "service_content"),
      parking_available: readString(formData, "parking_available") === "true",
      notes: readString(formData, "notes") || null,
    })
    .select("id")
    .single();

  if (error || !reservation) {
    throw new Error(error?.message ?? "予約を登録できませんでした");
  }

  if (staffIds.length > 0) {
    await supabase.from("reservation_staff").insert(
      staffIds.map((staffId) => ({
        reservation_id: reservation.id,
        staff_id: staffId,
      })),
    );
  }

  if (toolIds.length > 0) {
    await supabase.from("reservation_tools").insert(
      toolIds.map((toolId) => ({
        reservation_id: reservation.id,
        tool_id: toolId,
      })),
    );
  }

  revalidateAdminData();
  revalidateStaffData();
}

export async function createStaffReservation(formData: FormData) {
  const profile = await requireRole("staff");
  const supabase = await createClient();
  const manualToolIds = formData.getAll("tool_ids").map(String);
  const customToolNames = readCustomToolNames(formData);
  const workerIds = formData.getAll("worker_ids").map(String);
  const reservationId = crypto.randomUUID();
  const serviceItems = readServiceItems(formData);
  const serviceContentIds = serviceItems
    .map((item) => item.service_content_id)
    .filter((id): id is string => Boolean(id));

  if (workerIds.length === 0) {
    throw new Error("作業担当者を1人以上選択してください");
  }

  const { data: serviceContents } =
    serviceContentIds.length > 0
      ? await supabase
          .from("service_contents")
          .select("id, name")
          .in("id", serviceContentIds)
          .eq("active", true)
      : { data: [] };

  if (!serviceContents || serviceContents.length !== serviceContentIds.length) {
    throw new Error("作業内容を選択してください");
  }

  const serviceContentLabel = buildServiceContentLabel(serviceItems, serviceContents);
  const toolIds = await getToolIdsWithAutoMappings(supabase, serviceItems, manualToolIds);

  const { error } = await supabase
    .from("reservations")
    .insert({
      id: reservationId,
      scheduled_at: readString(formData, "scheduled_at"),
      customer_name: readString(formData, "customer_name") || null,
      customer_phone: readString(formData, "customer_phone") || null,
      address: readString(formData, "address"),
      amount: 0,
      service_content: serviceContentLabel,
      service_content_id: serviceItems.find((item) => item.service_content_id)?.service_content_id ?? null,
      service_category_id: readString(formData, "service_category_id"),
      parking_available: readString(formData, "parking_available") === "true",
      parking_notes: readString(formData, "parking_notes") || null,
      notes: readString(formData, "notes") || null,
      status: "scheduled",
      created_by: profile.id,
    });

  if (error) {
    throw new Error(error?.message ?? "予定を登録できませんでした");
  }

  const { error: assignmentError } = await supabase.from("reservation_staff").insert({
    reservation_id: reservationId,
    staff_id: profile.id,
  });

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const { error: serviceItemError } = await supabase.from("reservation_service_contents").insert(
    serviceItems.map((item) => ({
      quantity: item.quantity,
      reservation_id: reservationId,
      custom_name: item.custom_name,
      service_content_id: item.service_content_id,
      sort_order: item.sort_order,
    })),
  );
  if (serviceItemError) {
    throw new Error(serviceItemError.message);
  }

  if (toolIds.length > 0) {
    const { error: toolError } = await supabase.from("reservation_tools").insert(
      toolIds.map((toolId) => ({
        reservation_id: reservationId,
        tool_id: toolId,
      })),
    );
    if (toolError) {
      throw new Error(toolError.message);
    }
  }

  if (workerIds.length > 0) {
    const { error: workerError } = await supabase.from("reservation_workers").insert(
      workerIds.map((workerId) => ({
        reservation_id: reservationId,
        worker_id: workerId,
      })),
    );
    if (workerError) {
      throw new Error(workerError.message);
    }
  }

  if (customToolNames.length > 0) {
    const { error: customToolError } = await supabase.from("reservation_custom_tools").insert(
      customToolNames.map((name, index) => ({
        name,
        reservation_id: reservationId,
        sort_order: index,
      })),
    );
    if (customToolError) {
      throw new Error(customToolError.message);
    }
  }

  revalidateStaffData();
  revalidateAdminData();
  revalidatePath("/staff/schedule");
  redirect("/staff/schedule?success=1");
}

export async function updateStaffReservation(formData: FormData) {
  await requireRole("staff");
  const supabase = await createClient();
  const reservationId = readString(formData, "reservation_id");
  const workerIds = [...new Set(formData.getAll("worker_ids").map(String).filter(Boolean))];
  const serviceItems = readServiceItems(formData);
  const customToolNames = readCustomToolNames(formData);
  const toolIds = await getToolIdsWithAutoMappings(
    supabase,
    serviceItems,
    formData.getAll("tool_ids").map(String),
  );
  const scheduledAt = readString(formData, "scheduled_at");

  if (workerIds.length === 0) {
    throw new Error("作業担当者を1人以上選択してください");
  }

  const { error } = await supabase.rpc("update_own_scheduled_reservation", {
    target_address: readString(formData, "address"),
    target_customer_name: readString(formData, "customer_name") || null,
    target_customer_phone: readString(formData, "customer_phone") || null,
    target_notes: readString(formData, "notes") || null,
    target_parking_available: readString(formData, "parking_available") === "true",
    target_parking_notes: readString(formData, "parking_notes") || null,
    target_reservation_id: reservationId,
    target_scheduled_at: `${scheduledAt}:00+09:00`,
    target_service_category_id: readString(formData, "service_category_id"),
    target_service_items: serviceItems,
    target_custom_tool_names: customToolNames,
    target_tool_ids: toolIds,
    target_worker_ids: workerIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  const selectedDate = scheduledAt.slice(0, 10);
  revalidateStaffData();
  revalidateAdminData();
  revalidatePath(`/staff/schedule/${reservationId}`);
  redirect(`/staff/dashboard?date=${selectedDate}&updated=1`);
}

export async function saveWorker(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const workerId = readString(formData, "worker_id");
  const payload = {
    name: readString(formData, "name"),
    worker_type: readString(formData, "worker_type"),
    default_compensation_type: readString(formData, "compensation_type"),
    default_compensation_value: readNumber(formData, "compensation_value"),
    active: readString(formData, "active") !== "false",
  };

  if (!payload.name || payload.default_compensation_value < 0) {
    throw new Error("作業者名と報酬設定を確認してください");
  }

  const query = workerId
    ? supabase.from("workers").update(payload).eq("id", workerId)
    : supabase.from("workers").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidateMasterData();
  revalidateAdminData();
  revalidateStaffData();
}

export async function deleteWorker(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const workerId = readString(formData, "worker_id");

  const { count, error: countError } = await supabase
    .from("reservation_workers")
    .select("reservation_id", { count: "exact", head: true })
    .eq("worker_id", workerId);

  if (countError) throw new Error(countError.message);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("workers")
      .update({ active: false })
      .eq("id", workerId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("workers").delete().eq("id", workerId);
    if (error) throw new Error(error.message);
  }

  revalidateMasterData();
  revalidateAdminData();
  revalidateStaffData();
}

export async function saveServiceCategory(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const categoryId = readString(formData, "category_id");
  const payload = {
    name: readString(formData, "name"),
    active: readString(formData, "active") !== "false",
  };

  if (!payload.name) throw new Error("区分名を入力してください");

  const query = categoryId
    ? supabase.from("service_categories").update(payload).eq("id", categoryId)
    : supabase.from("service_categories").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidateMasterData();
  revalidateAdminData();
  revalidateStaffData();
}

export async function saveServiceContent(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const contentId = readString(formData, "content_id");
  const payload = {
    name: readString(formData, "name"),
    active: readString(formData, "active") !== "false",
  };

  if (!payload.name) throw new Error("作業内容名を入力してください");

  const query = contentId
    ? supabase.from("service_contents").update(payload).eq("id", contentId)
    : supabase.from("service_contents").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidateMasterData();
}

export async function deleteServiceContent(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const contentId = readString(formData, "content_id");
  const { count, error: countError } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("service_content_id", contentId);

  if (countError) throw new Error(countError.message);

  const query =
    (count ?? 0) > 0
      ? supabase.from("service_contents").update({ active: false }).eq("id", contentId)
      : supabase.from("service_contents").delete().eq("id", contentId);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidateMasterData();
}

export async function deleteServiceCategory(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const categoryId = readString(formData, "category_id");
  const { count, error: countError } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("service_category_id", categoryId);

  if (countError) throw new Error(countError.message);

  const query =
    (count ?? 0) > 0
      ? supabase.from("service_categories").update({ active: false }).eq("id", categoryId)
      : supabase.from("service_categories").delete().eq("id", categoryId);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidateMasterData();
  revalidateAdminData();
  revalidateStaffData();
}

export async function upsertWorkReport(formData: FormData) {
  const profile = await requireRole("staff");
  const supabase = await createClient();
  const reservationId = readString(formData, "reservation_id");
  const baseWorkerIds = formData.getAll("worker_ids").map(String).filter(Boolean);
  const supportWorkerIds =
    readString(formData, "has_supporter") === "true"
      ? formData.getAll("support_worker_ids").map(String).filter(Boolean)
      : [];
  const workerIds = [...new Set([...baseWorkerIds, ...supportWorkerIds])];
  const customSupporters = readCustomSupporters(formData);

  if (workerIds.length === 0) {
    throw new Error("当日の作業担当者を1人以上選択してください");
  }
  if (
    readString(formData, "has_supporter") === "true" &&
    supportWorkerIds.length === 0 &&
    customSupporters.length === 0
  ) {
    throw new Error("応援者ありの場合は、作業者を選択するか、その他の名前と金額を入力してください");
  }

  const { data: assignment } = await supabase
    .from("reservation_staff")
    .select("reservation_id")
    .eq("reservation_id", reservationId)
    .eq("staff_id", profile.id)
    .single();

  if (!assignment) {
    throw new Error("担当していない予約には報告できません");
  }

  const reportedAmount = readNumber(formData, "reported_amount");
  if (!Number.isInteger(reportedAmount) || reportedAmount <= 0) {
    throw new Error("売上金額は1円以上の整数で入力してください");
  }

  const paymentMethod = readString(formData, "payment_method");
  const cardStatementUrl = readString(formData, "card_statement_url") || null;
  const previousChangeAmount = readNumber(formData, "previous_change_amount");
  const cashCollectedAmount = readNumber(formData, "cash_collected_amount");
  let changeAmount = readNumber(formData, "change_amount");

  if (paymentMethod === "card" && !cardStatementUrl) {
    throw new Error("カード決済の明細画像を添付してください");
  }

  if (paymentMethod === "cash") {
    const values = [previousChangeAmount, cashCollectedAmount];
    if (values.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error("釣銭と管理者へ渡す金額を0円以上の整数で入力してください");
    }
    const currentCashBalance = previousChangeAmount + reportedAmount;
    if (cashCollectedAmount > currentCashBalance) {
      throw new Error("管理者へ渡す金額が現在の残高を超えています");
    }
    changeAmount = currentCashBalance - cashCollectedAmount;
  }

  const { error: workerError } = await supabase.rpc("replace_own_reservation_workers", {
    target_custom_supporters: customSupporters,
    target_reservation_id: reservationId,
    target_worker_ids: workerIds,
  });

  if (workerError) {
    throw new Error(workerError.message);
  }

  const { error } = await supabase.from("work_reports").upsert(
    {
      reservation_id: reservationId,
      staff_id: profile.id,
      report_text: readString(formData, "report_text"),
      issues: readString(formData, "issues") || null,
      customer_review: readString(formData, "customer_review") || null,
      notes: readString(formData, "notes") || null,
      reported_amount: reportedAmount,
      payment_method: paymentMethod,
      card_statement_url: paymentMethod === "card" ? cardStatementUrl : null,
      previous_change_amount: paymentMethod === "cash" ? previousChangeAmount : null,
      change_amount: paymentMethod === "cash" ? changeAmount : null,
      cash_collected_amount: paymentMethod === "cash" ? cashCollectedAmount : null,
      approval_status: "pending",
      reviewed_at: null,
      reviewed_by: null,
    },
    { onConflict: "reservation_id,staff_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (paymentMethod === "cash") {
    const { error: cashBalanceError } = await supabase.from("staff_cash_balances").upsert({
      staff_id: profile.id,
      change_amount: changeAmount,
    });

    if (cashBalanceError) {
      throw new Error(cashBalanceError.message);
    }
  }

  revalidateStaffData();
  revalidateAdminData();
  redirect("/staff/report?success=1");
}

export async function reviewWorkReport(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const decision = readString(formData, "decision");

  if (decision === "approved") {
    const { error } = await supabase.rpc("approve_work_report", {
      report_id: readString(formData, "report_id"),
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("work_reports")
      .update({
        approval_status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", readString(formData, "report_id"));
    if (error) throw new Error(error.message);
  }

  revalidateAdminData();
  revalidateStaffData();
}

export async function createExpense(formData: FormData) {
  const profile = await requireRole("staff");
  const supabase = await createClient();

  const amount = readNumber(formData, "amount");
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("金額は1円以上の整数で入力してください");
  }

  const { error } = await supabase.from("expenses").insert({
    staff_id: profile.id,
    category_id: readString(formData, "category_id"),
    reservation_id: readString(formData, "reservation_id") || null,
    amount,
    note: readString(formData, "note") || null,
    status: "requested",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateStaffData();
  revalidateAdminData();
  redirect("/staff/expense?success=1");
}

export async function updateExpenseStatus(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const status = readString(formData, "status");
  const receiptUrl = readString(formData, "receipt_url");

  if (status === "purchased" && !receiptUrl) {
    throw new Error("購入済みにするには領収書画像が必要です");
  }

  await supabase
    .from("expenses")
    .update({
      status,
      receipt_url: receiptUrl || null,
    })
    .eq("id", readString(formData, "expense_id"));

  revalidateAdminData();
  revalidateStaffData();
}

export async function routeAfterLogin() {
  const profile = await getCurrentProfile();
  redirect(profile?.role === "admin" ? "/admin/dashboard" : "/staff/dashboard");
}
