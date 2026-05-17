export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export type StaffMember = {
  id: string;
  order: number;
  name: string;
  department: string;
  title: string;
  active: boolean;
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

export type AppSettings = {
  companyName: string;
  formTitle: string;
  shiftStart: string;
  lateAfterMinutes: number;
  rowsPerPrintSide: number;
};
