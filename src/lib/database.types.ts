// Kézzel karbantartott típusok a supabase/migrations/0001_init.sql sémához.
// (Generálható is: `supabase gen types typescript --linked > src/lib/database.types.ts`)

export type WorkStatus = "office" | "remote";
export type ScheduleStatus = "office" | "remote" | "vacation" | "sick";
export type ApprovalStatus = "approved" | "pending" | "rejected";
export type Role = "admin" | "member";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Company = {
  id: string;
  name: string;
  invite_code: string;
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

export type Database = {
  public: {
    Tables: {
      companies: Table<Company, { id?: string; name: string; invite_code?: string; created_at?: string }>;
      profiles: Table<Profile, Partial<Profile> & { id: string; email: string; full_name: string }>;
      recurring_patterns: Table<
        RecurringPattern,
        Partial<RecurringPattern> & { user_id: string; company_id: string }
      >;
      schedules: Table<
        Schedule,
        Partial<Schedule> & { company_id: string; user_id: string; date: string; status: ScheduleStatus }
      >;
      medical_documents: Table<
        MedicalDocument,
        Omit<MedicalDocument, "id" | "uploaded_at"> & { id?: string; uploaded_at?: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_company: { Args: { company_name: string }; Returns: string };
      join_company: { Args: { code: string }; Returns: string };
      preview_invite: { Args: { code: string }; Returns: string | null };
      regenerate_invite_code: { Args: Record<string, never>; Returns: string };
      regenerate_ical_token: { Args: Record<string, never>; Returns: string };
      set_member_role: { Args: { target_user: string; new_role: Role }; Returns: undefined };
      remove_member: { Args: { target_user: string }; Returns: undefined };
      auth_company_id: { Args: Record<string, never>; Returns: string | null };
      is_company_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
