"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole } from "@/lib/auth";
import { CACHE_TAGS, clearCachedData } from "@/lib/cached-data";
import {
  deleteGoogleCalendarEvent,
  upsertGoogleCalendarEvent,
} from "@/lib/google-calendar";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readNumber(formData: FormData, key: string) {
  return Number(readString(formData, key));
}

function parseUrlList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [value];
  } catch {
    return [value];
  }
}

function asJstTimestamp(value: string) {
  if (!value) return value;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return value;
  return `${value.length === 16 ? `${value}:00` : value}+09:00`;
}

type ServiceItemInput = {
  custom_name: string | null;
  service_content_id: string | null;
  quantity: number;
  sort_order: number;
};

type CalendarReservationInput = {
  address: string;
  customer_name: string | null;
  id: string;
  customer_phone: string | null;
  notes: string | null;
  parking_available: boolean;
  parking_notes: string | null;
  scheduled_at: string;
  service_content: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

async function syncReservationToGoogleCalendar(
  supabase: SupabaseServerClient,
  reservationId: string,
  googleCalendarEventId: string | null,
  reservation: CalendarReservationInput,
) {
  try {
    const syncedEventId = await upsertGoogleCalendarEvent(googleCalendarEventId, reservation);
    if (syncedEventId && syncedEventId !== googleCalendarEventId) {
      const { error } = await supabase
        .from("reservations")
        .update({ google_calendar_event_id: syncedEventId })
        .eq("id", reservationId);
      if (error) {
        console.error("Google Calendar event id save failed", error);
      }
    }
  } catch (error) {
    console.error("Google Calendar sync failed", error);
  }
}

async function deleteReservationFromGoogleCalendar(
  googleCalendarEventId: string | null,
  reservation: CalendarReservationInput | null,
) {
  try {
    await deleteGoogleCalendarEvent(googleCalendarEventId, reservation);
  } catch (error) {
    console.error("Google Calendar delete failed", error);
  }
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
    return [];
  }
  return [{ amount, name }];
}

function redirectWorkReportError(message: string, reservationId?: string) {
  const params = new URLSearchParams({ error: message });
  if (reservationId) params.set("booking", reservationId);
  redirect(`/staff/report?${params.toString()}`);
}

