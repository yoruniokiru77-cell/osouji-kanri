import { createClient } from "@/lib/supabase/server";
import type {
  Expense,
  ExpenseCategory,
  ReservationWithRelations,
  ServiceCategory,
  ServiceContent,
  ServiceContentTool,
  Tool,
  Worker,
} from "@/lib/types";

export const CACHE_TAGS = {
  admin: "admin-data",
  masters: "masters",
  staff: "staff-data",
};

type CacheEntry<T> = {
  expiresAt: number;
  tags: string[];
  value: T;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

const globalCache = globalThis as typeof globalThis & {
  __osoujiApiCache?: Map<string, CacheEntry<unknown>>;
};

const apiCache = globalCache.__osoujiApiCache ?? new Map<string, CacheEntry<unknown>>();
globalCache.__osoujiApiCache = apiCache;

async function apiGetCached<T>(key: string, tags: string[], loader: () => Promise<T>) {
  const now = Date.now();
  const cached = apiCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loader();
  apiCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    tags,
    value,
  });
  return value;
}

export function clearCachedData(...tags: string[]) {
  for (const [key, entry] of apiCache.entries()) {
    if (tags.some((tag) => entry.tags.includes(tag))) {
      apiCache.delete(key);
    }
  }
}

export async function getCachedStaffMasters() {
  return apiGetCached("staff-masters", [CACHE_TAGS.masters], async () => {
    const supabase = await createClient();
    const [toolResult, workerResult, categoryResult, contentResult, contentToolResult] = await Promise.all([
      supabase.from("tools").select("id, name").order("name"),
      supabase
        .from("workers")
        .select("id, name, worker_type, default_compensation_type, default_compensation_value, active")
        .eq("active", true)
        .order("worker_type")
        .order("name"),
      supabase
        .from("service_categories")
        .select("id, name, active")
        .eq("active", true)
        .order("name"),
      supabase
        .from("service_contents")
        .select("id, name, active")
        .eq("active", true)
        .order("name"),
      supabase.from("service_content_tools").select("service_content_id, tool_id"),
    ]);

    return {
      categories: (categoryResult.data ?? []) as ServiceCategory[],
      contents: (contentResult.data ?? []) as ServiceContent[],
      serviceContentTools: (contentToolResult.data ?? []) as ServiceContentTool[],
      tools: (toolResult.data ?? []) as Tool[],
      workers: (workerResult.data ?? []) as Worker[],
    };
  });
}

export async function getCachedAdminServiceContents() {
  return apiGetCached("admin-service-contents", [CACHE_TAGS.masters], async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("service_contents")
      .select("id, name, active")
      .order("name");

    return (data ?? []) as ServiceContent[];
  });
}

export async function getCachedStaffDashboardData(
  staffId: string,
  startIso: string,
  endIso: string,
  cacheVersion = "",
) {
  return apiGetCached(`staff-dashboard:${staffId}:${startIso}:${endIso}:${cacheVersion}`, [CACHE_TAGS.staff], async () => {
    const supabase = await createClient();
    const [reservationResult, expenseResult] = await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id, scheduled_at, customer_name, customer_phone, address, service_content, service_category_id, parking_available, parking_notes, notes, status, service_categories(id, name), reservation_staff!inner(staff_id), reservation_workers(worker_id, workers(id, name)), reservation_tools(tool_id)",
        )
        .eq("reservation_staff.staff_id", staffId)
        .neq("status", "cancelled")
        .gte("scheduled_at", startIso)
        .lt("scheduled_at", endIso)
        .order("scheduled_at"),
      supabase
        .from("expenses")
        .select(
          "id, staff_id, category_id, reservation_id, amount, note, status, receipt_url, created_at, expense_categories(id, name)",
        )
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    return {
      expenses: (expenseResult.data ?? []) as unknown as Expense[],
      reservations: (reservationResult.data ?? []) as unknown as ReservationWithRelations[],
    };
  });
}

export async function getCachedStaffReportData(staffId: string) {
  return apiGetCached(`staff-report:${staffId}`, [CACHE_TAGS.staff, CACHE_TAGS.masters], async () => {
    const supabase = await createClient();
    const [reservationResult, latestCashResult, cashBalanceResult, workerResult] = await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id, scheduled_at, customer_name, customer_phone, address, service_content, service_category_id, status, service_categories(id, name), reservation_staff!inner(staff_id), reservation_workers(worker_id), work_reports(id, staff_id, approval_status)",
        )
        .eq("reservation_staff.staff_id", staffId)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("work_reports")
        .select("change_amount")
        .eq("staff_id", staffId)
        .eq("payment_method", "cash")
        .not("change_amount", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("staff_cash_balances")
        .select("change_amount")
        .eq("staff_id", staffId)
        .maybeSingle(),
      supabase
        .from("workers")
        .select("id, name, worker_type, default_compensation_type, default_compensation_value, active")
        .eq("active", true)
        .order("worker_type")
        .order("name"),
    ]);

    return {
      previousChangeAmount: Number(
        latestCashResult.data?.change_amount ?? cashBalanceResult.data?.change_amount ?? 0,
      ),
      reservations: (reservationResult.data ?? []) as unknown as ReservationWithRelations[],
      workers: (workerResult.data ?? []) as Worker[],
    };
  });
}

