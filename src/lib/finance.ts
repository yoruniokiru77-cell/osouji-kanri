import type { Expense, ReservationWithRelations } from "@/lib/types";

function assignmentAmount(
  reservation: ReservationWithRelations,
  assignment: ReservationWithRelations["reservation_workers"][number],
  workerCount: number,
) {
  const worker = assignment.workers!;
  const overrideValue = Number(assignment.compensation_value);
  const hasUsableOverride =
    assignment.compensation_type !== null &&
    assignment.compensation_value !== null &&
    !(assignment.compensation_type === "fixed" && overrideValue === 0);
  const type = hasUsableOverride
    ? assignment.compensation_type!
    : worker.default_compensation_type;
  const value = hasUsableOverride
    ? overrideValue
    : Number(worker.default_compensation_value);

  return type === "fixed"
    ? value
    : Math.floor(Number(reservation.amount) / workerCount) * (value / 100);
}

export function calculatePayroll(reservations: ReservationWithRelations[]) {
  const payroll = new Map<string, { staffName: string; amount: number }>();

  for (const reservation of reservations.filter((item) => item.status === "completed")) {
    const assignments = reservation.reservation_workers?.filter((item) => item.workers) ?? [];
    if (assignments.length === 0) continue;

    for (const assignment of assignments) {
      const worker = assignment.workers!;
      if (worker.worker_type !== "employee") continue;
      const current = payroll.get(worker.id) ?? { staffName: worker.name, amount: 0 };
      current.amount += assignmentAmount(reservation, assignment, assignments.length);
      payroll.set(worker.id, current);
    }
  }

  return Array.from(payroll.values()).sort((a, b) => b.amount - a.amount);
}

export function calculateContractorCosts(reservations: ReservationWithRelations[]) {
  const costs = new Map<string, { workerName: string; amount: number }>();

  for (const reservation of reservations.filter((item) => item.status === "completed")) {
    const assignments = reservation.reservation_workers?.filter((item) => item.workers) ?? [];
    if (assignments.length === 0) continue;

    for (const assignment of assignments) {
      const worker = assignment.workers!;
      if (worker.worker_type !== "contractor") continue;
      const current = costs.get(worker.id) ?? { workerName: worker.name, amount: 0 };
      current.amount += assignmentAmount(reservation, assignment, assignments.length);
      costs.set(worker.id, current);
    }
  }

  return Array.from(costs.values()).sort((a, b) => b.amount - a.amount);
}

export function calculateSummary(
  reservations: ReservationWithRelations[],
  expenses: Expense[],
) {
  const completedReservations = reservations.filter((item) => item.status === "completed");
  const totalSales = completedReservations.reduce((sum, item) => sum + Number(item.amount), 0);
  const payroll = calculatePayroll(completedReservations);
  const totalPayroll = payroll.reduce((sum, item) => sum + item.amount, 0);
  const contractorCosts = calculateContractorCosts(completedReservations);
  const totalContractorCosts = contractorCosts.reduce((sum, item) => sum + item.amount, 0);
  const purchasedExpenses = expenses
    .filter((expense) => expense.status === "purchased")
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  return {
    totalSales,
    totalPayroll,
    totalContractorCosts,
    purchasedExpenses,
    netProfit: totalSales - (totalPayroll + totalContractorCosts + purchasedExpenses),
    payroll,
    contractorCosts,
  };
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}