function redirectScheduleEditError(reservationId: string, message: string) {
  const params = new URLSearchParams({ error: message });
  redirect(`/staff/schedule/${reservationId}?${params.toString()}`);
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
  const scheduledAt = asJstTimestamp(readString(formData, "scheduled_at"));
  const calendarReservation = {
    address: readString(formData, "address"),
    customer_name: readString(formData, "customer_name") || null,
    id: reservationId,
    customer_phone: readString(formData, "customer_phone") || null,
    notes: readString(formData, "notes") || null,
    parking_available: readString(formData, "parking_available") === "true",
    parking_notes: readString(formData, "parking_notes") || null,
    scheduled_at: scheduledAt,
    service_content: serviceContentLabel,
  };

  const { error } = await supabase
    .from("reservations")
    .insert({
      id: reservationId,
      scheduled_at: scheduledAt,
      customer_name: calendarReservation.customer_name,
      customer_phone: calendarReservation.customer_phone,
      address: calendarReservation.address,
      amount: 0,
      service_content: serviceContentLabel,
      service_content_id: serviceItems.find((item) => item.service_content_id)?.service_content_id ?? null,
      service_category_id: readString(formData, "service_category_id"),
      parking_available: calendarReservation.parking_available,
      parking_notes: calendarReservation.parking_notes,
      notes: calendarReservation.notes,
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

  await syncReservationToGoogleCalendar(supabase, reservationId, null, calendarReservation);

  revalidateStaffData();
  revalidateAdminData();
  revalidatePath("/staff/schedule");
  redirect(`/staff/dashboard?date=${readString(formData, "scheduled_at").slice(0, 10)}&created=${Date.now()}`);
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

  const { data: existingReservation } = await supabase
    .from("reservations")
    .select("google_calendar_event_id")
    .eq("id", reservationId)
    .single();

  const { error } = await supabase.rpc("update_own_scheduled_reservation", {
    target_address: readString(formData, "address"),
    target_customer_name: readString(formData, "customer_name") || null,
    target_customer_phone: readString(formData, "customer_phone") || null,
    target_notes: readString(formData, "notes") || null,
    target_parking_available: readString(formData, "parking_available") === "true",
    target_parking_notes: readString(formData, "parking_notes") || null,
    target_reservation_id: reservationId,
    target_scheduled_at: asJstTimestamp(scheduledAt),
    target_service_category_id: readString(formData, "service_category_id"),
    target_service_items: serviceItems,
    target_custom_tool_names: customToolNames,
    target_tool_ids: toolIds,
    target_worker_ids: workerIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  await syncReservationToGoogleCalendar(
    supabase,
    reservationId,
    existingReservation?.google_calendar_event_id ?? null,
    {
      address: readString(formData, "address"),
      customer_name: readString(formData, "customer_name") || null,
      id: reservationId,
      customer_phone: readString(formData, "customer_phone") || null,
      notes: readString(formData, "notes") || null,
      parking_available: readString(formData, "parking_available") === "true",
      parking_notes: readString(formData, "parking_notes") || null,
      scheduled_at: asJstTimestamp(scheduledAt),
      service_content: serviceContentLabel,
    },
  );

  const selectedDate = scheduledAt.slice(0, 10);
  revalidateStaffData();
  revalidateAdminData();
  revalidatePath(`/staff/schedule/${reservationId}`);
  redirect(`/staff/dashboard?date=${selectedDate}&updated=1`);
}

export async function updateAdminReservation(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const reservationId = readString(formData, "reservation_id");
  const selectedMonth = readString(formData, "month") || readString(formData, "scheduled_at").slice(0, 7);
  const workerIds = [...new Set(formData.getAll("worker_ids").map(String).filter(Boolean))];
  const serviceItems = readServiceItems(formData);
  const customToolNames = readCustomToolNames(formData);
  const toolIds = await getToolIdsWithAutoMappings(
    supabase,
    serviceItems,
    formData.getAll("tool_ids").map(String),
  );
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
      : { data: [] };

  if (!serviceContents || serviceContents.length !== serviceContentIds.length) {
    throw new Error("作業内容を選択してください");
  }

  const serviceContentLabel = buildServiceContentLabel(serviceItems, serviceContents);
  const scheduledAt = readString(formData, "scheduled_at");
  const { data: existingReservation } = await supabase
    .from("reservations")
    .select("google_calendar_event_id")
    .eq("id", reservationId)
    .single();

  const { error } = await supabase
    .from("reservations")
    .update({
      scheduled_at: asJstTimestamp(scheduledAt),
      customer_name: readString(formData, "customer_name") || null,
      customer_phone: readString(formData, "customer_phone") || null,
      address: readString(formData, "address"),
      service_content: serviceContentLabel,
      service_content_id: serviceItems.find((item) => item.service_content_id)?.service_content_id ?? null,
      service_category_id: readString(formData, "service_category_id"),
      parking_available: readString(formData, "parking_available") === "true",
      parking_notes: readString(formData, "parking_notes") || null,
      notes: readString(formData, "notes") || null,
    })
    .eq("id", reservationId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: clearNormalWorkerError } = await supabase
    .from("reservation_workers")
    .delete()
    .eq("reservation_id", reservationId)
    .eq("is_supporter", false);
  if (clearNormalWorkerError) throw new Error(clearNormalWorkerError.message);

  const { error: clearSelectedSupporterError } = await supabase
    .from("reservation_workers")
    .delete()
    .eq("reservation_id", reservationId)
    .in("worker_id", workerIds);
  if (clearSelectedSupporterError) throw new Error(clearSelectedSupporterError.message);

  const { error: workerError } = await supabase.from("reservation_workers").insert(
    workerIds.map((workerId) => ({
      reservation_id: reservationId,
      worker_id: workerId,
      is_supporter: false,
    })),
  );
  if (workerError) throw new Error(workerError.message);

  const { error: serviceItemDeleteError } = await supabase
    .from("reservation_service_contents")
    .delete()
    .eq("reservation_id", reservationId);
  if (serviceItemDeleteError) throw new Error(serviceItemDeleteError.message);

  const { error: serviceItemError } = await supabase.from("reservation_service_contents").insert(
    serviceItems.map((item) => ({
      quantity: item.quantity,
      reservation_id: reservationId,
      custom_name: item.custom_name,
      service_content_id: item.service_content_id,
      sort_order: item.sort_order,
    })),
  );
  if (serviceItemError) throw new Error(serviceItemError.message);

  const { error: toolDeleteError } = await supabase
    .from("reservation_tools")
    .delete()
    .eq("reservation_id", reservationId);
  if (toolDeleteError) throw new Error(toolDeleteError.message);

  if (toolIds.length > 0) {
    const { error: toolError } = await supabase.from("reservation_tools").insert(
      toolIds.map((toolId) => ({
        reservation_id: reservationId,
        tool_id: toolId,
      })),
    );
    if (toolError) throw new Error(toolError.message);
  }

  const { error: customToolDeleteError } = await supabase
    .from("reservation_custom_tools")
    .delete()
    .eq("reservation_id", reservationId);
  if (customToolDeleteError) throw new Error(customToolDeleteError.message);

  if (customToolNames.length > 0) {
    const { error: customToolError } = await supabase.from("reservation_custom_tools").insert(
      customToolNames.map((name, index) => ({
        name,
        reservation_id: reservationId,
        sort_order: index,
      })),
    );
    if (customToolError) throw new Error(customToolError.message);
  }

  await syncReservationToGoogleCalendar(
    supabase,
    reservationId,
    existingReservation?.google_calendar_event_id ?? null,
    {
      address: readString(formData, "address"),
      customer_name: readString(formData, "customer_name") || null,
      id: reservationId,
      customer_phone: readString(formData, "customer_phone") || null,
      notes: readString(formData, "notes") || null,
      parking_available: readString(formData, "parking_available") === "true",
      parking_notes: readString(formData, "parking_notes") || null,
      scheduled_at: asJstTimestamp(scheduledAt),
      service_content: serviceContentLabel,
    },
  );

  revalidateAdminData();
  revalidateStaffData();
  revalidatePath(`/admin/reservations/${reservationId}`);
  redirect(`/admin/dashboard?month=${selectedMonth}#schedules`);
}

export async function cancelStaffReservation(formData: FormData) {
  await requireRole("staff");
  const supabase = await createClient();
  const reservationId = readString(formData, "reservation_id");
  const scheduledDate = readString(formData, "scheduled_date");

  if (!reservationId) {
    redirect("/staff/dashboard?error=delete");
  }

  const { data: existingReservation } = await supabase
    .from("reservations")
    .select("address, customer_name, customer_phone, google_calendar_event_id, notes, parking_available, parking_notes, scheduled_at, service_content")
    .eq("id", reservationId)
    .single();

  const { error } = await supabase.rpc("cancel_own_scheduled_reservation", {
    target_reservation_id: reservationId,
  });

  if (error) {
    redirectScheduleEditError(
      reservationId,
      "予定を削除できませんでした。削除できるのは、自分が登録した未完了の予定のみです。",
    );
  }

  await deleteReservationFromGoogleCalendar(
    existingReservation?.google_calendar_event_id ?? null,
    existingReservation
      ? {
          address: existingReservation.address,
          customer_name: existingReservation.customer_name,
          customer_phone: existingReservation.customer_phone,
          id: reservationId,
          notes: existingReservation.notes,
          parking_available: existingReservation.parking_available,
          parking_notes: existingReservation.parking_notes,
          scheduled_at: existingReservation.scheduled_at,
          service_content: existingReservation.service_content,
        }
      : null,
  );

  revalidateStaffData();
  revalidateAdminData();
  revalidatePath(`/staff/schedule/${reservationId}`);
  redirect(`/staff/dashboard?date=${scheduledDate}&deleted=1`);
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
  const workerIds = [...new Set(baseWorkerIds)];
  const normalizedSupportWorkerIds = [
    ...new Set(supportWorkerIds.filter((workerId) => !workerIds.includes(workerId))),
  ];
  const customSupporters = readCustomSupporters(formData);

  if (workerIds.length === 0) {
    redirectWorkReportError("当日の作業担当者を1人以上選択してください", reservationId);
  }
  if (
    readString(formData, "has_supporter") === "true" &&
    normalizedSupportWorkerIds.length === 0 &&
    customSupporters.length === 0
  ) {
    redirectWorkReportError("応援者ありの場合は、作業者を選択するか、その他の名前と金額を入力してください", reservationId);
  }

  const { data: assignment } = await supabase
    .from("reservation_staff")
    .select("reservation_id")
    .eq("reservation_id", reservationId)
    .eq("staff_id", profile.id)
    .single();

  if (!assignment) {
    redirectWorkReportError("担当していない予約には報告できません", reservationId);
  }

  const { data: existingReport, error: existingReportError } = await supabase
    .from("work_reports")
    .select("approval_status")
    .eq("reservation_id", reservationId)
    .eq("staff_id", profile.id)
    .maybeSingle();

  if (existingReportError) {
    redirectWorkReportError(`報告状況を確認できませんでした: ${existingReportError.message}`, reservationId);
  }
  if (existingReport?.approval_status === "approved") {
    redirectWorkReportError("承認済みの報告は再提出できません。修正が必要な場合は管理者へ連絡してください", reservationId);
  }

  const reportedAmount = readNumber(formData, "reported_amount");
  if (!Number.isInteger(reportedAmount) || reportedAmount <= 0) {
    redirectWorkReportError("売上金額は1円以上の整数で入力してください", reservationId);
  }

  const paymentMethod = readString(formData, "payment_method");
  const cardStatementUrl = readString(formData, "card_statement_url") || null;
  const previousChangeAmount = readNumber(formData, "previous_change_amount");
  const currentCashBalance = readNumber(formData, "current_cash_balance");
  const cashCollectedAmount = readNumber(formData, "cash_collected_amount");
  let changeAmount = readNumber(formData, "change_amount");

  if (paymentMethod === "card" && !cardStatementUrl) {
    redirectWorkReportError("カード決済の明細画像を添付してください", reservationId);
  }

  if (paymentMethod === "cash") {
    const values = [previousChangeAmount, currentCashBalance, cashCollectedAmount];
    if (values.some((value) => !Number.isInteger(value) || value < 0)) {
      redirectWorkReportError("釣銭、現在の残高、管理者へ渡す金額を0円以上の整数で入力してください", reservationId);
    }
    if (cashCollectedAmount > currentCashBalance) {
      redirectWorkReportError("管理者へ渡す金額が現在の残高を超えています", reservationId);
    }
    changeAmount = currentCashBalance - cashCollectedAmount;
  }

  const { error: workerError } = await supabase.rpc("replace_own_reservation_workers", {
    target_custom_supporters: customSupporters,
    target_reservation_id: reservationId,
    target_support_worker_ids: normalizedSupportWorkerIds,
    target_worker_ids: workerIds,
  });

  if (workerError) {
    redirectWorkReportError(`作業者情報を更新できませんでした: ${workerError.message}`, reservationId);
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
      current_cash_balance: paymentMethod === "cash" ? currentCashBalance : null,
      change_amount: paymentMethod === "cash" ? changeAmount : null,
      cash_collected_amount: paymentMethod === "cash" ? cashCollectedAmount : null,
      approval_status: "pending",
      reviewed_at: null,
      reviewed_by: null,
    },
    { onConflict: "reservation_id,staff_id" },
  );

  if (error) {
    redirectWorkReportError(`報告を保存できませんでした: ${error.message}`, reservationId);
  }

  if (paymentMethod === "cash") {
    const { error: cashBalanceError } = await supabase.from("staff_cash_balances").upsert({
      staff_id: profile.id,
      change_amount: changeAmount,
    });

    if (cashBalanceError) {
      redirectWorkReportError(`次回繰越金額を保存できませんでした: ${cashBalanceError.message}`, reservationId);
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
  const reportId = readString(formData, "report_id");

  if (decision === "approved") {
    const approvedAmount = readNumber(formData, "approved_amount");
    const reservationId = readString(formData, "reservation_id");
    const workerIds = [...new Set(formData.getAll("admin_worker_ids").map(String).filter(Boolean))];
    if (!Number.isInteger(approvedAmount) || approvedAmount < 0) {
      throw new Error("承認する売上金額は0円以上の整数で入力してください");
    }
    if (!reservationId || workerIds.length === 0) {
      throw new Error("承認する作業者を1人以上選択してください");
    }

    const { count: validWorkerCount, error: validWorkerError } = await supabase
      .from("workers")
      .select("id", { count: "exact", head: true })
      .in("id", workerIds)
      .eq("active", true);
    if (validWorkerError) throw new Error(validWorkerError.message);
    if ((validWorkerCount ?? 0) !== workerIds.length) {
      throw new Error("選択された作業者を確認してください");
    }

    const { error: clearNormalWorkerError } = await supabase
      .from("reservation_workers")
      .delete()
      .eq("reservation_id", reservationId)
      .eq("is_supporter", false);
    if (clearNormalWorkerError) throw new Error(clearNormalWorkerError.message);

    const { error: clearSelectedSupporterError } = await supabase
      .from("reservation_workers")
      .delete()
      .eq("reservation_id", reservationId)
      .in("worker_id", workerIds);
    if (clearSelectedSupporterError) throw new Error(clearSelectedSupporterError.message);

    const { error: workerError } = await supabase.from("reservation_workers").insert(
      workerIds.map((workerId) => ({
        reservation_id: reservationId,
        worker_id: workerId,
        is_supporter: false,
      })),
    );
    if (workerError) throw new Error(workerError.message);

    const { error } = await supabase.rpc("approve_work_report", {
      approved_amount: approvedAmount,
      report_id: reportId,
    });
    if (error) throw new Error(error.message);
  } else if (decision === "rejected") {
    const { error } = await supabase.rpc("reject_work_report", {
      report_id: reportId,
    });
    if (error) throw new Error(error.message);
  } else {
    throw new Error("承認操作を確認してください");
  }

  revalidateAdminData();
  revalidateStaffData();
}

export async function reopenWorkReport(formData: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const reportId = readString(formData, "report_id");

  const { error } = await supabase.rpc("reopen_work_report", {
    report_id: reportId,
  });
  if (error) throw new Error(error.message);

  revalidateAdminData();
  revalidateStaffData();
}

export async function createExpense(formData: FormData) {
  const profile = await requireRole("staff");
  const supabase = await createClient();

  const amount = readNumber(formData, "amount");
  const linkedReservationIds = [
    ...new Set(formData.getAll("linked_reservation_ids").map(String).filter(Boolean)),
  ];
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("金額は1円以上の整数で入力してください");
  }

  const primaryReservationId = linkedReservationIds[0] || readString(formData, "reservation_id") || null;
  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      staff_id: profile.id,
      category_id: readString(formData, "category_id"),
      reservation_id: primaryReservationId,
      amount,
      note: readString(formData, "note") || null,
      receipt_url: readString(formData, "receipt_url") || null,
      status: "requested",
    })
    .select("id")
    .single();

  if (error || !expense) {
    throw new Error(error?.message ?? "経費申請を保存できませんでした");
  }

  if (linkedReservationIds.length > 0) {
    const { error: linkError } = await supabase.from("expense_reservations").insert(
      linkedReservationIds.map((reservationId) => ({
        expense_id: expense.id,
        reservation_id: reservationId,
      })),
    );
    if (linkError) throw new Error(linkError.message);
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

  const expenseId = readString(formData, "expense_id");
  const { data: existingExpense } = await supabase
    .from("expenses")
    .select("receipt_url")
    .eq("id", expenseId)
    .maybeSingle();
  const finalReceiptUrl = receiptUrl || existingExpense?.receipt_url || null;

  if (status === "purchased" && !finalReceiptUrl) {
    throw new Error("購入済みにするには領収書画像が必要です");
  }

  await supabase
    .from("expenses")
    .update({
      status,
      receipt_url: finalReceiptUrl,
    })
    .eq("id", expenseId);

  revalidateAdminData();
  revalidateStaffData();
}

export async function addExpenseReceipts(formData: FormData) {
  const profile = await requireRole("staff");
  const supabase = await createClient();
  const expenseId = readString(formData, "expense_id");
  const addedReceiptUrls = parseUrlList(readString(formData, "receipt_urls"));

  if (!expenseId || addedReceiptUrls.length === 0) {
    throw new Error("追加する領収書画像を選択してください");
  }

  const { data: expense, error: fetchError } = await supabase
    .from("expenses")
    .select("receipt_url, status")
    .eq("id", expenseId)
    .eq("staff_id", profile.id)
    .single();

  if (fetchError || !expense) {
    throw new Error(fetchError?.message ?? "経費申請を確認できませんでした");
  }
  if (expense.status === "rejected") {
    throw new Error("却下された経費には領収書を追加できません");
  }

  const currentReceiptUrls = parseUrlList(expense.receipt_url);
  const nextReceiptUrls = [...new Set([...currentReceiptUrls, ...addedReceiptUrls])];
  const { error } = await supabase
    .from("expenses")
    .update({ receipt_url: JSON.stringify(nextReceiptUrls) })
    .eq("id", expenseId)
    .eq("staff_id", profile.id)
    .neq("status", "rejected");

  if (error) throw new Error(error.message);

  revalidateStaffData();
  revalidateAdminData();
  redirect("/staff/expense?receipt=1");
}

export async function routeAfterLogin() {
  const profile = await getCurrentProfile();
  redirect(profile?.role === "admin" ? "/admin/dashboard" : "/staff/dashboard");
}
