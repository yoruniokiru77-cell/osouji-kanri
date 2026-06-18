export type Role = "admin" | "staff";
export type ExpenseStatus = "requested" | "approved" | "purchased" | "rejected";
export type ReservationStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  commission_rate: number;
};

export type Tool = {
  id: string;
  name: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
};

export type ServiceCategory = {
  id: string;
  name: string;
  active: boolean;
};

export type ServiceContent = {
  id: string;
  name: string;
  active: boolean;
};

export type WorkerType = "employee" | "contractor";
export type CompensationType = "percentage" | "fixed";

export type Worker = {
  id: string;
  name: string;
  worker_type: WorkerType;
  default_compensation_type: CompensationType;
  default_compensation_value: number;
  active: boolean;
};

export type Reservation = {
  id: string;
  scheduled_at: string;
  address: string;
  amount: number;
  service_content: string;
  service_content_id: string | null;
  service_category_id: string | null;
  parking_available: boolean;
  parking_notes: string | null;
  notes: string | null;
  status: ReservationStatus;
};

export type ReservationStaff = {
  staff_id: string;
  profiles: Profile | null;
};

export type ReservationWithRelations = Reservation & {
  service_categories: ServiceCategory | null;
  reservation_staff: ReservationStaff[];
  reservation_workers: {
    worker_id: string;
    compensation_type: CompensationType | null;
    compensation_value: number | null;
    workers: Worker | null;
  }[];
  reservation_tools: { tools: Tool | null }[];
  work_reports: WorkReport[];
};

export type WorkReport = {
  id: string;
  reservation_id: string;
  staff_id: string;
  report_text: string;
  issues: string | null;
  customer_review: string | null;
  notes: string | null;
  reported_amount: number;
  payment_method: "cash" | "card" | "invoice" | "other";
  card_statement_url: string | null;
  previous_change_amount: number | null;
  change_amount: number | null;
  cash_collected_amount: number | null;
  approval_status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  staff_id: string;
  category_id: string;
  amount: number;
  status: ExpenseStatus;
  receipt_url: string | null;
  reservation_id: string | null;
  note: string | null;
  created_at: string;
  profiles: Profile | null;
  expense_categories: ExpenseCategory | null;
};
