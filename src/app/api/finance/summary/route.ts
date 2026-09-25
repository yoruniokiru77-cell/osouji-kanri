import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { calculateSummary } from "@/lib/finance";
import type { Expense, ReservationWithRelations } from "@/lib/types";

export const dynamic = "force-dynamic";

const reservationSelect =
  "id, scheduled_at, customer_name, customer_phone, address, amount, service_content, service_category_id, parking_available, parking_notes, notes, status, service_categories(id, name, active), reservation_staff(staff_id, profiles(id, display_name, role, commission_rate)), reservation_workers(worker_id, compensation_type, compensation_value, is_supporter, workers(id, name, worker_type, default_compensation_type, default_compensation_value, active)), reservation_tools(tools(id, name)), work_reports(*)";

function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value || value < 1 || value > 12) return null;

  const nextMonth = value === 12 ? 1 : value + 1;
  const nextYear = value === 12 ? year + 1 : year;
  const start = new Date(`${year}-${String(value).padStart(2, "0")}-01T00:00:00+09:00`);
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function defaultMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());
}

function paymentMethodLabel(method: string) {
  return { cash: "現金", card: "カード", invoice: "請求書", other: "その他" }[method] ?? method;
}

function hasApprovedReport(reservation: ReservationWithRelations) {
  return reservation.work_reports.some((report) => report.approval_status === "approved");
}

function isApprovedCompleted(reservation: ReservationWithRelations) {
  return reservation.status === "completed" && hasApprovedReport(reservation);
}

function approvedPaymentMethod(reservation: ReservationWithRelations) {
  return reservation.work_reports.find((report) => report.approval_status === "approved")?.payment_method ?? "other";
}

function expenseIsInRange(expense: Expense, startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const linkedReservationDates =
    expense.expense_reservations
      ?.map((link) => link.reservations?.scheduled_at)
      .filter((value): value is string => Boolean(value)) ?? [];

  if (linkedReservationDates.length > 0) {
    return linkedReservationDates.some((value) => {
      const scheduledAt = new Date(value).getTime();
      return scheduledAt >= start && scheduledAt < end;
    });
  }

  const createdAt = new Date(expense.created_at).getTime();
  return createdAt >= start && createdAt < end;
}

function isAuthorized(request: NextRequest) {
  const apiKey = process.env.FINANCE_API_KEY;
  if (!apiKey) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerKey = request.headers.get("x-api-key") ?? "";
  return bearerToken === apiKey || headerKey === apiKey;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 },
    );
  }

  const month = request.nextUrl.searchParams.get("month") ?? defaultMonth();
  const range = monthRange(month);
  if (!range) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const [reservationsResult, expensesResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(reservationSelect)
      .gte("scheduled_at", range.start)
      .lt("scheduled_at", range.end)
      .order("scheduled_at"),
    supabase
      .from("expenses")
      .select(
        "id, staff_id, category_id, amount, status, receipt_url, reservation_id, note, created_at, profiles(id, display_name, role, commission_rate), expense_categories(id, name), expense_reservations(reservation_id, reservations(id, scheduled_at, customer_name, service_content))",
      )
      .order("created_at", { ascending: false }),
  ]);

  if (reservationsResult.error) {
    return NextResponse.json({ error: reservationsResult.error.message }, { status: 500 });
  }
  if (expensesResult.error) {
    return NextResponse.json({ error: expensesResult.error.message }, { status: 500 });
  }

  const reservations = (reservationsResult.data ?? []) as unknown as ReservationWithRelations[];
  const expenses = ((expensesResult.data ?? []) as unknown as Expense[]).filter((expense) =>
    expenseIsInRange(expense, range.start, range.end),
  );
  const summary = calculateSummary(reservations, expenses);
  const completedReservations = reservations.filter(isApprovedCompleted);
  const paymentMethods = (["cash", "card", "invoice", "other"] as const).map((method) => {
    const methodReservations = completedReservations.filter(
      (reservation) => approvedPaymentMethod(reservation) === method,
    );
    return {
      method,
      label: paymentMethodLabel(method),
      amount: methodReservations.reduce((sum, reservation) => sum + Number(reservation.amount), 0),
      count: methodReservations.length,
    };
  });

  return NextResponse.json({
    month,
    range,
    summary: {
      totalSales: summary.totalSales,
      totalPayroll: summary.totalPayroll,
      deductiblePayroll: summary.deductiblePayroll,
      totalContractorCosts: summary.totalContractorCosts,
      purchasedExpenses: summary.purchasedExpenses,
      netProfit: summary.netProfit,
    },
    counts: {
      reservations: reservations.length,
      completedReservations: completedReservations.length,
      pendingReports: reservations.flatMap((reservation) =>
        reservation.work_reports.filter((report) => report.approval_status === "pending"),
      ).length,
      approvedReports: reservations.flatMap((reservation) =>
        reservation.work_reports.filter((report) => report.approval_status === "approved"),
      ).length,
      requestedExpenses: expenses.filter((expense) => expense.status === "requested").length,
      approvedExpenses: expenses.filter((expense) => expense.status === "approved").length,
      purchasedExpenses: expenses.filter((expense) => expense.status === "purchased").length,
    },
    paymentMethods,
    payroll: summary.payroll,
    contractorCosts: summary.contractorCosts,
  });
}
