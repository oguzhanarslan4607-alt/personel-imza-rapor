export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export type StaffMember = {
  id: string;
  order: number;
  name: string;
  department: string;
  title: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
};

export type AttendanceRecord = {
  id: string;
  staffId: string;
  date: string;
  checkInTime: string;
  status: AttendanceStatus;
  lateReason: string;
  updatedAt?: string;
};

export type PrintArchiveRecord = {
  id: string;
  date: string;
  staffCount: number;
  pageCount: number;
  rowsPerPrintSide: number;
  shiftStart: string;
  createdAt: string;
  createdBy?: string | null;
};

export type DayLockRecord = {
  id: string;
  date: string;
  locked: boolean;
  updatedAt: string;
  updatedBy?: string | null;
};

export type AuditLogRecord = {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
  createdBy?: string | null;
};

export type AppSettings = {
  companyName: string;
  formTitle: string;
  shiftStart: string;
  lateAfterMinutes: number;
  rowsPerPrintSide: number;
};
