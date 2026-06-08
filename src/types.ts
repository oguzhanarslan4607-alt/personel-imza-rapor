export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type IncapacityStatus = "active" | "completed" | "cancelled";
export type HolidayCompensationType = "paid" | "leave" | "none";
export type AnnualLeaveType = "annual" | "excuse" | "unpaid" | "other";
export type LeaveStatus = "planned" | "used" | "cancelled";

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

export type DeletedAttendanceRecord = {
  id: string;
  record: AttendanceRecord;
  staffName: string;
  deletedAt: string;
  deletedBy?: string | null;
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

export type IncapacityReportRecord = {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  status: IncapacityStatus;
  notes: string;
  createdAt: string;
  updatedAt?: string;
};

export type HolidayWorkRecord = {
  id: string;
  staffId: string;
  date: string;
  holidayName: string;
  startTime: string;
  endTime: string;
  hours: number;
  compensationType: HolidayCompensationType;
  notes: string;
  createdAt: string;
  updatedAt?: string;
};

export type AnnualLeaveRecord = {
  id: string;
  staffId: string;
  year: number;
  leaveType: AnnualLeaveType;
  startDate: string;
  endDate: string;
  usedDays: number;
  entitlementDays: number;
  status: LeaveStatus;
  notes: string;
  createdAt: string;
  updatedAt?: string;
};

export type AppSettings = {
  companyName: string;
  formTitle: string;
  shiftStart: string;
  lateAfterMinutes: number;
  rowsPerPrintSide: number;
  theme: "light" | "dark";
};
