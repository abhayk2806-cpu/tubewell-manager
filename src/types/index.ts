export interface Farmer {
  id: string;
  name: string;
  mobile: string;
  notes: string;
  is_deleted: boolean;
  is_disabled: boolean;
  created_at: string;
}

export interface UsageEntry {
  id: string;
  farmer_id: string;
  date: string;
  hours: number;
  minutes: number;
  total_minutes: number;
  amount: number;
  rate_per_hour: number;
  month: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
}

export interface Payment {
  id: string;
  farmer_id: string;
  amount: number;
  date: string;
  for_month: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
}

export interface FarmerSummary extends Farmer {
  total_usage_amount: number;
  total_paid: number;
  total_due: number;
}

export interface MonthSummary {
  month: string;
  total_hours: number;
  total_minutes: number;
  total_amount: number;
  paid: number;
  remaining: number;
  entries: UsageEntry[];
}

export interface MonthClosing {
  id: string;
  farmer_id: string;
  month: string;
  closed_at: string;
  closed_by: string;
  closed_by_email: string;
}

export interface BackupData {
  version: string;
  exported_at: string;
  farmers: Farmer[];
  usage_entries: UsageEntry[];
  payments: Payment[];
  month_closings: MonthClosing[];
}
