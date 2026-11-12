// Kézzel karbantartott típusok a db/migrations/0001_init.sql sémához.

export type WorkStatus = "office" | "remote";
export type ScheduleStatus = "office" | "remote" | "vacation" | "sick";
export type ApprovalStatus = "approved" | "pending" | "rejected";
export type Role = "admin" | "member";

export type Company = {
  id: string;
  name: string;
  invite_code: string;
  /** Az ebédszünet hossza percben (cégszintű, admin állítja). */
  lunch_minutes: number;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string | null;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  ical_token: string;
  created_at: string;
};

export type RecurringPattern = {
  id: string;
  user_id: string;
  company_id: string;
  mon: WorkStatus | null;
  tue: WorkStatus | null;
  wed: WorkStatus | null;
  thu: WorkStatus | null;
  fri: WorkStatus | null;
  updated_at: string;
};

export type Schedule = {
  id: string;
  company_id: string;
  user_id: string;
  date: string; // yyyy-MM-dd
  status: ScheduleStatus;
  approval_status: ApprovalStatus;
  request_group_id: string | null;
  note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalDocument = {
  id: string;
  company_id: string;
  user_id: string;
  request_group_id: string;
  storage_path: string;
  file_name: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png";
  uploaded_at: string;
};

/** Munkaidő egy hétköznapra (1 = hétfő … 5 = péntek). Az idők „HH:MM:SS” alakúak. */
export type WorkHours = {
  user_id: string;
  weekday: 1 | 2 | 3 | 4 | 5;
  start_time: string;
  end_time: string;
  lunch_start: string | null;
};

export type CompanyInvitation = {
  id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};