export async function getCachedStaffExpenseData(staffId: string) {
  return apiGetCached(`staff-expense:${staffId}`, [CACHE_TAGS.staff, CACHE_TAGS.masters], async () => {
    const supabase = await createClient();
    const [categoryResult, reservationResult, expenseResult] = await Promise.all([
      supabase.from("expense_categories").select("id, name").order("name"),
      supabase
        .from("reservations")
        .select(
          "id, scheduled_at, customer_name, customer_phone, address, service_content, service_category_id, status, service_categories(id, name, active), reservation_staff!inner(staff_id)",
        )
        .eq("reservation_staff.staff_id", staffId)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("expenses")
        .select(
          "id, staff_id, category_id, reservation_id, amount, note, status, receipt_url, created_at, expense_categories(id, name), expense_reservations(reservation_id, reservations(id, scheduled_at, customer_name, customer_phone, address, amount, service_content, service_category_id, parking_available, parking_notes, notes, google_calendar_event_id, status, service_categories(id, name, active), reservation_staff(staff_id, profiles(id, display_name, role, commission_rate)), reservation_workers(worker_id, compensation_type, compensation_value, is_supporter, workers(id, name, worker_type, default_compensation_type, default_compensation_value, active)), reservation_tools(tools(id, name)), work_reports(*)))",
        )
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      categories: (categoryResult.data ?? []) as ExpenseCategory[],
      expenses: (expenseResult.data ?? []) as unknown as Expense[],
      reservations: (reservationResult.data ?? []) as unknown as ReservationWithRelations[],
    };
  });
}

export async function getCachedAdminDashboardData(startIso: string, endIso: string, cacheVersion = "") {
  return apiGetCached(`admin-dashboard:${startIso}:${endIso}:${cacheVersion}`, [CACHE_TAGS.admin, CACHE_TAGS.masters], async () => {
    const supabase = await createClient();
    const [workersResult, categoriesResult, reservationsResult, expensesResult] = await Promise.all([
      supabase
        .from("workers")
        .select("id, name, worker_type, default_compensation_type, default_compensation_value, active")
        .order("worker_type")
        .order("name"),
      supabase
        .from("service_categories")
        .select("id, name, active")
        .order("name"),
      supabase
        .from("reservations")
        .select(
          "id, scheduled_at, customer_name, customer_phone, address, amount, service_content, service_category_id, parking_available, parking_notes, notes, status, service_categories(id, name, active), reservation_staff(staff_id, profiles(id, display_name, role, commission_rate)), reservation_workers(worker_id, compensation_type, compensation_value, is_supporter, workers(id, name, worker_type, default_compensation_type, default_compensation_value, active)), reservation_tools(tools(id, name)), work_reports(*)",
        )
        .gte("scheduled_at", startIso)
        .lt("scheduled_at", endIso)
        .order("scheduled_at"),
      supabase
        .from("expenses")
        .select(
          "id, staff_id, category_id, reservation_id, amount, note, status, receipt_url, created_at, profiles(id, display_name, role, commission_rate), expense_categories(id, name), expense_reservations(reservation_id, reservations(id, scheduled_at, customer_name, customer_phone, address, amount, service_content, service_category_id, parking_available, parking_notes, notes, google_calendar_event_id, status, service_categories(id, name, active), reservation_staff(staff_id, profiles(id, display_name, role, commission_rate)), reservation_workers(worker_id, compensation_type, compensation_value, is_supporter, workers(id, name, worker_type, default_compensation_type, default_compensation_value, active)), reservation_tools(tools(id, name)), work_reports(*)))",
        )
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false }),
    ]);

    return {
      categories: (categoriesResult.data ?? []) as ServiceCategory[],
      expenses: (expensesResult.data ?? []) as unknown as Expense[],
      reservations: (reservationsResult.data ?? []) as unknown as ReservationWithRelations[],
      workers: (workersResult.data ?? []) as Worker[],
    };
  });
}
