import {
  Activity,
  ArchiveRestore,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Database,
  Edit3,
  Eye,
  FileUp,
  FileSpreadsheet,
  FileDown,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Moon,
  PieChart,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Trash2,
  UnlockKeyhole,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSampleStaff } from "./data/sampleStaff";
import { addMinutesToTime, compareTimes, formatDateTr, monthStartIso, todayIso, toLocalIsoDate } from "./lib/date";
import {
  deleteAnnualLeaveRecord,
  deleteDeletedAttendance,
  deleteAttendanceRecord,
  deleteHolidayWorkRecord,
  deleteIncapacityReport,
  deleteStaffMember,
  firebaseConfigured,
  firebaseProjectId,
  hasAdminAccess,
  loadAuditLogs,
  loadAttendanceByDate,
  loadAttendanceRange,
  loadAnnualLeaveRecords,
  loadDayLock,
  loadDeletedAttendance,
  loadHolidayWorkRecords,
  loadIncapacityReports,
  loadPrintArchives,
  loadStaff,
  makeAttendanceId,
  observeAdminAuth,
  saveAuditLog,
  saveAttendanceRecord,
  saveAnnualLeaveRecord,
  saveDayLock,
  saveDeletedAttendance,
  saveHolidayWorkRecord,
  saveIncapacityReport,
  savePrintArchive,
  saveStaffMember,
  saveStaffMembers,
  signInAdmin,
  signOutAdmin,
  type AdminUser,
} from "./lib/repository";
import { defaultSettings, loadSettings, saveSettings } from "./lib/settings";
import type {
  AnnualLeaveRecord,
  AnnualLeaveType,
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
  AuditLogRecord,
  DayLockRecord,
  DeletedAttendanceRecord,
  HolidayCompensationType,
  HolidayWorkRecord,
  IncapacityReportRecord,
  IncapacityStatus,
  LeaveStatus,
  PrintArchiveRecord,
  StaffMember,
} from "./types";

type TabKey =
  | "daily"
  | "print"
  | "reports"
  | "incapacity"
  | "holidayWork"
  | "annualLeave"
  | "unpaidLeave"
  | "profiles"
  | "bulk"
  | "staff"
  | "settings";
type AccessState = "idle" | "checking" | "allowed" | "denied";
type PrintMode = "signature" | "holidayWork" | "incapacity" | "annualLeave" | "unpaidLeave";
type DraftRecord = {
  checkInTime: string;
  status: AttendanceStatus | "";
  lateReason: string;
};
type StatusCounts = Record<AttendanceStatus, number> & { total: number; lateMinutes: number };
type ReportSummaryRow = {
  staff: StaffMember;
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  lateMinutes: number;
};
type DailyTrendRow = StatusCounts & { date: string };
type DepartmentReportRow = StatusCounts & { department: string };
type PublicHoliday = {
  date: string;
  name: string;
  duration: "full" | "half";
};
type LeaveFormState = {
  id: string;
  staffId: string;
  year: number;
  leaveType: AnnualLeaveType;
  startDate: string;
  endDate: string;
  entitlementDays: number;
  status: LeaveStatus;
  notes: string;
};
type HolidayWorkGroup = {
  id: string;
  staffId: string;
  month: string;
  dates: string[];
  holidayNames: string[];
  timeRanges: string[];
  hours: number;
  compensationSummary: string;
  notes: string[];
  records: HolidayWorkRecord[];
};
type StaffInsight = {
  staff: StaffMember;
  counts: StatusCounts;
  todayDraft: DraftRecord;
  todayStatus: AttendanceStatus | "";
  lastRecord: AttendanceRecord | null;
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof CalendarCheck }> = [
  { key: "daily", label: "Günlük Kayıt", icon: CalendarCheck },
  { key: "print", label: "İmza Föyü", icon: Printer },
  { key: "reports", label: "Raporlar", icon: BarChart3 },
  { key: "incapacity", label: "İş Göremezlik Raporu", icon: FileSpreadsheet },
  { key: "holidayWork", label: "Resmi Tatil Çalışan", icon: CalendarDays },
  { key: "annualLeave", label: "Yıllık İzin Takibi", icon: CalendarCheck },
  { key: "unpaidLeave", label: "Ücretsiz İzin", icon: CalendarCheck },
  { key: "profiles", label: "Profil", icon: UserRound },
  { key: "bulk", label: "Toplu İşlem", icon: CheckSquare },
  { key: "staff", label: "Personel", icon: Users },
  { key: "settings", label: "Ayarlar", icon: Settings },
];

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Geldi",
  late: "Geç",
  absent: "Gelmedi",
  excused: "İzinli",
};
const incapacityStatusLabels: Record<IncapacityStatus, string> = {
  active: "Aktif",
  completed: "Bitti",
  cancelled: "İptal",
};
const holidayCompensationLabels: Record<HolidayCompensationType, string> = {
  paid: "Ücret",
  leave: "İzin karşılığı",
  none: "Belirtilmedi",
};
const annualLeaveTypeLabels: Record<AnnualLeaveType, string> = {
  annual: "Yıllık izin",
  excuse: "Mazeret",
  unpaid: "Ücretsiz izin",
  other: "Diğer",
};
const leaveStatusLabels: Record<LeaveStatus, string> = {
  planned: "Planlandı",
  used: "Kullanıldı",
  cancelled: "İptal",
};

const emptyDraft: DraftRecord = {
  checkInTime: "",
  status: "",
  lateReason: "",
};
const EXTRA_SIGNATURE_ROWS = 3;
const BRAND_LOGO_SRC = "/brand-logo.png";
const HOLIDAY_WORK_DEFAULT_START = "09:00";
const HOLIDAY_WORK_DEFAULT_END = "18:00";
const islamicDateFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function sortStaff(staff: StaffMember[]) {
  return [...staff].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "tr", { sensitivity: "base" }) ||
      a.department.localeCompare(b.department, "tr", { sensitivity: "base" }) ||
      a.title.localeCompare(b.title, "tr", { sensitivity: "base" }) ||
      a.order - b.order,
  );
}

function computeStatusFromTime(checkInTime: string, settings: AppSettings): AttendanceStatus {
  const limit = addMinutesToTime(settings.shiftStart, settings.lateAfterMinutes);
  return compareTimes(checkInTime, limit) > 0 ? "late" : "present";
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

function getLateMinutes(checkInTime: string, settings: AppSettings) {
  if (!checkInTime) return 0;
  return Math.max(0, timeToMinutes(checkInTime) - timeToMinutes(settings.shiftStart));
}

function isoFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDateFromIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysIso(date: string, days: number) {
  const next = utcDateFromIso(date);
  next.setUTCDate(next.getUTCDate() + days);
  return isoFromUtcDate(next);
}

function getIslamicDateParts(date: Date) {
  const parts = islamicDateFormatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 0),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 0),
  };
}

function findIslamicHolidayStart(year: number, month: number, day: number) {
  for (let cursor = new Date(Date.UTC(year, 0, 1)); cursor.getUTCFullYear() === year; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const parts = getIslamicDateParts(cursor);
    if (parts.month === month && parts.day === day) return isoFromUtcDate(cursor);
  }

  return "";
}

function getTurkiyePublicHolidays(year: number): PublicHoliday[] {
  const holidays: PublicHoliday[] = [
    { date: `${year}-01-01`, name: "Yılbaşı", duration: "full" },
    { date: `${year}-04-23`, name: "Ulusal Egemenlik ve Çocuk Bayramı", duration: "full" },
    { date: `${year}-05-01`, name: "Emek ve Dayanışma Günü", duration: "full" },
    { date: `${year}-05-19`, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", duration: "full" },
    { date: `${year}-07-15`, name: "Demokrasi ve Milli Birlik Günü", duration: "full" },
    { date: `${year}-08-30`, name: "Zafer Bayramı", duration: "full" },
    { date: `${year}-10-28`, name: "Cumhuriyet Bayramı Arefesi", duration: "half" },
    { date: `${year}-10-29`, name: "Cumhuriyet Bayramı", duration: "full" },
  ];

  const ramadanStart = findIslamicHolidayStart(year, 10, 1);
  if (ramadanStart) {
    holidays.push(
      { date: addDaysIso(ramadanStart, -1), name: "Ramazan Bayramı Arefesi", duration: "half" },
      { date: ramadanStart, name: "Ramazan Bayramı 1. Gün", duration: "full" },
      { date: addDaysIso(ramadanStart, 1), name: "Ramazan Bayramı 2. Gün", duration: "full" },
      { date: addDaysIso(ramadanStart, 2), name: "Ramazan Bayramı 3. Gün", duration: "full" },
    );
  }

  const sacrificeStart = findIslamicHolidayStart(year, 12, 10);
  if (sacrificeStart) {
    holidays.push(
      { date: addDaysIso(sacrificeStart, -1), name: "Kurban Bayramı Arefesi", duration: "half" },
      { date: sacrificeStart, name: "Kurban Bayramı 1. Gün", duration: "full" },
      { date: addDaysIso(sacrificeStart, 1), name: "Kurban Bayramı 2. Gün", duration: "full" },
      { date: addDaysIso(sacrificeStart, 2), name: "Kurban Bayramı 3. Gün", duration: "full" },
      { date: addDaysIso(sacrificeStart, 3), name: "Kurban Bayramı 4. Gün", duration: "full" },
    );
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

function getRecordLateMinutes(record: AttendanceRecord, settings: AppSettings) {
  if (record.status !== "late") return 0;
  return getLateMinutes(record.checkInTime, settings);
}

function getDraftStatus(draft: DraftRecord, settings: AppSettings): AttendanceStatus | "" {
  return draft.status || (draft.checkInTime ? computeStatusFromTime(draft.checkInTime, settings) : "");
}

function createEmptyCounts(): StatusCounts {
  return { total: 0, present: 0, late: 0, absent: 0, excused: 0, lateMinutes: 0 };
}

function formatShortDate(value: string) {
  const [, month = "", day = ""] = value.split("-");
  return `${day}.${month}`;
}

function getStatusRowClass(status: AttendanceStatus | "") {
  return status ? `row-status-${status}` : "row-status-empty";
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFKD");
}

function matchesStaffSearch(member: StaffMember, search: string) {
  const needle = normalizeText(search.trim());
  if (!needle) return true;

  return normalizeText(`${member.name} ${member.department} ${member.title}`).includes(needle);
}

function getDepartments(staff: StaffMember[]) {
  return Array.from(new Set(staff.map((member) => member.department.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "tr", { sensitivity: "base" }),
  );
}

function isSundayIso(value: string) {
  if (!value) return false;
  return new Date(`${value}T12:00:00`).getDay() === 0;
}

function monthEndIso(value: string) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  return toLocalIsoDate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
}

function parseIsoDate(value: string) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function countCalendarDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function countLeaveDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function calculateWorkHours(startTime: string, endTime: string) {
  if (!startTime || !endTime) return 0;
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  const grossMinutes = end - start;
  const breakMinutes = grossMinutes >= 7.5 * 60 ? 60 : 0;
  return Math.round(((grossMinutes - breakMinutes) / 60) * 100) / 100;
}

function getHolidayWorkNetHours(record: HolidayWorkRecord) {
  return calculateWorkHours(record.startTime, record.endTime);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMonthTr(month: string) {
  if (!month) return "";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}

function getMonthEndIso(month: string) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  return isoFromUtcDate(new Date(Date.UTC(year, monthIndex, 0)));
}

function formatDateDotTr(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatWeekdayTr(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
}

function getNextCalendarDateIso(date: string) {
  const nextDate = addDaysIso(date, 1);
  return isSundayIso(nextDate) ? addDaysIso(nextDate, 1) : nextDate;
}

function splitStaffName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: fullName.trim(), lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function numberToTurkishText(value: number) {
  const words: Record<number, string> = {
    0: "Sıfır",
    1: "Bir",
    2: "İki",
    3: "Üç",
    4: "Dört",
    5: "Beş",
    6: "Altı",
    7: "Yedi",
    8: "Sekiz",
    9: "Dokuz",
    10: "On",
    11: "On bir",
    12: "On iki",
    13: "On üç",
    14: "On dört",
    15: "On beş",
    16: "On altı",
    17: "On yedi",
    18: "On sekiz",
    19: "On dokuz",
    20: "Yirmi",
    21: "Yirmi bir",
    22: "Yirmi iki",
    23: "Yirmi üç",
    24: "Yirmi dört",
    25: "Yirmi beş",
    26: "Yirmi altı",
    27: "Yirmi yedi",
    28: "Yirmi sekiz",
    29: "Yirmi dokuz",
    30: "Otuz",
    31: "Otuz bir",
  };
  return words[value] ?? String(value);
}

function getLeaveDisplayStatus(record: AnnualLeaveRecord) {
  if (record.status === "planned" && record.endDate <= todayIso()) return "Bitti";
  return leaveStatusLabels[record.status];
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function annualLeavePdfLayout(borderColor: string) {
  return {
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
    hLineColor: () => borderColor,
    vLineColor: () => borderColor,
    paddingLeft: () => 2,
    paddingRight: () => 2,
    paddingTop: () => 1,
    paddingBottom: () => 1,
  };
}

function groupHolidayWorkRecords(records: HolidayWorkRecord[], staffById?: Map<string, StaffMember>): HolidayWorkGroup[] {
  const groups = new Map<string, HolidayWorkRecord[]>();

  records.forEach((record) => {
    const month = record.date.slice(0, 7);
    const key = `${record.staffId}-${month}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });

  return Array.from(groups.entries())
    .map(([id, groupRecords]) => {
      const sortedRecords = [...groupRecords].sort((a, b) => a.date.localeCompare(b.date));
      const compensationCounts = sortedRecords.reduce<Record<HolidayCompensationType, number>>(
        (counts, record) => {
          counts[record.compensationType] += 1;
          return counts;
        },
        { paid: 0, leave: 0, none: 0 },
      );
      const compensationSummary = (Object.entries(compensationCounts) as Array<[HolidayCompensationType, number]>)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${holidayCompensationLabels[type]}: ${count}`)
        .join(", ");

      return {
        id,
        staffId: sortedRecords[0]?.staffId ?? "",
        month: sortedRecords[0]?.date.slice(0, 7) ?? "",
        dates: sortedRecords.map((record) => record.date),
        holidayNames: uniqueValues(sortedRecords.map((record) => record.holidayName)),
        timeRanges: uniqueValues(sortedRecords.map((record) => `${record.startTime} - ${record.endTime}`)),
        hours: Math.round(sortedRecords.reduce((sum, record) => sum + getHolidayWorkNetHours(record), 0) * 100) / 100,
        compensationSummary,
        notes: uniqueValues(sortedRecords.map((record) => record.notes)),
        records: sortedRecords,
      };
    })
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        (staffById?.get(a.staffId)?.name ?? "").localeCompare(staffById?.get(b.staffId)?.name ?? "", "tr") ||
        a.staffId.localeCompare(b.staffId),
    );
}

function getCurrentYear() {
  return Number(todayIso().slice(0, 4));
}

function getLateTone(minutes: number) {
  if (minutes >= 30) return "severe";
  if (minutes >= 10) return "warning";
  if (minutes > 0) return "soft";
  return "none";
}

function parseStaffImportRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const delimiter = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
      return line.split(delimiter).map((part) => part.trim().replace(/^"|"$/g, ""));
    })
    .filter((parts) => parts[0] && !/^ad\s*soyad$/i.test(parts[0]));
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages.length ? pages : [[]];
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function excelEscape(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadExcelFile(filename: string, sections: Array<{ title: string; rows: Array<Array<string | number>> }>) {
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td { border: 1px solid #9aa8b6; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 11pt; mso-number-format:"\\@"; }
          th { background: #e9eef5; font-weight: bold; }
          h2 { font-family: Arial, sans-serif; }
        </style>
      </head>
      <body>
        ${sections
          .map(
            (section) => `
              <h2>${excelEscape(section.title)}</h2>
              <table>
                ${section.rows
                  .map(
                    (row, index) =>
                      `<tr>${row
                        .map((cell) => `<${index === 0 ? "th" : "td"}>${excelEscape(cell)}</${index === 0 ? "th" : "td"}>`)
                        .join("")}</tr>`,
                  )
                  .join("")}
              </table>
            `,
          )
          .join("")}
      </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getLoginErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "E-posta veya şifre hatalı.";
  }

  if (code.includes("too-many-requests")) {
    return "Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.";
  }

  if (code.includes("network")) {
    return "İnternet bağlantısı kurulamadı.";
  }

  return "Giriş yapılamadı. Bilgileri kontrol edip tekrar deneyin.";
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(!firebaseConfigured);
  const [accessState, setAccessState] = useState<AccessState>(firebaseConfigured ? "idle" : "allowed");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [dayLock, setDayLock] = useState<DayLockRecord | null>(null);
  const [dailySearch, setDailySearch] = useState("");
  const [dailyDepartment, setDailyDepartment] = useState("all");
  const [reportStart, setReportStart] = useState(monthStartIso());
  const [reportEnd, setReportEnd] = useState(todayIso());
  const [reportRows, setReportRows] = useState<AttendanceRecord[]>([]);
  const [reportStaffId, setReportStaffId] = useState("all");
  const [reportDepartment, setReportDepartment] = useState("all");
  const [profileStaffId, setProfileStaffId] = useState("");
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkDepartment, setBulkDepartment] = useState("all");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>("absent");
  const [bulkCheckInTime, setBulkCheckInTime] = useState(settings.shiftStart);
  const [bulkReason, setBulkReason] = useState("Toplu işlem");
  const [bulkTargetDepartment, setBulkTargetDepartment] = useState("");
  const [newStaff, setNewStaff] = useState({
    name: "",
    department: "",
    title: "",
    nationalId: "",
    phone: "",
    socialSecurityCode: "",
    shiftType: "",
    startDate: todayIso(),
    endDate: "",
    showOnSignatureSheet: true,
    fixedStaff: false,
  });
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [printMode, setPrintMode] = useState<PrintMode>("signature");
  const [incapacityReportMonth, setIncapacityReportMonth] = useState(todayIso().slice(0, 7));
  const [holidayReportMonth, setHolidayReportMonth] = useState(todayIso().slice(0, 7));
  const [annualLeaveReportMonth, setAnnualLeaveReportMonth] = useState(todayIso().slice(0, 7));
  const [unpaidLeaveReportMonth, setUnpaidLeaveReportMonth] = useState(todayIso().slice(0, 7));
  const [incapacityReportStaffId, setIncapacityReportStaffId] = useState("all");
  const [annualLeaveReportStaffId, setAnnualLeaveReportStaffId] = useState("all");
  const [unpaidLeaveReportStaffId, setUnpaidLeaveReportStaffId] = useState("all");
  const [excludedFixedHolidayStaffIds, setExcludedFixedHolidayStaffIds] = useState<string[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDepartment, setStaffDepartment] = useState("all");
  const [importText, setImportText] = useState("");
  const [printArchives, setPrintArchives] = useState<PrintArchiveRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [deletedAttendance, setDeletedAttendance] = useState<DeletedAttendanceRecord[]>([]);
  const [incapacityReports, setIncapacityReports] = useState<IncapacityReportRecord[]>([]);
  const [holidayWorkRecords, setHolidayWorkRecords] = useState<HolidayWorkRecord[]>([]);
  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [incapacityForm, setIncapacityForm] = useState({
    id: "",
    staffId: "",
    reportNumber: "",
    startDate: todayIso(),
    endDate: todayIso(),
    reason: "",
    status: "active" as IncapacityStatus,
    notes: "",
  });
  const [holidayWorkForm, setHolidayWorkForm] = useState({
    id: "",
    staffId: "",
    date: todayIso(),
    holidayName: "",
    startTime: HOLIDAY_WORK_DEFAULT_START,
    endTime: HOLIDAY_WORK_DEFAULT_END,
    compensationType: "paid" as HolidayCompensationType,
    notes: "",
  });
  const [annualLeaveForm, setAnnualLeaveForm] = useState<LeaveFormState>({
    id: "",
    staffId: "",
    year: getCurrentYear(),
    leaveType: "annual" as AnnualLeaveType,
    startDate: todayIso(),
    endDate: todayIso(),
    entitlementDays: 14,
    status: "planned" as LeaveStatus,
    notes: "",
  });
  const [unpaidLeaveForm, setUnpaidLeaveForm] = useState<LeaveFormState>({
    id: "",
    staffId: "",
    year: getCurrentYear(),
    leaveType: "unpaid" as AnnualLeaveType,
    startDate: todayIso(),
    endDate: todayIso(),
    entitlementDays: 0,
    status: "planned" as LeaveStatus,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeStaff = useMemo(() => sortStaff(staff.filter((member) => member.active)), [staff]);
  const signatureStaff = useMemo(
    () => activeStaff.filter((member) => member.showOnSignatureSheet !== false),
    [activeStaff],
  );
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const staffRankById = useMemo(
    () => new Map(sortStaff(staff).map((member, index) => [member.id, index])),
    [staff],
  );
  const departments = useMemo(() => getDepartments(staff), [staff]);
  const filteredDailyStaff = useMemo(
    () =>
      activeStaff.filter(
        (member) =>
          matchesStaffSearch(member, dailySearch) &&
          (dailyDepartment === "all" || member.department === dailyDepartment),
      ),
    [activeStaff, dailyDepartment, dailySearch],
  );
  const filteredStaff = useMemo(
    () =>
      sortStaff(staff).filter(
        (member) =>
          matchesStaffSearch(member, staffSearch) &&
          (staffDepartment === "all" || member.department === staffDepartment),
      ),
    [staff, staffDepartment, staffSearch],
  );
  const regularStaffList = useMemo(() => filteredStaff.filter((member) => !member.fixedStaff), [filteredStaff]);
  const fixedStaffList = useMemo(() => filteredStaff.filter((member) => member.fixedStaff), [filteredStaff]);
  const bulkVisibleStaff = useMemo(
    () =>
      sortStaff(staff).filter(
        (member) =>
          matchesStaffSearch(member, bulkSearch) &&
          (bulkDepartment === "all" || member.department === bulkDepartment),
      ),
    [bulkDepartment, bulkSearch, staff],
  );
  const printPages = useMemo(
    () => chunk(signatureStaff, Math.max(1, settings.rowsPerPrintSide)),
    [signatureStaff, settings.rowsPerPrintSide],
  );
  const canUseApp = !firebaseConfigured || (Boolean(admin) && accessState === "allowed");
  const selectedDateIsSunday = isSundayIso(selectedDate);
  const selectedDayLocked = Boolean(dayLock?.locked);
  const selectedStaff = selectedStaffId ? staffById.get(selectedStaffId) ?? null : null;

  const dailyStats = useMemo(() => {
    return activeStaff.reduce(
      (stats, member) => {
        const draft = drafts[member.id] ?? emptyDraft;
        const status = getDraftStatus(draft, settings);
        if (status || draft.checkInTime || draft.lateReason.trim()) stats.processed += 1;
        if (status === "present") stats.present += 1;
        if (status === "late") stats.late += 1;
        if (status === "absent") stats.absent += 1;
        if (status === "excused") stats.excused += 1;
        return stats;
      },
      { processed: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [activeStaff, drafts, settings]);
  const dailyEmptyCount = Math.max(0, activeStaff.length - dailyStats.processed);

  const reportStats = useMemo(() => {
    const filteredRows = reportRows.filter((record) => {
      const member = staffById.get(record.staffId);
      return (
        (reportStaffId === "all" || record.staffId === reportStaffId) &&
        (reportDepartment === "all" || member?.department === reportDepartment)
      );
    });

    return filteredRows.reduce(
      (stats, record) => {
        stats.total += 1;
        stats[record.status] += 1;
        return stats;
      },
      { total: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [reportDepartment, reportRows, reportStaffId, staffById]);

  const filteredReportRows = useMemo(() => {
    return reportRows.filter((record) => {
      const member = staffById.get(record.staffId);
      return (
        (reportStaffId === "all" || record.staffId === reportStaffId) &&
        (reportDepartment === "all" || member?.department === reportDepartment)
      );
    });
  }, [reportDepartment, reportRows, reportStaffId, staffById]);

  const reportSummaryRows = useMemo(() => {
    const summary = new Map<string, ReportSummaryRow>();

    filteredReportRows.forEach((record) => {
      const staffMember = staffById.get(record.staffId);
      if (!staffMember) return;

      const current =
        summary.get(record.staffId) ??
        {
          staff: staffMember,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          lateMinutes: 0,
        };

      current.total += 1;
      current[record.status] += 1;
      current.lateMinutes += getRecordLateMinutes(record, settings);
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [filteredReportRows, settings, staffById, staffRankById]);

  const selectedPersonSummary = reportStaffId === "all" ? null : reportSummaryRows.find((row) => row.staff.id === reportStaffId) ?? null;
  const warningRows = reportSummaryRows.filter((row) => row.absent > 0);
  const profileStaff = (profileStaffId ? staffById.get(profileStaffId) : activeStaff[0]) ?? null;
  const profileRows = useMemo(
    () =>
      profileStaff
        ? reportRows
            .filter((record) => record.staffId === profileStaff.id)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [profileStaff, reportRows],
  );
  const profileStats = useMemo(
    () =>
      profileRows.reduce((current, record) => {
        current.total += 1;
        current[record.status] += 1;
        current.lateMinutes += getRecordLateMinutes(record, settings);
        return current;
      }, createEmptyCounts()),
    [profileRows, settings],
  );
  const selectedStaffInsight = useMemo<StaffInsight | null>(() => {
    if (!selectedStaff) return null;

    const rows = filteredReportRows.filter((record) => record.staffId === selectedStaff.id);
    const counts = rows.reduce((current, record) => {
      current.total += 1;
      current[record.status] += 1;
      current.lateMinutes += getRecordLateMinutes(record, settings);
      return current;
    }, createEmptyCounts());
    const todayDraft = drafts[selectedStaff.id] ?? emptyDraft;
    const todayStatus = getDraftStatus(todayDraft, settings);

    return {
      staff: selectedStaff,
      counts,
      todayDraft,
      todayStatus,
      lastRecord: rows[rows.length - 1] ?? null,
    };
  }, [drafts, filteredReportRows, selectedStaff, settings]);
  const dailyProgress = activeStaff.length ? Math.round((dailyStats.processed / activeStaff.length) * 100) : 0;
  const lastAuditLog = auditLogs[0] ?? null;
  const dailyTrendRows = useMemo(() => {
    const byDate = new Map<string, DailyTrendRow>();

    filteredReportRows.forEach((record) => {
      const current = byDate.get(record.date) ?? { date: record.date, ...createEmptyCounts() };
      current.total += 1;
      current[record.status] += 1;
      current.lateMinutes += getRecordLateMinutes(record, settings);
      byDate.set(record.date, current);
    });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReportRows, settings]);
  const departmentReportRows = useMemo(() => {
    const byDepartment = new Map<string, DepartmentReportRow>();

    filteredReportRows.forEach((record) => {
      const member = staffById.get(record.staffId);
      const department = member?.department?.trim() || "Departmansız";
      const current = byDepartment.get(department) ?? { department, ...createEmptyCounts() };
      current.total += 1;
      current[record.status] += 1;
      current.lateMinutes += getRecordLateMinutes(record, settings);
      byDepartment.set(department, current);
    });

    return Array.from(byDepartment.values()).sort((a, b) => b.total - a.total || a.department.localeCompare(b.department, "tr"));
  }, [filteredReportRows, settings, staffById]);
  const topAbsentRows = useMemo(
    () =>
      [...reportSummaryRows]
        .filter((row) => row.absent > 0)
        .sort((a, b) => b.absent - a.absent || b.late - a.late || b.lateMinutes - a.lateMinutes)
        .slice(0, 5),
    [reportSummaryRows],
  );
  const incapacityRowsForMonth = useMemo(() => {
    const monthStart = `${incapacityReportMonth}-01`;
    const monthEnd = getMonthEndIso(incapacityReportMonth);

    return incapacityReports.filter(
      (record) =>
        record.startDate <= monthEnd &&
        record.endDate >= monthStart &&
        (incapacityReportStaffId === "all" || record.staffId === incapacityReportStaffId),
    );
  }, [incapacityReportMonth, incapacityReportStaffId, incapacityReports]);
  const incapacityStats = useMemo(
    () => ({
      total: incapacityRowsForMonth.length,
      active: incapacityRowsForMonth.filter((record) => record.status === "active").length,
      days: incapacityRowsForMonth.reduce((sum, record) => sum + record.dayCount, 0),
    }),
    [incapacityRowsForMonth],
  );
  const holidayWorkRowsForMonth = useMemo(
    () => holidayWorkRecords.filter((record) => record.date.startsWith(holidayReportMonth)),
    [holidayReportMonth, holidayWorkRecords],
  );
  const holidayWorkStats = useMemo(
    () => ({
      total: holidayWorkRowsForMonth.length,
      hours: Math.round(holidayWorkRowsForMonth.reduce((sum, record) => sum + getHolidayWorkNetHours(record), 0) * 100) / 100,
      leaveCompensation: holidayWorkRowsForMonth.filter((record) => record.compensationType === "leave").length,
      paidCompensation: holidayWorkRowsForMonth.filter((record) => record.compensationType === "paid").length,
    }),
    [holidayWorkRowsForMonth],
  );
  const holidayWorkGroups = useMemo(() => groupHolidayWorkRecords(holidayWorkRowsForMonth, staffById), [holidayWorkRowsForMonth, staffById]);
  const fixedHolidayStaff = useMemo(() => activeStaff.filter((member) => member.fixedStaff), [activeStaff]);
  const holidayWorkYear = Number(holidayWorkForm.date.slice(0, 4)) || getCurrentYear();
  const publicHolidays = useMemo(() => getTurkiyePublicHolidays(holidayWorkYear), [holidayWorkYear]);
  const selectedPublicHoliday = useMemo(
    () => publicHolidays.find((holiday) => holiday.date === holidayWorkForm.date) ?? null,
    [holidayWorkForm.date, publicHolidays],
  );
  const annualLeaveYear = annualLeaveForm.year || getCurrentYear();
  const annualLeaveTrackingRecords = useMemo(
    () => annualLeaveRecords.filter((record) => record.leaveType !== "unpaid"),
    [annualLeaveRecords],
  );
  const annualLeaveRowsForYear = useMemo(
    () => annualLeaveTrackingRecords.filter((record) => record.year === annualLeaveYear),
    [annualLeaveTrackingRecords, annualLeaveYear],
  );
  const annualLeaveSummaries = useMemo(() => {
    const summary = new Map<string, { staff: StaffMember; entitlement: number; used: number; planned: number; remaining: number }>();

    annualLeaveRowsForYear.forEach((record) => {
      const member = staffById.get(record.staffId);
      if (!member) return;

      const current =
        summary.get(record.staffId) ??
        {
          staff: member,
          entitlement: record.entitlementDays || annualLeaveForm.entitlementDays,
          used: 0,
          planned: 0,
          remaining: 0,
        };

      current.entitlement = Math.max(current.entitlement, record.entitlementDays || 0, annualLeaveForm.entitlementDays || 0);
      if (record.leaveType === "annual" && record.status !== "cancelled") {
        if (record.status === "used") current.used += record.usedDays;
        if (record.status === "planned") current.planned += record.usedDays;
      }
      current.remaining = Math.max(0, current.entitlement - current.used - current.planned);
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [annualLeaveForm.entitlementDays, annualLeaveRowsForYear, staffById, staffRankById]);
  const annualLeaveStats = useMemo(
    () => ({
      records: annualLeaveRowsForYear.length,
      used: annualLeaveRowsForYear
        .filter((record) => record.leaveType === "annual" && record.status === "used")
        .reduce((sum, record) => sum + record.usedDays, 0),
      planned: annualLeaveRowsForYear
        .filter((record) => record.leaveType === "annual" && record.status === "planned")
        .reduce((sum, record) => sum + record.usedDays, 0),
      remaining: annualLeaveSummaries.reduce((sum, row) => sum + row.remaining, 0),
    }),
    [annualLeaveRowsForYear, annualLeaveSummaries],
  );
  const annualLeaveRowsForMonth = useMemo(() => {
    const monthStart = `${annualLeaveReportMonth}-01`;
    const monthEnd = getMonthEndIso(annualLeaveReportMonth);
    return annualLeaveTrackingRecords.filter(
      (record) =>
        record.startDate <= monthEnd &&
        record.endDate >= monthStart &&
        (annualLeaveReportStaffId === "all" || record.staffId === annualLeaveReportStaffId),
    );
  }, [annualLeaveReportMonth, annualLeaveReportStaffId, annualLeaveTrackingRecords]);
  const annualLeaveReportStats = useMemo(
    () => ({
      records: annualLeaveRowsForMonth.length,
      used: annualLeaveRowsForMonth.filter((record) => record.status === "used").reduce((sum, record) => sum + record.usedDays, 0),
      planned: annualLeaveRowsForMonth.filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) !== "Bitti").reduce((sum, record) => sum + record.usedDays, 0),
      completed: annualLeaveRowsForMonth.filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) === "Bitti").reduce((sum, record) => sum + record.usedDays, 0),
      cancelled: annualLeaveRowsForMonth.filter((record) => record.status === "cancelled").length,
    }),
    [annualLeaveRowsForMonth],
  );
  const upcomingAnnualLeaves = useMemo(() => {
    const start = todayIso();
    const end = addDaysIso(start, 14);

    return annualLeaveRecords
      .filter((record) => record.status === "planned" && record.startDate >= start && record.startDate <= end)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [annualLeaveRecords]);
  const lowAnnualLeaveRows = useMemo(
    () => annualLeaveSummaries.filter((row) => row.remaining <= 3).sort((a, b) => a.remaining - b.remaining),
    [annualLeaveSummaries],
  );
  const unpaidLeaveYear = unpaidLeaveForm.year || getCurrentYear();
  const unpaidLeaveRecords = useMemo(
    () => annualLeaveRecords.filter((record) => record.leaveType === "unpaid"),
    [annualLeaveRecords],
  );
  const unpaidLeaveRowsForYear = useMemo(
    () => unpaidLeaveRecords.filter((record) => record.year === unpaidLeaveYear),
    [unpaidLeaveRecords, unpaidLeaveYear],
  );
  const unpaidLeaveSummaries = useMemo(() => {
    const summary = new Map<string, { staff: StaffMember; used: number; planned: number; completed: number }>();

    unpaidLeaveRowsForYear.forEach((record) => {
      const member = staffById.get(record.staffId);
      if (!member) return;

      const current =
        summary.get(record.staffId) ??
        {
          staff: member,
          used: 0,
          planned: 0,
          completed: 0,
        };

      if (record.status !== "cancelled") {
        if (record.status === "used") current.used += record.usedDays;
        if (record.status === "planned" && getLeaveDisplayStatus(record) === "Bitti") current.completed += record.usedDays;
        if (record.status === "planned" && getLeaveDisplayStatus(record) !== "Bitti") current.planned += record.usedDays;
      }
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [staffById, staffRankById, unpaidLeaveRowsForYear]);
  const unpaidLeaveStats = useMemo(
    () => ({
      records: unpaidLeaveRowsForYear.length,
      used: unpaidLeaveRowsForYear
        .filter((record) => record.status === "used")
        .reduce((sum, record) => sum + record.usedDays, 0),
      planned: unpaidLeaveRowsForYear
        .filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) !== "Bitti")
        .reduce((sum, record) => sum + record.usedDays, 0),
      completed: unpaidLeaveRowsForYear
        .filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) === "Bitti")
        .reduce((sum, record) => sum + record.usedDays, 0),
    }),
    [unpaidLeaveRowsForYear],
  );
  const unpaidLeaveRowsForMonth = useMemo(() => {
    const monthStart = `${unpaidLeaveReportMonth}-01`;
    const monthEnd = getMonthEndIso(unpaidLeaveReportMonth);
    return unpaidLeaveRecords.filter(
      (record) =>
        record.startDate <= monthEnd &&
        record.endDate >= monthStart &&
        (unpaidLeaveReportStaffId === "all" || record.staffId === unpaidLeaveReportStaffId),
    );
  }, [unpaidLeaveRecords, unpaidLeaveReportMonth, unpaidLeaveReportStaffId]);
  const unpaidLeaveReportStats = useMemo(
    () => ({
      records: unpaidLeaveRowsForMonth.length,
      used: unpaidLeaveRowsForMonth.filter((record) => record.status === "used").reduce((sum, record) => sum + record.usedDays, 0),
      planned: unpaidLeaveRowsForMonth.filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) !== "Bitti").reduce((sum, record) => sum + record.usedDays, 0),
      completed: unpaidLeaveRowsForMonth.filter((record) => record.status === "planned" && getLeaveDisplayStatus(record) === "Bitti").reduce((sum, record) => sum + record.usedDays, 0),
      cancelled: unpaidLeaveRowsForMonth.filter((record) => record.status === "cancelled").length,
    }),
    [unpaidLeaveRowsForMonth],
  );

  async function refreshStaff() {
    setBusy(true);
    try {
      const nextStaff = await loadStaff();
      setStaff(nextStaff);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAttendance(date = selectedDate) {
    setBusy(true);
    try {
      const records = await loadAttendanceByDate(date);
      setDrafts(
        Object.fromEntries(
          records.map((record) => [
            record.staffId,
            {
              checkInTime: record.checkInTime,
              status: record.status,
              lateReason: record.lateReason,
            },
          ]),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrintArchives() {
    try {
      const records = await loadPrintArchives();
      setPrintArchives(records);
    } catch {
      setPrintArchives([]);
    }
  }

  async function refreshDayLock(date = selectedDate) {
    try {
      setDayLock(await loadDayLock(date));
    } catch {
      setDayLock(null);
    }
  }

  async function refreshAuditLogs() {
    try {
      setAuditLogs(await loadAuditLogs());
    } catch {
      setAuditLogs([]);
    }
  }

  async function refreshDeletedAttendance() {
    try {
      setDeletedAttendance(await loadDeletedAttendance());
    } catch {
      setDeletedAttendance([]);
    }
  }

  async function refreshHrRecords() {
    try {
      const [reports, holidayWork, annualLeave] = await Promise.all([
        loadIncapacityReports(),
        loadHolidayWorkRecords(),
        loadAnnualLeaveRecords(),
      ]);
      setIncapacityReports(reports);
      setHolidayWorkRecords(holidayWork);
      setAnnualLeaveRecords(annualLeave);
    } catch {
      setIncapacityReports([]);
      setHolidayWorkRecords([]);
      setAnnualLeaveRecords([]);
    }
  }

  useEffect(() => {
    if (!firebaseConfigured) return;

    return observeAdminAuth((user) => {
      setAdmin(user);
      setAuthChecked(true);
      setLoginError("");

      if (!user) {
        setAccessState("idle");
        setStaff([]);
        setDrafts({});
        setReportRows([]);
        setDayLock(null);
        setAuditLogs([]);
        return;
      }

      setAccessState("checking");
      void hasAdminAccess()
        .then((allowed) => {
          setAccessState(allowed ? "allowed" : "denied");
          if (!allowed) {
            setStaff([]);
            setDrafts({});
            setReportRows([]);
            setDayLock(null);
            setAuditLogs([]);
          }
        })
        .catch(() => {
          setAccessState("denied");
          setStaff([]);
          setDrafts({});
          setReportRows([]);
          setDayLock(null);
          setAuditLogs([]);
          setDeletedAttendance([]);
          setIncapacityReports([]);
          setHolidayWorkRecords([]);
          setAnnualLeaveRecords([]);
        });
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshStaff();
  }, [canUseApp, admin?.uid]);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshAttendance(selectedDate);
    void refreshDayLock(selectedDate);
  }, [canUseApp, admin?.uid, selectedDate]);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshPrintArchives();
    void refreshAuditLogs();
    void refreshDeletedAttendance();
    void refreshHrRecords();
  }, [canUseApp, admin?.uid]);

  useEffect(() => {
    if ((!profileStaffId || !staffById.has(profileStaffId)) && activeStaff.length) {
      setProfileStaffId(activeStaff[0].id);
    }
  }, [activeStaff, profileStaffId, staffById]);

  useEffect(() => {
    setBulkSelectedIds((previous) => previous.filter((id) => staffById.has(id)));
  }, [staffById]);

  useEffect(() => {
    if (incapacityReportStaffId !== "all" && !staffById.has(incapacityReportStaffId)) {
      setIncapacityReportStaffId("all");
    }
    if (annualLeaveReportStaffId !== "all" && !staffById.has(annualLeaveReportStaffId)) {
      setAnnualLeaveReportStaffId("all");
    }
    if (unpaidLeaveReportStaffId !== "all" && !staffById.has(unpaidLeaveReportStaffId)) {
      setUnpaidLeaveReportStaffId("all");
    }
  }, [annualLeaveReportStaffId, incapacityReportStaffId, staffById, unpaidLeaveReportStaffId]);

  useEffect(() => {
    if (!activeStaff.length) return;
    const fallbackId = activeStaff[0].id;
    setIncapacityForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setHolidayWorkForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setAnnualLeaveForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setUnpaidLeaveForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
  }, [activeStaff, staffById]);

  function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      await signInAdmin(loginEmail.trim(), loginPassword);
      setLoginPassword("");
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutAdmin();
      setActiveTab("daily");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(staffId: string, patch: Partial<DraftRecord>) {
    setDrafts((previous) => {
      const current = previous[staffId] ?? emptyDraft;
      const next: DraftRecord = { ...current, ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, "checkInTime")) {
        if (next.checkInTime) {
          next.status = computeStatusFromTime(next.checkInTime, settings);
        } else if (next.status === "present" || next.status === "late") {
          next.status = "";
        }
      }

      return { ...previous, [staffId]: next };
    });
  }

  async function handleMarkEmptyAbsent() {
    if (selectedDayLocked) {
      setMessage("Bu gün kilitli. Kayıt değiştirmek için kilidi açın.");
      return;
    }

    if (selectedDateIsSunday) {
      setMessage("Pazar günleri resmi tatil olarak kabul edilir. Boş kayıtlar Gelmedi yapılmadı.");
      return;
    }

    const emptyMembers = activeStaff.filter((member) => {
      const draft = drafts[member.id] ?? emptyDraft;
      return !draft.status && !draft.checkInTime && !draft.lateReason.trim();
    });

    if (!emptyMembers.length) {
      setMessage("Boş kayıt bulunamadı.");
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        emptyMembers.map((member) =>
          saveAttendanceRecord({
            id: makeAttendanceId(selectedDate, member.id),
            staffId: member.id,
            date: selectedDate,
            checkInTime: "",
            status: "absent",
            lateReason: "Gün sonu otomatik gelmedi",
          }),
        ),
      );
      await saveAuditLog("Boş kayıtlar gelmedi yapıldı", `${selectedDate} - ${emptyMembers.length} kayıt`);
      setMessage(`${emptyMembers.length} boş kayıt Gelmedi olarak kaydedildi.`);
      await refreshAttendance(selectedDate);
      await refreshAuditLogs();
    } catch {
      setMessage("Boş kayıtlar güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDay() {
    if (selectedDayLocked) {
      setMessage("Bu gün kilitli. Kayıt değiştirmek için kilidi açın.");
      return;
    }

    setBusy(true);
    try {
      const records = activeStaff
        .map((member) => {
          const draft = drafts[member.id] ?? emptyDraft;
          if (!draft.status && !draft.checkInTime && !draft.lateReason.trim()) return null;

          const status =
            draft.checkInTime && draft.status !== "absent" && draft.status !== "excused"
              ? computeStatusFromTime(draft.checkInTime, settings)
              : draft.status || (draft.lateReason.trim() ? "late" : "");

          if (!status) return null;

          return {
            id: makeAttendanceId(selectedDate, member.id),
            staffId: member.id,
            date: selectedDate,
            checkInTime: draft.checkInTime,
            status,
            lateReason: draft.lateReason.trim(),
          } satisfies AttendanceRecord;
        })
        .filter((record): record is AttendanceRecord => Boolean(record));

      await Promise.all(records.map((record) => saveAttendanceRecord(record)));
      await saveAuditLog("Günlük kayıt kaydedildi", `${selectedDate} - ${records.length} kayıt`);
      setMessage(`${formatDateTr(selectedDate)} için ${records.length} kayıt kaydedildi.`);
      await refreshAttendance(selectedDate);
      await refreshAuditLogs();
    } catch {
      setMessage("Kayıt kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearRecord(staffId: string) {
    if (selectedDayLocked) {
      setMessage("Bu gün kilitli. Kayıt değiştirmek için kilidi açın.");
      return;
    }

    setBusy(true);
    try {
      const draft = drafts[staffId] ?? emptyDraft;
      const status = getDraftStatus(draft, settings);
      const staffName = staffById.get(staffId)?.name ?? staffId;

      if (status || draft.checkInTime || draft.lateReason.trim()) {
        const record: AttendanceRecord = {
          id: makeAttendanceId(selectedDate, staffId),
          staffId,
          date: selectedDate,
          checkInTime: draft.checkInTime,
          status: status || "late",
          lateReason: draft.lateReason.trim(),
        };
        await saveDeletedAttendance({
          id: `${record.id}_${Date.now()}`,
          record,
          staffName,
          deletedAt: new Date().toISOString(),
          deletedBy: admin?.email ?? null,
        });
      }

      await deleteAttendanceRecord(makeAttendanceId(selectedDate, staffId));
      await saveAuditLog("Günlük kayıt temizlendi", `${selectedDate} - ${staffName}`);
      setDrafts((previous) => ({ ...previous, [staffId]: emptyDraft }));
      await refreshAuditLogs();
      await refreshDeletedAttendance();
      setMessage("Kayıt temizlendi. Ayarlar > Silinen Kayıtlar bölümünden geri yükleyebilirsiniz.");
    } catch {
      setMessage("Kayıt temizlenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreDeletedAttendance(record: DeletedAttendanceRecord) {
    setBusy(true);
    try {
      await saveAttendanceRecord(record.record);
      await deleteDeletedAttendance(record.id);
      await saveAuditLog("Silinen kayıt geri yüklendi", `${record.record.date} - ${record.staffName}`);
      await refreshDeletedAttendance();
      await refreshAuditLogs();
      if (record.record.date === selectedDate) await refreshAttendance(selectedDate);
      setMessage(`${record.staffName} kaydı geri yüklendi.`);
    } catch {
      setMessage("Silinen kayıt geri yüklenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDayLock() {
    const nextLocked = !selectedDayLocked;
    const record: DayLockRecord = {
      id: selectedDate,
      date: selectedDate,
      locked: nextLocked,
      updatedAt: new Date().toISOString(),
      updatedBy: admin?.email ?? null,
    };

    setBusy(true);
    try {
      await saveDayLock(record);
      await saveAuditLog(nextLocked ? "Gün kilitlendi" : "Gün kilidi açıldı", selectedDate);
      await refreshDayLock(selectedDate);
      await refreshAuditLogs();
      setMessage(nextLocked ? `${formatDateTr(selectedDate)} kilitlendi.` : `${formatDateTr(selectedDate)} kilidi açıldı.`);
    } catch {
      setMessage("Gün kilidi güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStaff(event: FormEvent) {
    event.preventDefault();
    if (!newStaff.name.trim()) return;

    const member: StaffMember = {
      id: crypto.randomUUID(),
      order: staff.length ? Math.max(...staff.map((item) => item.order)) + 1 : 1,
      name: newStaff.name.trim(),
      department: newStaff.department.trim(),
      title: newStaff.title.trim(),
      nationalId: newStaff.nationalId.trim(),
      phone: newStaff.phone.trim(),
      socialSecurityCode: newStaff.socialSecurityCode.trim(),
      shiftType: newStaff.shiftType.trim(),
      active: true,
      showOnSignatureSheet: newStaff.showOnSignatureSheet,
      fixedStaff: newStaff.fixedStaff,
      startDate: newStaff.startDate,
      endDate: newStaff.endDate,
    };

    setBusy(true);
    try {
      await saveStaffMember(member);
      await saveAuditLog("Personel eklendi", member.name);
      setNewStaff({
        name: "",
        department: "",
        title: "",
        nationalId: "",
        phone: "",
        socialSecurityCode: "",
        shiftType: "",
        startDate: todayIso(),
        endDate: "",
        showOnSignatureSheet: true,
        fixedStaff: false,
      });
      await refreshStaff();
      await refreshAuditLogs();
    } catch {
      setMessage("Personel eklenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleStartEditStaff(member: StaffMember) {
    setEditingStaff({ ...member });
  }

  async function handleUpdateStaff(event: FormEvent) {
    event.preventDefault();
    if (!editingStaff || !editingStaff.name.trim()) return;

    setBusy(true);
    try {
      await saveStaffMember({
        ...editingStaff,
        name: editingStaff.name.trim(),
        department: editingStaff.department.trim(),
        title: editingStaff.title.trim(),
        nationalId: editingStaff.nationalId?.trim() ?? "",
        phone: editingStaff.phone?.trim() ?? "",
        socialSecurityCode: editingStaff.socialSecurityCode?.trim() ?? "",
        shiftType: editingStaff.shiftType?.trim() ?? "",
        showOnSignatureSheet: editingStaff.showOnSignatureSheet !== false,
        fixedStaff: Boolean(editingStaff.fixedStaff),
        startDate: editingStaff.startDate,
        endDate: editingStaff.endDate,
      });
      await saveAuditLog("Personel güncellendi", editingStaff.name.trim());
      setEditingStaff(null);
      await refreshStaff();
      await refreshAuditLogs();
      setMessage("Personel bilgileri güncellendi.");
    } catch {
      setMessage("Personel güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportStaff() {
    const rows = parseStaffImportRows(importText);

    if (!rows.length) return;

    const startOrder = staff.length ? Math.max(...staff.map((item) => item.order)) + 1 : 1;
    const members = rows.map((row, index) => {
      const [
        name,
        department = "",
        title = "",
        startDate = "",
        endDate = "",
        showOnSignatureSheet = "evet",
        fixedStaff = "hayir",
        nationalId = "",
        phone = "",
        socialSecurityCode = "",
        shiftType = "",
      ] = row;
      return {
        id: crypto.randomUUID(),
        order: startOrder + index,
        name,
        department,
        title,
        active: true,
        showOnSignatureSheet: !["hayır", "hayir", "false", "0", "no"].includes(showOnSignatureSheet.toLocaleLowerCase("tr-TR")),
        fixedStaff: ["evet", "true", "1", "yes", "sabit"].includes(fixedStaff.toLocaleLowerCase("tr-TR")),
        startDate,
        endDate,
        nationalId,
        phone,
        socialSecurityCode,
        shiftType,
      } satisfies StaffMember;
    });

    setBusy(true);
    try {
      await saveStaffMembers(members);
      await saveAuditLog("Toplu personel aktarıldı", `${members.length} personel`);
      setImportText("");
      await refreshStaff();
      await refreshAuditLogs();
      setMessage(`${members.length} personel eklendi.`);
    } catch {
      setMessage("Toplu personel aktarılamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportStaffFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setMessage(`${file.name} dosyası yüklendi. Aktar butonuyla listeye ekleyebilirsiniz.`);
  }

  async function handleSeedStaff() {
    const members = createSampleStaff(85, staff.length);

    setBusy(true);
    try {
      await saveStaffMembers(members);
      await saveAuditLog("Personel şablonu oluşturuldu", `${members.length} personel`);
      await refreshStaff();
      await refreshAuditLogs();
      setMessage("85 satırlık personel şablonu oluşturuldu.");
    } catch {
      setMessage("Personel şablonu oluşturulamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStaff(member: StaffMember) {
    setBusy(true);
    try {
      await saveStaffMember({ ...member, active: !member.active });
      await saveAuditLog(member.active ? "Personel pasife alındı" : "Personel aktife alındı", member.name);
      await refreshStaff();
      await refreshAuditLogs();
    } catch {
      setMessage("Personel durumu güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStaff(member: StaffMember) {
    if (!window.confirm(`${member.name} silinsin mi?`)) return;

    setBusy(true);
    try {
      await deleteStaffMember(member.id);
      await saveAuditLog("Personel silindi", member.name);
      await refreshStaff();
      await refreshAuditLogs();
    } catch {
      setMessage("Personel silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function toggleBulkStaff(staffId: string) {
    setBulkSelectedIds((previous) =>
      previous.includes(staffId) ? previous.filter((id) => id !== staffId) : [...previous, staffId],
    );
  }

  function toggleBulkVisibleStaff() {
    const visibleIds = bulkVisibleStaff.map((member) => member.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => bulkSelectedIds.includes(id));

    setBulkSelectedIds((previous) => {
      if (allSelected) return previous.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...previous, ...visibleIds]));
    });
  }

  async function handleBulkAttendance() {
    const selectedMembers = bulkSelectedIds.map((id) => staffById.get(id)).filter((member): member is StaffMember => Boolean(member));

    if (!selectedMembers.length) {
      setMessage("Toplu işlem için personel seçin.");
      return;
    }

    if (selectedDayLocked) {
      setMessage("Bu gün kilitli. Toplu işlem için kilidi açın.");
      return;
    }

    if (selectedDateIsSunday && bulkStatus === "absent") {
      setMessage("Pazar günü resmi tatil. Toplu Gelmedi işlemi yapılmadı.");
      return;
    }

    const checkInTime = bulkStatus === "present" || bulkStatus === "late" ? bulkCheckInTime || settings.shiftStart : "";
    const records = selectedMembers.map((member) => ({
      id: makeAttendanceId(selectedDate, member.id),
      staffId: member.id,
      date: selectedDate,
      checkInTime,
      status: bulkStatus,
      lateReason: bulkReason.trim(),
    } satisfies AttendanceRecord));

    setBusy(true);
    try {
      await Promise.all(records.map((record) => saveAttendanceRecord(record)));
      await saveAuditLog("Toplu günlük işlem", `${selectedDate} - ${records.length} kayıt - ${statusLabels[bulkStatus]}`);
      await refreshAttendance(selectedDate);
      await refreshAuditLogs();
      setMessage(`${records.length} personel için ${statusLabels[bulkStatus]} kaydı işlendi.`);
    } catch {
      setMessage("Toplu günlük işlem kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDepartmentUpdate() {
    const nextDepartment = bulkTargetDepartment.trim();
    const selectedMembers = bulkSelectedIds.map((id) => staffById.get(id)).filter((member): member is StaffMember => Boolean(member));

    if (!selectedMembers.length || !nextDepartment) {
      setMessage("Departman değiştirmek için personel ve yeni departman seçin.");
      return;
    }

    setBusy(true);
    try {
      await saveStaffMembers(selectedMembers.map((member) => ({ ...member, department: nextDepartment })));
      await saveAuditLog("Toplu departman güncellendi", `${selectedMembers.length} personel - ${nextDepartment}`);
      await refreshStaff();
      await refreshAuditLogs();
      setMessage(`${selectedMembers.length} personelin departmanı güncellendi.`);
    } catch {
      setMessage("Toplu departman işlemi yapılamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkActiveUpdate(active: boolean) {
    const selectedMembers = bulkSelectedIds.map((id) => staffById.get(id)).filter((member): member is StaffMember => Boolean(member));

    if (!selectedMembers.length) {
      setMessage("Durum değiştirmek için personel seçin.");
      return;
    }

    setBusy(true);
    try {
      await saveStaffMembers(selectedMembers.map((member) => ({ ...member, active })));
      await saveAuditLog(active ? "Toplu aktife alındı" : "Toplu pasife alındı", `${selectedMembers.length} personel`);
      await refreshStaff();
      await refreshAuditLogs();
      setMessage(`${selectedMembers.length} personel ${active ? "aktife alındı" : "pasife alındı"}.`);
    } catch {
      setMessage("Toplu personel durumu güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function resetIncapacityForm() {
    setIncapacityForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      reportNumber: "",
      startDate: todayIso(),
      endDate: todayIso(),
      reason: "",
      status: "active",
      notes: "",
    });
  }

  function handleIncapacityStartDateChange(date: string) {
    setIncapacityReportMonth(date.slice(0, 7));
    setIncapacityForm((previous) => ({ ...previous, startDate: date }));
  }

  async function handleSaveIncapacityReport(event: FormEvent) {
    event.preventDefault();
    const staffId = incapacityForm.staffId || activeStaff[0]?.id || "";
    if (!staffId) {
      setMessage("İş göremezlik raporu için personel seçin.");
      return;
    }

    const existing = incapacityReports.find((record) => record.id === incapacityForm.id);
    const record: IncapacityReportRecord = {
      id: incapacityForm.id || crypto.randomUUID(),
      staffId,
      reportNumber: incapacityForm.reportNumber.trim(),
      startDate: incapacityForm.startDate,
      endDate: incapacityForm.endDate,
      dayCount: countCalendarDays(incapacityForm.startDate, incapacityForm.endDate),
      reason: incapacityForm.reason.trim(),
      status: incapacityForm.status,
      notes: incapacityForm.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!record.dayCount) {
      setMessage("İş göremezlik raporu için geçerli tarih aralığı girin.");
      return;
    }

    setBusy(true);
    try {
      await saveIncapacityReport(record);
      await saveAuditLog(incapacityForm.id ? "İş göremezlik raporu güncellendi" : "İş göremezlik raporu eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      resetIncapacityForm();
      setMessage("İş göremezlik raporu kaydedildi.");
    } catch {
      setMessage("İş göremezlik raporu kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditIncapacityReport(record: IncapacityReportRecord) {
    setIncapacityForm({
      id: record.id,
      staffId: record.staffId,
      reportNumber: record.reportNumber ?? "",
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
      status: record.status,
      notes: record.notes,
    });
  }

  async function handleDeleteIncapacityReport(record: IncapacityReportRecord) {
    if (!window.confirm("İş göremezlik raporu silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteIncapacityReport(record.id);
      await saveAuditLog("İş göremezlik raporu silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("İş göremezlik raporu silindi.");
    } catch {
      setMessage("İş göremezlik raporu silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function resetHolidayWorkForm() {
    const today = todayIso();
    const publicHoliday = getTurkiyePublicHolidays(Number(today.slice(0, 4)) || getCurrentYear()).find((holiday) => holiday.date === today);
    setHolidayWorkForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      date: today,
      holidayName: publicHoliday?.name ?? "",
      startTime: HOLIDAY_WORK_DEFAULT_START,
      endTime: HOLIDAY_WORK_DEFAULT_END,
      compensationType: "paid",
      notes: "",
    });
  }

  function handleHolidayWorkDateChange(date: string) {
    const publicHoliday = getTurkiyePublicHolidays(Number(date.slice(0, 4)) || getCurrentYear()).find((holiday) => holiday.date === date);
    setHolidayReportMonth(date.slice(0, 7));
    setHolidayWorkForm((previous) => ({
      ...previous,
      date,
      holidayName: publicHoliday?.name ?? "",
    }));
  }

  function handlePublicHolidaySelect(date: string) {
    const publicHoliday = publicHolidays.find((holiday) => holiday.date === date);
    if (!publicHoliday) return;

    setHolidayReportMonth(publicHoliday.date.slice(0, 7));
    setHolidayWorkForm((previous) => ({
      ...previous,
      date: publicHoliday.date,
      holidayName: publicHoliday.name,
    }));
  }

  async function handleSaveHolidayWork(event: FormEvent) {
    event.preventDefault();
    const staffId = holidayWorkForm.staffId || activeStaff[0]?.id || "";
    if (!staffId) {
      setMessage("Resmi tatil çalışması için personel seçin.");
      return;
    }

    const existing = holidayWorkRecords.find((record) => record.id === holidayWorkForm.id);
    const record: HolidayWorkRecord = {
      id: holidayWorkForm.id || crypto.randomUUID(),
      staffId,
      date: holidayWorkForm.date,
      holidayName: holidayWorkForm.holidayName.trim() || "Resmi Tatil",
      startTime: holidayWorkForm.startTime,
      endTime: holidayWorkForm.endTime,
      hours: calculateWorkHours(holidayWorkForm.startTime, holidayWorkForm.endTime),
      compensationType: holidayWorkForm.compensationType,
      notes: holidayWorkForm.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!record.hours) {
      setMessage("Resmi tatil çalışması için geçerli giriş ve çıkış saati girin.");
      return;
    }

    setBusy(true);
    try {
      await saveHolidayWorkRecord(record);
      await saveAuditLog(holidayWorkForm.id ? "Resmi tatil çalışması güncellendi" : "Resmi tatil çalışması eklendi", `${record.date} - ${staffById.get(staffId)?.name ?? staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      resetHolidayWorkForm();
      setMessage("Resmi tatil çalışması kaydedildi.");
    } catch {
      setMessage("Resmi tatil çalışması kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkAddFixedHolidayWork() {
    if (!fixedHolidayStaff.length) {
      setMessage("Toplu ekleme için sabit personel bulunmuyor.");
      return;
    }

    const selectedStaff = fixedHolidayStaff.filter((member) => !excludedFixedHolidayStaffIds.includes(member.id));
    if (!selectedStaff.length) {
      setMessage("Toplu ekleme için en az bir sabit personel bırakın.");
      return;
    }

    const hours = calculateWorkHours(holidayWorkForm.startTime, holidayWorkForm.endTime);
    if (!hours) {
      setMessage("Toplu resmi tatil çalışması için geçerli giriş ve çıkış saati girin.");
      return;
    }

    const existingKeys = new Set(holidayWorkRecords.map((record) => `${record.date}_${record.staffId}`));
    const now = new Date().toISOString();
    const records: HolidayWorkRecord[] = selectedStaff
      .filter((member) => !existingKeys.has(`${holidayWorkForm.date}_${member.id}`))
      .map((member) => ({
        id: `${holidayWorkForm.date}_${member.id}_holiday-work`,
        staffId: member.id,
        date: holidayWorkForm.date,
        holidayName: holidayWorkForm.holidayName.trim() || selectedPublicHoliday?.name || "Resmi Tatil",
        startTime: holidayWorkForm.startTime,
        endTime: holidayWorkForm.endTime,
        hours,
        compensationType: holidayWorkForm.compensationType,
        notes: holidayWorkForm.notes.trim(),
        createdAt: now,
        updatedAt: now,
      }));

    if (!records.length) {
      setMessage("Seçili tarih için sabit personeller zaten eklenmiş.");
      return;
    }

    setBusy(true);
    try {
      await Promise.all(records.map((record) => saveHolidayWorkRecord(record)));
      await saveAuditLog("Sabit personel resmi tatil toplu eklendi", `${holidayWorkForm.date} - ${records.length} personel`);
      await refreshHrRecords();
      await refreshAuditLogs();
      setExcludedFixedHolidayStaffIds([]);
      setHolidayReportMonth(holidayWorkForm.date.slice(0, 7));
      setMessage(`${records.length} sabit personel resmi tatil çalışmasına eklendi.`);
    } catch {
      setMessage("Sabit personeller toplu eklenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditHolidayWork(record: HolidayWorkRecord) {
    setHolidayWorkForm({
      id: record.id,
      staffId: record.staffId,
      date: record.date,
      holidayName: record.holidayName,
      startTime: record.startTime,
      endTime: record.endTime,
      compensationType: record.compensationType,
      notes: record.notes,
    });
  }

  async function handleDeleteHolidayWork(record: HolidayWorkRecord) {
    if (!window.confirm("Resmi tatil çalışma kaydı silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteHolidayWorkRecord(record.id);
      await saveAuditLog("Resmi tatil çalışması silindi", `${record.date} - ${staffById.get(record.staffId)?.name ?? record.staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("Resmi tatil çalışma kaydı silindi.");
    } catch {
      setMessage("Resmi tatil çalışma kaydı silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function resetAnnualLeaveForm() {
    setAnnualLeaveForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      year: getCurrentYear(),
      leaveType: "annual",
      startDate: todayIso(),
      endDate: todayIso(),
      entitlementDays: 14,
      status: "planned",
      notes: "",
    });
  }

  function resetUnpaidLeaveForm() {
    setUnpaidLeaveForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      year: getCurrentYear(),
      leaveType: "unpaid",
      startDate: todayIso(),
      endDate: todayIso(),
      entitlementDays: 0,
      status: "planned",
      notes: "",
    });
  }

  async function handleSaveAnnualLeave(event: FormEvent) {
    event.preventDefault();
    const staffId = annualLeaveForm.staffId || activeStaff[0]?.id || "";
    if (!staffId) {
      setMessage("Yıllık izin kaydı için personel seçin.");
      return;
    }

    const existing = annualLeaveRecords.find((record) => record.id === annualLeaveForm.id);
    const usedDays = countLeaveDays(annualLeaveForm.startDate, annualLeaveForm.endDate);
    const record: AnnualLeaveRecord = {
      id: annualLeaveForm.id || crypto.randomUUID(),
      staffId,
      year: Number(annualLeaveForm.year) || getCurrentYear(),
      leaveType: annualLeaveForm.leaveType,
      startDate: annualLeaveForm.startDate,
      endDate: annualLeaveForm.endDate,
      usedDays,
      entitlementDays: Number(annualLeaveForm.entitlementDays) || 0,
      status: annualLeaveForm.status,
      notes: annualLeaveForm.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!record.usedDays) {
      setMessage("Yıllık izin kaydı için geçerli tarih aralığı girin.");
      return;
    }

    setBusy(true);
    try {
      await saveAnnualLeaveRecord(record);
      await saveAuditLog(annualLeaveForm.id ? "Yıllık izin kaydı güncellendi" : "Yıllık izin kaydı eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      resetAnnualLeaveForm();
      setMessage("Yıllık izin kaydı kaydedildi.");
    } catch {
      setMessage("Yıllık izin kaydı kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditAnnualLeave(record: AnnualLeaveRecord) {
    setAnnualLeaveForm({
      id: record.id,
      staffId: record.staffId,
      year: record.year,
      leaveType: record.leaveType,
      startDate: record.startDate,
      endDate: record.endDate,
      entitlementDays: record.entitlementDays,
      status: record.status,
      notes: record.notes,
    });
  }

  async function handleDeleteAnnualLeave(record: AnnualLeaveRecord) {
    if (!window.confirm("Yıllık izin kaydı silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteAnnualLeaveRecord(record.id);
      await saveAuditLog("Yıllık izin kaydı silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("Yıllık izin kaydı silindi.");
    } catch {
      setMessage("Yıllık izin kaydı silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveUnpaidLeave(event: FormEvent) {
    event.preventDefault();
    const staffId = unpaidLeaveForm.staffId || activeStaff[0]?.id || "";
    if (!staffId) {
      setMessage("Ücretsiz izin kaydı için personel seçin.");
      return;
    }

    const existing = annualLeaveRecords.find((record) => record.id === unpaidLeaveForm.id);
    const usedDays = countLeaveDays(unpaidLeaveForm.startDate, unpaidLeaveForm.endDate);
    const record: AnnualLeaveRecord = {
      id: unpaidLeaveForm.id || crypto.randomUUID(),
      staffId,
      year: Number(unpaidLeaveForm.year) || getCurrentYear(),
      leaveType: "unpaid",
      startDate: unpaidLeaveForm.startDate,
      endDate: unpaidLeaveForm.endDate,
      usedDays,
      entitlementDays: Number(unpaidLeaveForm.entitlementDays) || 0,
      status: unpaidLeaveForm.status,
      notes: unpaidLeaveForm.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!record.usedDays) {
      setMessage("Ücretsiz izin kaydı için geçerli tarih aralığı girin.");
      return;
    }

    setBusy(true);
    try {
      await saveAnnualLeaveRecord(record);
      await saveAuditLog(unpaidLeaveForm.id ? "Ücretsiz izin kaydı güncellendi" : "Ücretsiz izin kaydı eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      resetUnpaidLeaveForm();
      setMessage("Ücretsiz izin kaydı kaydedildi.");
    } catch {
      setMessage("Ücretsiz izin kaydı kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditUnpaidLeave(record: AnnualLeaveRecord) {
    setUnpaidLeaveForm({
      id: record.id,
      staffId: record.staffId,
      year: record.year,
      leaveType: "unpaid",
      startDate: record.startDate,
      endDate: record.endDate,
      entitlementDays: record.entitlementDays,
      status: record.status,
      notes: record.notes,
    });
  }

  async function handleDeleteUnpaidLeave(record: AnnualLeaveRecord) {
    if (!window.confirm("Ücretsiz izin kaydı silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteAnnualLeaveRecord(record.id);
      await saveAuditLog("Ücretsiz izin kaydı silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("Ücretsiz izin kaydı silindi.");
    } catch {
      setMessage("Ücretsiz izin kaydı silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadLeavePdf(form: LeaveFormState, title: string, filenamePart: string) {
    const staffId = form.staffId || activeStaff[0]?.id || "";
    const staffMember = staffById.get(staffId);
    if (!staffMember) {
      setMessage("PDF için personel seçin.");
      return;
    }

    const usedDays = countLeaveDays(form.startDate, form.endDate);
    if (!usedDays) {
      setMessage("PDF için geçerli tarih aralığı girin.");
      return;
    }

    const pdfMakeModule = await import("pdfmake/build/pdfmake");
    const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
    const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
    const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as any;
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? pdfFonts;

    const startDate = formatDateDotTr(form.startDate);
    const endDate = formatDateDotTr(form.endDate);
    const returnDate = formatDateDotTr(getNextCalendarDateIso(form.endDate));
    const borderColor = "#111111";
    const titleCell = (text: string) => ({ text, bold: true, colSpan: 2, margin: [0, 2, 0, 2] });
    const labelCell = (text: string) => ({ text, margin: [0, 1, 0, 1] });
    const valueCell = (text: string | number) => ({ text: String(text ?? ""), bold: true, margin: [0, 1, 0, 1] });

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [29, 34, 29, 34],
      defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.1 },
      styles: {
        title: { fontSize: 13, bold: true, alignment: "center", margin: [0, 0, 0, 28] },
        boldLine: { fontSize: 10.5, bold: true },
        note: { fontSize: 10.2, bold: true },
      },
      content: [
        { text: title, style: "title" },
        {
          table: {
            widths: ["49.5%", "50.5%"],
            body: [
              [titleCell("İzin İsteminde Bulunan Personelin"), ""],
              [labelCell("Adı ve Soyadı"), valueCell(staffMember.name)],
              [labelCell("T.C Kimlik No"), valueCell(staffMember.nationalId ?? "")],
              [labelCell("Unvanı"), valueCell(staffMember.title)],
            ],
          },
          layout: annualLeavePdfLayout(borderColor),
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ["49.5%", "50.5%"],
            body: [
              [titleCell("Kullanılacak İzin"), ""],
              [labelCell("Süresi (Gün)"), valueCell(usedDays)],
              [labelCell("Başlangıç Tarihi"), valueCell(startDate)],
              [labelCell("Bitiş Tarihi (Tatile Rastlasa Bile Bitiş Günü Yazılır)"), valueCell(endDate)],
              [labelCell("Göreve Başlayacağı Tarih"), valueCell(returnDate)],
              [{ text: "Talep Eden Çalışanın İmzası", bold: true, margin: [0, 13, 0, 14] }, ""],
            ],
          },
          layout: annualLeavePdfLayout(borderColor),
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ["*"],
            body: [
              [{ text: "PERSONELİN İZİN KULLANDIĞINA DAİR ONAYI", bold: true, alignment: "center", margin: [0, 2, 0, 13] }],
              [
                {
                  stack: [
                    { text: `${startDate} ve ${endDate} tarihinde iznimi kullandım. ${returnDate} tarihinde görevime başladım.`, style: "boldLine", margin: [0, 11, 0, 17] },
                    {
                      columns: [
                        { text: "Ad Soyad:", bold: true, width: "42%" },
                        { text: "İmza:", bold: true, width: "58%" },
                      ],
                    },
                  ],
                  minHeight: 70,
                },
              ],
            ],
          },
          layout: annualLeavePdfLayout(borderColor),
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    { text: `İlgili Personel ${endDate} tarihinde izinden dönmüş ve ${returnDate} tarihinde görevine başlamıştır.`, margin: [0, 45, 0, 2] },
                    { text: "YETKİLİ ONAY", bold: true },
                  ],
                  minHeight: 74,
                },
              ],
            ],
          },
          layout: annualLeavePdfLayout(borderColor),
          margin: [0, 0, 0, 25],
        },
        { text: "* Yılı içerisinde kullanılmayan izin süresi otomatik olarak ertesi yıla devreder.", style: "note", margin: [0, 0, 0, 10] },
        {
          ol: [
            { text: "Personel izne giderken izin talep kısmını doldurur amirinden onay alır. Geldiğinde döndüğüne dair kısmı imzalayıp iznini onaylar.", bold: true },
            { text: "Amiri İnsan Kaynaklarına yada muhasebeye ilgili ay içerisinde teslim eder", bold: true },
            { text: "Farklı tarihleri kapsayan her izin dönemi için ayrı ayrı izin formu kullanılması gerekir.", bold: true },
          ],
          margin: [13, 0, 0, 0],
        },
      ],
    };

    pdfMake.createPdf(docDefinition).download(`${safeFilename(staffMember.name || "personel")}-${filenamePart}-${form.startDate}.pdf`);
  }

  async function handleDownloadAnnualLeavePdf() {
    await handleDownloadLeavePdf(annualLeaveForm, "YILLIK İZİN FORMU", "yillik-izin-formu");
  }

  async function handleDownloadUnpaidLeavePdf() {
    const staffId = unpaidLeaveForm.staffId || activeStaff[0]?.id || "";
    const staffMember = staffById.get(staffId);
    if (!staffMember) {
      setMessage("PDF için personel seçin.");
      return;
    }

    const usedDays = countLeaveDays(unpaidLeaveForm.startDate, unpaidLeaveForm.endDate);
    if (!usedDays) {
      setMessage("PDF için geçerli tarih aralığı girin.");
      return;
    }

    const pdfMakeModule = await import("pdfmake/build/pdfmake");
    const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
    const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
    const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as any;
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? pdfFonts;

    const { firstName, lastName } = splitStaffName(staffMember.name);
    const startDate = formatDateDotTr(unpaidLeaveForm.startDate);
    const endDate = formatDateDotTr(unpaidLeaveForm.endDate);
    const returnDate = formatDateDotTr(getNextCalendarDateIso(unpaidLeaveForm.endDate));
    const startDayName = formatWeekdayTr(unpaidLeaveForm.startDate);
    const borderColor = "#111111";
    const cell = (text: string | number, bold = false) => ({ text: String(text ?? ""), bold, margin: [0, 2, 0, 2] });
    const centerCell = (text: string, bold = true) => ({ text, bold, alignment: "center", margin: [0, 1, 0, 1] });
    const layout = annualLeavePdfLayout(borderColor);

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [45, 56, 45, 45],
      defaultStyle: { font: "Roboto", fontSize: 10.2, lineHeight: 1.05 },
      styles: {
        title: { fontSize: 11, bold: true, alignment: "center" },
        requestText: { fontSize: 10.5, margin: [0, 14, 0, 0] },
        boldCenter: { bold: true, alignment: "center" },
      },
      content: [
        {
          table: { widths: ["*"], body: [[{ text: "ÜCRETSİZ İZİN FORMU", style: "title", margin: [0, 1, 0, 1] }]] },
          layout,
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ["40.5%", "3%", "56.5%"],
            heights: (rowIndex: number) => (rowIndex === 7 ? 30 : 22),
            body: [
              [cell("TARİH"), "", cell(startDate)],
              [cell("ADI"), "", cell(firstName)],
              [cell("SOYADI"), "", cell(lastName)],
              [cell("T.C KİMLİK NO"), "", cell(staffMember.nationalId ?? "")],
              [cell("UNVANI"), "", cell(staffMember.title)],
              [cell("ÜCRETSİZ İZNE ÇIKACAĞI TARİH"), "", cell(startDate)],
              [cell("ÜCRETSİZ İZİNDEN DÖNÜŞ TARİHİ"), "", cell(endDate)],
              [cell("TALEP EDEN ÇALIŞANIN İMZASI"), "", ""],
            ],
          },
          layout,
          margin: [0, 0, 0, 12],
        },
        {
          text: `Yukarıda belirttiğim tarihler arasında kişisel işlerim nedeniyle toplam ${usedDays} (${numberToTurkishText(usedDays)}) gün\nücretsiz izin kullandım. ${returnDate} Tarihinde işbaşı yaptım. Gereğinin yapılmasını arz ederim.`,
          style: "requestText",
        },
        { text: "Saygılarımla,", alignment: "center", margin: [0, 18, 0, 0] },
        { text: "Adı Soyadı - İmza", style: "boldCenter", margin: [0, 0, 0, 58] },
        { text: "***ŞİRKET İDARESİ TARAFINDAN DOLDURULACAKTIR ***", style: "boldCenter", margin: [0, 0, 0, 0] },
        {
          table: {
            widths: ["*"],
            body: [[centerCell("ÜCRETSİZ İZİN HESABI")]],
          },
          layout,
          margin: [0, 0, 0, 0],
        },
        {
          table: {
            widths: ["40.5%", "59.5%"],
            body: [
              [cell("ÜCRETSİZ İZİNE ÇIKIŞ TARİHİ"), cell(startDate)],
              [cell("ÜCRETSİZ İZNE ÇIKTIĞI GÜN"), cell(startDayName)],
              [cell("TOPLAM İZİN SÜRESİ"), cell(usedDays)],
              [cell("İŞ BAŞI TARİHİ"), cell(returnDate)],
            ],
          },
          layout,
          margin: [0, 0, 0, 48],
        },
        { text: `İlgili Personel ${endDate} tarihinde izinden dönmüş ve ${returnDate} tarihinde görevine başlamıştır.`, fontSize: 9.4, margin: [0, 0, 0, 20] },
        { text: "Onay", style: "boldCenter" },
      ],
    };

    pdfMake.createPdf(docDefinition).download(`${safeFilename(staffMember.name || "personel")}-ucretsiz-izin-formu-${unpaidLeaveForm.startDate}.pdf`);
  }

  async function handleLoadReport() {
    setBusy(true);
    try {
      const records = await loadAttendanceRange(reportStart, reportEnd);
      setReportRows(
        [...records].sort((a, b) => {
          const dateSort = a.date.localeCompare(b.date);
          if (dateSort !== 0) return dateSort;
          return (staffRankById.get(a.staffId) ?? 0) - (staffRankById.get(b.staffId) ?? 0);
        }),
      );
    } catch {
      setMessage("Rapor alınamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadMonthlyReport() {
    const start = monthStartIso();
    const end = monthEndIso(start);
    setReportStart(start);
    setReportEnd(end);
    setBusy(true);
    try {
      const records = await loadAttendanceRange(start, end);
      setReportRows(
        [...records].sort((a, b) => {
          const dateSort = a.date.localeCompare(b.date);
          if (dateSort !== 0) return dateSort;
          return (staffRankById.get(a.staffId) ?? 0) - (staffRankById.get(b.staffId) ?? 0);
        }),
      );
      setMessage("Bu ayın raporu hazırlandı.");
    } catch {
      setMessage("Aylık rapor alınamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchivePrintSheet() {
    const archive: PrintArchiveRecord = {
      id: `${selectedDate}_${Date.now()}`,
      date: selectedDate,
      staffCount: signatureStaff.length,
      pageCount: printPages.length,
      rowsPerPrintSide: settings.rowsPerPrintSide,
      shiftStart: settings.shiftStart,
      createdAt: new Date().toISOString(),
      createdBy: admin?.email ?? null,
    };

    setBusy(true);
    try {
      await savePrintArchive(archive);
      await saveAuditLog("İmza föyü arşivlendi", `${selectedDate} - ${signatureStaff.length} personel`);
      await refreshPrintArchives();
      await refreshAuditLogs();
      setMessage(`${formatDateTr(selectedDate)} imza föyü arşive eklendi.`);
    } catch {
      setMessage("İmza föyü arşivlenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    const rows = [
      ["Tarih", "Personel", "Departman", "Ünvan", "Giriş Saati", "Durum", "Gecikme Dk", "Açıklama"],
      ...filteredReportRows.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.date,
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.checkInTime,
          statusLabels[record.status],
          getRecordLateMinutes(record, settings),
          record.lateReason,
        ];
      }),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const personPart = reportStaffId === "all" ? "tum-personel" : staffById.get(reportStaffId)?.name ?? "personel";
    link.download = `personel-rapor-${personPart}-${reportStart}-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    const detailRows: Array<Array<string | number>> = [
      ["Tarih", "Personel", "Departman", "Ünvan", "Giriş Saati", "Durum", "Gecikme Dk", "Açıklama"],
      ...filteredReportRows.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.date,
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.checkInTime,
          statusLabels[record.status],
          getRecordLateMinutes(record, settings),
          record.lateReason,
        ];
      }),
    ];
    const summaryRows: Array<Array<string | number>> = [
      ["Personel", "Departman", "Ünvan", "Kayıt", "Geldi", "Geç", "Gelmedi", "İzinli", "Toplam Gecikme Dk"],
      ...reportSummaryRows.map((row) => [
        row.staff.name,
        row.staff.department,
        row.staff.title,
        row.total,
        row.present,
        row.late,
        row.absent,
        row.excused,
        row.lateMinutes,
      ]),
    ];
    const personPart = reportStaffId === "all" ? "tum-personel" : staffById.get(reportStaffId)?.name ?? "personel";
    downloadExcelFile(`personel-rapor-${personPart}-${reportStart}-${reportEnd}.xls`, [
      { title: "Aylık Özet", rows: summaryRows },
      { title: "Detay Kayıtları", rows: detailRows },
    ]);
  }

  async function handleDownloadBackup() {
    setBusy(true);
    try {
      const allAttendance = await loadAttendanceRange("2000-01-01", "2100-12-31");
      const backup = {
        exportedAt: new Date().toISOString(),
        firebaseProjectId,
        settings,
        staff,
        attendance: allAttendance,
        printArchives,
        deletedAttendance,
        incapacityReports,
        holidayWorkRecords,
        annualLeaveRecords,
        auditLogs,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `personel-imza-yedek-${todayIso()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await saveAuditLog("Yedek indirildi", `${allAttendance.length} günlük kayıt`);
      await refreshAuditLogs();
      setMessage("Yedek dosyası indirildi.");
    } catch {
      setMessage("Yedek indirilemedi. İnternet bağlantısını ve yönetici yetkisini kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function getIncapacityExportRows() {
    return [
      ["Rapor Numarası", "Personel", "Departman", "Ünvan", "Başlangıç", "Bitiş", "Gün", "Rapor Nedeni", "Durum", "Not"],
      ...incapacityRowsForMonth.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.reportNumber?.trim() || "-",
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.startDate,
          record.endDate,
          record.dayCount,
          record.reason,
          incapacityStatusLabels[record.status],
          record.notes,
        ];
      }),
    ];
  }

  function handleExportIncapacityExcel() {
    downloadExcelFile(`is-goremezlik-raporu-${incapacityReportMonth}.xls`, [
      { title: `${formatMonthTr(incapacityReportMonth)} İş Göremezlik Raporu`, rows: getIncapacityExportRows() },
    ]);
  }

  function handlePrintIncapacityReport() {
    setPrintMode("incapacity");
    window.setTimeout(() => {
      window.print();
      setPrintMode("signature");
    }, 0);
  }

  function getHolidayWorkExportRows() {
    return [
      ["Personel", "Departman", "Ünvan", "Ay", "Tarihler", "Tatiller", "Saatler", "Toplam Saat", "Karşılık", "Not"],
      ...holidayWorkGroups.map((group) => {
        const member = staffById.get(group.staffId);
        return [
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          formatMonthTr(group.month),
          group.dates.join(", "),
          group.holidayNames.join(", "),
          group.timeRanges.join(", "),
          group.hours,
          group.compensationSummary,
          group.notes.join(" / "),
        ];
      }),
    ];
  }

  function handleExportHolidayWorkExcel() {
    downloadExcelFile(`resmi-tatil-calisan-raporu-${holidayReportMonth}.xls`, [
      { title: `${formatMonthTr(holidayReportMonth)} Resmi Tatil Çalışan Raporu`, rows: getHolidayWorkExportRows() },
    ]);
  }

  function handlePrintHolidayWorkReport() {
    setPrintMode("holidayWork");
    window.setTimeout(() => {
      window.print();
      setPrintMode("signature");
    }, 0);
  }

  function getLeaveExportRows(records: AnnualLeaveRecord[]) {
    return [
      ["Personel", "Departman", "Ünvan", "Yıl", "Tür", "Başlangıç", "Bitiş", "Gün", "Durum", "Not"],
      ...records.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.year,
          annualLeaveTypeLabels[record.leaveType],
          record.startDate,
          record.endDate,
          record.usedDays,
          getLeaveDisplayStatus(record),
          record.notes,
        ];
      }),
    ];
  }

  function handleExportAnnualLeaveExcel() {
    downloadExcelFile(`yillik-izin-raporu-${annualLeaveReportMonth}.xls`, [
      { title: `${formatMonthTr(annualLeaveReportMonth)} Yıllık İzin Raporu`, rows: getLeaveExportRows(annualLeaveRowsForMonth) },
    ]);
  }

  function handleExportUnpaidLeaveExcel() {
    downloadExcelFile(`ucretsiz-izin-raporu-${unpaidLeaveReportMonth}.xls`, [
      { title: `${formatMonthTr(unpaidLeaveReportMonth)} Ücretsiz İzin Raporu`, rows: getLeaveExportRows(unpaidLeaveRowsForMonth) },
    ]);
  }

  function handlePrintAnnualLeaveReport() {
    setPrintMode("annualLeave");
    window.setTimeout(() => {
      window.print();
      setPrintMode("signature");
    }, 0);
  }

  function handlePrintUnpaidLeaveReport() {
    setPrintMode("unpaidLeave");
    window.setTimeout(() => {
      window.print();
      setPrintMode("signature");
    }, 0);
  }

  if (!authChecked) {
    return <AuthStatusScreen title="Oturum kontrol ediliyor" />;
  }

  if (firebaseConfigured && admin && accessState === "checking") {
    return <AuthStatusScreen title="Yetki kontrol ediliyor" email={admin.email} onSignOut={() => void handleSignOut()} />;
  }

  if (firebaseConfigured && admin && accessState === "denied") {
    return <AccessDeniedScreen email={admin.email} onSignOut={() => void handleSignOut()} busy={busy} />;
  }

  if (firebaseConfigured && !admin) {
    return (
      <LoginScreen
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        busy={busy}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={(event) => void handleLogin(event)}
      />
    );
  }

  const renderStaffTable = (members: StaffMember[], title: string, emptyText: string) => (
    <div className="staff-list-block">
      <div className="panel-heading compact-heading">
        <div>
          <h2>{title}</h2>
          <span>{members.length} personel</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Personel</th>
              <th>Departman</th>
              <th>İşe Giriş</th>
              <th>İşten Çıkış</th>
              <th>İmza Föyü</th>
              <th>Durum</th>
              <th aria-label="İşlem" />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-cell">{emptyText}</td>
              </tr>
            )}
            {members.map((member, index) => (
              <tr key={member.id} className={!member.active ? "is-muted" : ""}>
                <td className="number-cell">{index + 1}</td>
                <td>
                  <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                    <strong>{member.name}</strong>
                    <span>{member.title}</span>
                  </button>
                </td>
                <td>{member.department}</td>
                <td>{member.startDate}</td>
                <td>{member.endDate}</td>
                <td>
                  <span className={`status-pill ${member.showOnSignatureSheet === false ? "status-empty" : "status-present"}`}>
                    {member.showOnSignatureSheet === false ? "Gizli" : "Göster"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="icon-button" onClick={() => handleStartEditStaff(member)} title="Düzenle" aria-label={`${member.name} düzenle`}>
                      <Edit3 size={17} />
                    </button>
                    <button className="status-toggle" onClick={() => void handleToggleStaff(member)}>
                      {member.active ? "Aktif" : "Pasif"}
                    </button>
                  </div>
                </td>
                <td>
                  <button
                    className="icon-button danger"
                    onClick={() => void handleDeleteStaff(member)}
                    title="Personeli sil"
                    aria-label={`${member.name} personelini sil`}
                  >
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="app-shell screen-only">
        <aside className="side-nav">
          <div className="side-brand">
            <img className="brand-logo side-logo" src={BRAND_LOGO_SRC} alt="Personel imza rapor logosu" />
            <div>
              <p className="eyebrow">Personel devam sistemi</p>
              <strong>{settings.companyName}</strong>
            </div>
          </div>

          <nav className="tabbar" aria-label="Ana bölümler">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? "is-active" : ""}
                  onClick={() => setActiveTab(tab.key)}
                  title={tab.label}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="content-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">Yönetici paneli</p>
              <h1>{settings.companyName}</h1>
            </div>
            <div className="top-actions">
              <span className={`connection-badge ${firebaseConfigured ? "is-online" : "is-local"}`}>
                <Database size={16} aria-hidden="true" />
                {firebaseConfigured ? `Firebase ${firebaseProjectId}` : "Yerel taslak"}
              </span>
              {firebaseConfigured && admin && (
                <>
                  <span className="user-badge">
                    <ShieldCheck size={16} aria-hidden="true" />
                    {admin.email}
                  </span>
                  <button className="secondary-action" onClick={() => void handleSignOut()} disabled={busy}>
                    <LogOut size={18} aria-hidden="true" />
                    Çıkış
                  </button>
                </>
              )}
              <button
                className="icon-button"
                onClick={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
                title={settings.theme === "dark" ? "Açık tema" : "Koyu tema"}
                aria-label={settings.theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
              >
                {settings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className="icon-button" onClick={() => void refreshStaff()} title="Yenile" aria-label="Yenile">
                <RefreshCw size={18} />
              </button>
            </div>
          </header>

          <nav className="mobile-tabbar" aria-label="Ana bölümler">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "is-active" : ""}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          </nav>

          {message && <div className="notice">{message}</div>}

        {activeTab === "daily" && (
          <main className="workspace">
            <DailyDashboard
              selectedDate={selectedDate}
              shiftStart={settings.shiftStart}
              lateAfterMinutes={settings.lateAfterMinutes}
              activeStaffCount={activeStaff.length}
              dailyStats={dailyStats}
              dailyEmptyCount={dailyEmptyCount}
              dailyProgress={dailyProgress}
              isHoliday={selectedDateIsSunday}
              isLocked={selectedDayLocked}
              lastAuditLog={lastAuditLog}
            />

            <section className="toolbar-band">
              <label>
                Tarih
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                Mesai Başlangıcı
                <input
                  type="time"
                  value={settings.shiftStart}
                  onChange={(event) => updateSettings({ shiftStart: event.target.value })}
                />
              </label>
              <label>
                Tolerans
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.lateAfterMinutes}
                  onChange={(event) => updateSettings({ lateAfterMinutes: Number(event.target.value) })}
                />
              </label>
              <label className="wide-filter">
                Arama
                <div className="input-with-icon compact-input">
                  <Search size={17} aria-hidden="true" />
                  <input value={dailySearch} onChange={(event) => setDailySearch(event.target.value)} placeholder="Personel ara" />
                </div>
              </label>
              <label>
                Departman
                <select value={dailyDepartment} onChange={(event) => setDailyDepartment(event.target.value)}>
                  <option value="all">Tümü</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-action" onClick={() => void handleSaveDay()} disabled={busy || selectedDayLocked}>
                <Save size={18} aria-hidden="true" />
                Kaydet
              </button>
              <button className="secondary-action" onClick={() => void handleMarkEmptyAbsent()} disabled={busy || !dailyEmptyCount || selectedDayLocked || selectedDateIsSunday}>
                <CheckCircle2 size={18} aria-hidden="true" />
                Boşları Gelmedi Yap
              </button>
              <button className={selectedDayLocked ? "primary-action" : "secondary-action"} onClick={() => void handleToggleDayLock()} disabled={busy}>
                {selectedDayLocked ? <UnlockKeyhole size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
                {selectedDayLocked ? "Kilidi Aç" : "Günü Kilitle"}
              </button>
            </section>

            {(selectedDateIsSunday || selectedDayLocked) && (
              <section className="alert-row">
                {selectedDateIsSunday && (
                  <div className="alert-card holiday-alert">
                    <CalendarDays size={18} aria-hidden="true" />
                    Pazar günü resmi tatil olarak kabul edilir.
                  </div>
                )}
                {selectedDayLocked && (
                  <div className="alert-card locked-alert">
                    <Lock size={18} aria-hidden="true" />
                    Bu gün kilitli. Kayıtlar değiştirilemez.
                  </div>
                )}
              </section>
            )}

            <section className="metric-row" aria-label="Günlük özet">
              <Metric label="Aktif Personel" value={activeStaff.length} />
              <Metric label="İşlenen" value={dailyStats.processed} tone="blue" />
              <Metric label="Eksik" value={dailyEmptyCount} tone="amber" />
              <Metric label="Geldi" value={dailyStats.present} tone="green" />
              <Metric label="Geç" value={dailyStats.late} tone="amber" />
              <Metric label="Gelmedi" value={dailyStats.absent} tone="red" />
              <Metric label="İzinli" value={dailyStats.excused} tone="blue" />
            </section>

            <section className="data-panel">
              <div className="table-scroll">
                <table className="data-table attendance-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Giriş</th>
                      <th>Gecikme</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyStaff.map((member, index) => {
                      const draft = drafts[member.id] ?? emptyDraft;
                      const lateMinutes = getLateMinutes(draft.checkInTime, settings);
                      const status = getDraftStatus(draft, settings);

                      return (
                        <tr key={member.id} className={getStatusRowClass(status)}>
                          <td className="number-cell">{index + 1}</td>
                          <td>
                            <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                              <strong>{member.name}</strong>
                              <span>{[member.department, member.title].filter(Boolean).join(" / ")}</span>
                            </button>
                          </td>
                          <td>
                            <input
                              type="time"
                              value={draft.checkInTime}
                              disabled={selectedDayLocked}
                              onChange={(event) => updateDraft(member.id, { checkInTime: event.target.value })}
                            />
                          </td>
                          <td>
                            <span className={`late-badge late-${getLateTone(lateMinutes)}`}>
                              {lateMinutes > 0 ? `${lateMinutes} dk` : "-"}
                            </span>
                          </td>
                          <td>
                            <select
                              value={draft.status}
                              disabled={selectedDayLocked}
                              onChange={(event) =>
                                updateDraft(member.id, { status: event.target.value as AttendanceStatus | "" })
                              }
                            >
                              <option value="">Seç</option>
                              <option value="present">Geldi</option>
                              <option value="late">Geç</option>
                              <option value="absent">Gelmedi</option>
                              <option value="excused">İzinli</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={draft.lateReason}
                              disabled={selectedDayLocked}
                              onChange={(event) => updateDraft(member.id, { lateReason: event.target.value })}
                              placeholder="Geç kalma / izin açıklaması"
                            />
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              onClick={() => void handleClearRecord(member.id)}
                              disabled={selectedDayLocked}
                              title="Kaydı temizle"
                              aria-label={`${member.name} kaydını temizle`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "print" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label>
                Tarih
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                Ön/Arka Satır
                <input
                  type="number"
                  min="35"
                  max="48"
                  value={settings.rowsPerPrintSide}
                  onChange={(event) => updateSettings({ rowsPerPrintSide: Number(event.target.value) })}
                />
              </label>
              <button className="primary-action" onClick={() => window.print()}>
                <Printer size={18} aria-hidden="true" />
                Yazdır
              </button>
              <button className="secondary-action" onClick={() => void handleArchivePrintSheet()} disabled={busy}>
                <Save size={18} aria-hidden="true" />
                Arşivle
              </button>
            </section>

            <PrintPreviewOverview
              pageCount={printPages.length}
              staffCount={signatureStaff.length}
              rowsPerPrintSide={settings.rowsPerPrintSide}
              shiftStart={settings.shiftStart}
              selectedDate={selectedDate}
              pages={printPages}
            />

            <section className="data-panel archive-panel">
              <div className="panel-heading">
                <div>
                  <h2>İmza Föyü Arşivi</h2>
                  <span>Son basım/arşiv kayıtları</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table archive-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Sayfa</th>
                      <th>Mesai</th>
                      <th>Arşiv Zamanı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printArchives.slice(0, 8).map((archive) => (
                      <tr key={archive.id}>
                        <td>{archive.date}</td>
                        <td>{archive.staffCount}</td>
                        <td>{archive.pageCount}</td>
                        <td>{archive.shiftStart}</td>
                        <td>{new Date(archive.createdAt).toLocaleString("tr-TR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="sheet-preview">
              {printPages.map((pageStaff, index) => (
                <SheetPage
                  key={`${index}-${pageStaff.length}`}
                  staff={pageStaff}
                  startNumber={index * settings.rowsPerPrintSide}
                  pageIndex={index}
                  pageCount={printPages.length}
                  selectedDate={selectedDate}
                  settings={settings}
                  preview
                />
              ))}
            </section>
          </main>
        )}

        {activeTab === "reports" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label>
                Başlangıç
                <input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} />
              </label>
              <label>
                Bitiş
                <input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} />
              </label>
              <label className="wide-filter">
                Personel
                <select value={reportStaffId} onChange={(event) => setReportStaffId(event.target.value)}>
                  <option value="all">Tüm personel</option>
                  {activeStaff.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      {index + 1}. {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Departman
                <select value={reportDepartment} onChange={(event) => setReportDepartment(event.target.value)}>
                  <option value="all">Tümü</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-action" onClick={() => void handleLoadReport()} disabled={busy}>
                <BarChart3 size={18} aria-hidden="true" />
                Getir
              </button>
              <button className="secondary-action" onClick={() => void handleLoadMonthlyReport()} disabled={busy}>
                <CalendarDays size={18} aria-hidden="true" />
                Bu Ay
              </button>
              <button className="secondary-action" onClick={handleExportExcel} disabled={!filteredReportRows.length}>
                <FileSpreadsheet size={18} aria-hidden="true" />
                Excel
              </button>
              <button className="primary-action" onClick={handleExportCsv} disabled={!filteredReportRows.length}>
                <FileDown size={18} aria-hidden="true" />
                CSV
              </button>
            </section>

            <section className="metric-row" aria-label="Rapor özeti">
              <Metric label="Kayıt" value={reportStats.total} />
              <Metric label="Geldi" value={reportStats.present} tone="green" />
              <Metric label="Geç" value={reportStats.late} tone="amber" />
              <Metric label="Gelmedi" value={reportStats.absent} tone="red" />
              <Metric label="İzinli" value={reportStats.excused} tone="blue" />
            </section>

            <ReportCharts
              dailyTrendRows={dailyTrendRows}
              departmentRows={departmentReportRows}
              topAbsentRows={topAbsentRows}
              onSelectStaff={setSelectedStaffId}
            />

            {selectedPersonSummary && (
              <section className="person-card">
                <div>
                  <span>Kişi Karnesi</span>
                  <strong>{selectedPersonSummary.staff.name}</strong>
                  <small>{[selectedPersonSummary.staff.department, selectedPersonSummary.staff.title].filter(Boolean).join(" / ")}</small>
                </div>
                <Metric label="Toplam Gecikme" value={selectedPersonSummary.lateMinutes} tone="amber" />
                <Metric label="Geç Gün" value={selectedPersonSummary.late} tone="amber" />
                <Metric label="Gelmedi" value={selectedPersonSummary.absent} tone="red" />
              </section>
            )}

            <section className="warning-panel-grid" aria-label="Uyarı paneli">
              <div className="warning-panel-card">
                <span>Gelmeyen</span>
                <strong>{warningRows.length}</strong>
                <small>{warningRows.length ? warningRows.slice(0, 3).map((row) => row.staff.name).join(", ") : "Seçili aralıkta yok"}</small>
              </div>
              <div className="warning-panel-card">
                <span>Aktif Rapor</span>
                <strong>{incapacityStats.active}</strong>
                <small>İş göremezlik ekranında takip edilir</small>
              </div>
              <div className="warning-panel-card">
                <span>Yaklaşan İzin</span>
                <strong>{upcomingAnnualLeaves.length}</strong>
                <small>
                  {upcomingAnnualLeaves[0]
                    ? `${upcomingAnnualLeaves[0].startDate} - ${staffById.get(upcomingAnnualLeaves[0].staffId)?.name ?? ""}`
                    : "14 gün içinde yok"}
                </small>
              </div>
              <div className="warning-panel-card">
                <span>Az Kalan İzin</span>
                <strong>{lowAnnualLeaveRows.length}</strong>
                <small>{lowAnnualLeaveRows[0] ? `${lowAnnualLeaveRows[0].staff.name}: ${lowAnnualLeaveRows[0].remaining} gün` : "Kritik personel yok"}</small>
              </div>
            </section>

            {warningRows.length > 0 && (
              <section className="alert-row">
                <div className="alert-card warning-alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  Bu aralıkta gelmeyen personel: {warningRows.map((row) => row.staff.name).join(", ")}
                </div>
              </section>
            )}

            <section className="data-panel report-summary-panel">
              <div className="panel-heading">
                <div>
                  <h2>Aylık Özet</h2>
                  <span>{reportStart} - {reportEnd}</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table summary-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Kayıt</th>
                      <th>Geldi</th>
                      <th>Geç</th>
                      <th>Gelmedi</th>
                      <th>İzinli</th>
                      <th>Gecikme Dk</th>
                      <th>Uyarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportSummaryRows.map((row) => (
                      <tr key={row.staff.id} className={row.absent > 0 ? "row-status-absent" : row.late >= 3 ? "row-status-late" : ""}>
                        <td className="number-cell">{(staffRankById.get(row.staff.id) ?? 0) + 1}</td>
                        <td>
                          <button className="person-trigger" onClick={() => setSelectedStaffId(row.staff.id)}>
                            <strong>{row.staff.name}</strong>
                            <span>{row.staff.title}</span>
                          </button>
                        </td>
                        <td>{row.staff.department}</td>
                        <td>{row.total}</td>
                        <td>{row.present}</td>
                        <td>{row.late}</td>
                        <td>{row.absent}</td>
                        <td>{row.excused}</td>
                        <td>{row.lateMinutes}</td>
                        <td>{row.absent > 0 ? <span className="warning-chip">{row.absent} gelmedi</span> : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="data-panel">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Giriş</th>
                      <th>Gecikme</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportRows.map((record) => {
                      const member = staffById.get(record.staffId);
                      return (
                        <tr key={record.id} className={getStatusRowClass(record.status)}>
                          <td>{record.date}</td>
                          <td>
                            {member ? (
                              <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                                <strong>{member.name}</strong>
                                <span>{member.title}</span>
                              </button>
                            ) : (
                              ""
                            )}
                          </td>
                          <td>{member?.department ?? ""}</td>
                          <td>{record.checkInTime}</td>
                          <td>
                            <span className={`late-badge late-${getLateTone(getRecordLateMinutes(record, settings))}`}>
                              {getRecordLateMinutes(record, settings) || "-"}
                            </span>
                          </td>
                          <td>
                            <StatusPill status={record.status} />
                          </td>
                          <td>{record.lateReason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "incapacity" && (
          <main className="workspace">
            <section className="metric-row" aria-label="İş göremezlik özeti">
              <Metric label="Rapor" value={incapacityStats.total} />
              <Metric label="Aktif" value={incapacityStats.active} tone="amber" />
              <Metric label="Toplam Gün" value={incapacityStats.days} tone="blue" />
            </section>

            <section className="workspace two-column">
              <section className="data-panel form-panel">
                <form className="staff-form" onSubmit={(event) => void handleSaveIncapacityReport(event)}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>İş Göremezlik Raporu</h2>
                      <span>{incapacityForm.id ? "Kayıt düzenleniyor" : "Yeni kayıt"}</span>
                    </div>
                  </div>
                  <label>
                    Personel
                    <select value={incapacityForm.staffId} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, staffId: event.target.value }))}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rapor Numarası
                    <input value={incapacityForm.reportNumber} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, reportNumber: event.target.value }))} placeholder="Rapor numarası" />
                  </label>
                  <label>
                    Başlangıç
                    <input type="date" value={incapacityForm.startDate} onChange={(event) => handleIncapacityStartDateChange(event.target.value)} />
                  </label>
                  <label>
                    Bitiş
                    <input type="date" value={incapacityForm.endDate} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, endDate: event.target.value }))} />
                  </label>
                  <label>
                    Gün Sayısı
                    <input value={countCalendarDays(incapacityForm.startDate, incapacityForm.endDate)} readOnly />
                  </label>
                  <label>
                    Rapor Nedeni
                    <input value={incapacityForm.reason} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, reason: event.target.value }))} placeholder="Rapor nedeni" />
                  </label>
                  <label>
                    Durum
                    <select value={incapacityForm.status} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, status: event.target.value as IncapacityStatus }))}>
                      <option value="active">Aktif</option>
                      <option value="completed">Bitti</option>
                      <option value="cancelled">İptal</option>
                    </select>
                  </label>
                  <label>
                    Not
                    <textarea value={incapacityForm.notes} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} />
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Kaydet
                    </button>
                    {incapacityForm.id && (
                      <button className="secondary-action" type="button" onClick={resetIncapacityForm}>
                        <X size={18} aria-hidden="true" />
                        Vazgeç
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="data-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Rapor Kayıtları</h2>
                    <span>{formatMonthTr(incapacityReportMonth)} personel bazlı iş göremezlik geçmişi</span>
                  </div>
                  <div className="button-row">
                    <label className="compact-month-filter">
                      Ay
                      <input type="month" value={incapacityReportMonth} onChange={(event) => setIncapacityReportMonth(event.target.value || todayIso().slice(0, 7))} />
                    </label>
                    <label className="compact-month-filter">
                      Personel
                      <select value={incapacityReportStaffId} onChange={(event) => setIncapacityReportStaffId(event.target.value)}>
                        <option value="all">Tüm personel</option>
                        {activeStaff.map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary-action" onClick={handleExportIncapacityExcel} disabled={!incapacityRowsForMonth.length}>
                      <FileSpreadsheet size={18} aria-hidden="true" />
                      Excel
                    </button>
                    <button className="secondary-action" onClick={handlePrintIncapacityReport} disabled={!incapacityRowsForMonth.length}>
                      <FileDown size={18} aria-hidden="true" />
                      PDF
                    </button>
                    <button className="secondary-action" onClick={() => void refreshHrRecords()} disabled={busy}>
                      <RefreshCw size={18} aria-hidden="true" />
                      Yenile
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Rapor No</th>
                        <th>Tarih</th>
                        <th>Gün</th>
                        <th>Neden</th>
                        <th>Durum</th>
                        <th>Not</th>
                        <th aria-label="İşlem" />
                      </tr>
                    </thead>
                    <tbody>
                      {incapacityRowsForMonth.map((record) => (
                        <tr key={record.id}>
                          <td>
                            <strong>{staffById.get(record.staffId)?.name ?? ""}</strong>
                            <span>{staffById.get(record.staffId)?.department ?? ""}</span>
                          </td>
                          <td>{record.reportNumber || "-"}</td>
                          <td>{record.startDate} - {record.endDate}</td>
                          <td>{record.dayCount}</td>
                          <td>{record.reason}</td>
                          <td><span className="status-toggle">{incapacityStatusLabels[record.status]}</span></td>
                          <td>{record.notes}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button" onClick={() => handleEditIncapacityReport(record)} title="Düzenle" aria-label="Raporu düzenle">
                                <Edit3 size={17} />
                              </button>
                              <button className="icon-button danger" onClick={() => void handleDeleteIncapacityReport(record)} title="Sil" aria-label="Raporu sil">
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!incapacityRowsForMonth.length && <div className="empty-state">Seçili ayda iş göremezlik raporu bulunmuyor.</div>}
              </section>
            </section>
          </main>
        )}

        {activeTab === "holidayWork" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Resmi tatil çalışma özeti">
              <Metric label="Kayıt" value={holidayWorkStats.total} />
              <Metric label="Saat" value={holidayWorkStats.hours} tone="blue" />
              <Metric label="Ücret" value={holidayWorkStats.paidCompensation} tone="green" />
              <Metric label="İzin Karşılığı" value={holidayWorkStats.leaveCompensation} tone="amber" />
            </section>

            <section className="data-panel holiday-calendar-panel">
              <div className="panel-heading">
                <div>
                  <h2>{holidayWorkYear} Türkiye Resmi Tatilleri</h2>
                  <span>2429 sayılı kanundaki ulusal ve dini bayramlar</span>
                </div>
                <CalendarDays size={19} aria-hidden="true" />
              </div>
              <div className="holiday-calendar-grid">
                {publicHolidays.map((holiday) => (
                  <button
                    key={`${holiday.date}-${holiday.name}`}
                    className={`holiday-calendar-item ${holiday.date === holidayWorkForm.date ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => handlePublicHolidaySelect(holiday.date)}
                  >
                    <span>{formatDateTr(holiday.date)}</span>
                    <strong>{holiday.name}</strong>
                    <small>{holiday.duration === "half" ? "Yarım gün" : "Tam gün"}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="workspace two-column">
              <section className="data-panel form-panel">
                <form className="staff-form" onSubmit={(event) => void handleSaveHolidayWork(event)}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Resmi Tatilde Çalışan</h2>
                      <span>{holidayWorkForm.id ? "Kayıt düzenleniyor" : "Yeni kayıt"}</span>
                    </div>
                  </div>
                  <label>
                    Personel
                    <select value={holidayWorkForm.staffId} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, staffId: event.target.value }))}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tarih
                    <input type="date" value={holidayWorkForm.date} onChange={(event) => handleHolidayWorkDateChange(event.target.value)} />
                  </label>
                  <label>
                    Resmi Tatil Seç
                    <select value={selectedPublicHoliday?.date ?? ""} onChange={(event) => handlePublicHolidaySelect(event.target.value)}>
                      <option value="">Tatil listesinden seç</option>
                      {publicHolidays.map((holiday) => (
                        <option key={`${holiday.date}-${holiday.name}`} value={holiday.date}>
                          {formatDateTr(holiday.date)} - {holiday.name}{holiday.duration === "half" ? " (yarım gün)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedPublicHoliday && (
                    <div className="holiday-match-card">
                      <CalendarDays size={17} aria-hidden="true" />
                      <span>{selectedPublicHoliday.name}</span>
                      <strong>{selectedPublicHoliday.duration === "half" ? "Yarım gün" : "Tam gün"}</strong>
                    </div>
                  )}
                  <label>
                    Tatil Adı
                    <input value={holidayWorkForm.holidayName} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, holidayName: event.target.value }))} placeholder="Örn. Ramazan Bayramı" />
                  </label>
                  <label>
                    Giriş
                    <input type="time" value={holidayWorkForm.startTime} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, startTime: event.target.value }))} />
                  </label>
                  <label>
                    Çıkış
                    <input type="time" value={holidayWorkForm.endTime} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, endTime: event.target.value }))} />
                  </label>
                  <label>
                    Çalışma Saati
                    <input value={calculateWorkHours(holidayWorkForm.startTime, holidayWorkForm.endTime)} readOnly />
                  </label>
                  <label>
                    Karşılık
                    <select value={holidayWorkForm.compensationType} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, compensationType: event.target.value as HolidayCompensationType }))}>
                      <option value="paid">Ücret</option>
                      <option value="leave">İzin karşılığı</option>
                      <option value="none">Belirtilmedi</option>
                    </select>
                  </label>
                  <label>
                    Not
                    <textarea value={holidayWorkForm.notes} onChange={(event) => setHolidayWorkForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} />
                  </label>
                  <div className="bulk-fixed-box">
                    <div>
                      <strong>Sabit personeli toplu ekle</strong>
                      <span>Çalışmayanları işaretle; kalan sabit personeller seçili bayrama tek seferde eklenir.</span>
                    </div>
                    {fixedHolidayStaff.length ? (
                      <div className="fixed-staff-checklist">
                        {fixedHolidayStaff.map((member) => (
                          <label className="checkbox-field" key={member.id}>
                            <input
                              type="checkbox"
                              checked={excludedFixedHolidayStaffIds.includes(member.id)}
                              onChange={(event) =>
                                setExcludedFixedHolidayStaffIds((previous) =>
                                  event.target.checked ? [...previous, member.id] : previous.filter((id) => id !== member.id),
                                )
                              }
                            />
                            <span>{member.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="empty-inline">Sabit personel olarak işaretlenmiş personel yok.</span>
                    )}
                    <button className="secondary-action" type="button" onClick={() => void handleBulkAddFixedHolidayWork()} disabled={busy || !fixedHolidayStaff.length}>
                      <Users size={18} aria-hidden="true" />
                      Sabitleri Toplu Ekle
                    </button>
                  </div>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Kaydet
                    </button>
                    {holidayWorkForm.id && (
                      <button className="secondary-action" type="button" onClick={resetHolidayWorkForm}>
                        <X size={18} aria-hidden="true" />
                        Vazgeç
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="data-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Resmi Tatil Çalışmaları</h2>
                    <span>{formatMonthTr(holidayReportMonth)} çalışma saati ve ödeme/izin karşılığı</span>
                  </div>
                  <div className="button-row">
                    <label className="compact-month-filter">
                      Ay
                      <input type="month" value={holidayReportMonth} onChange={(event) => setHolidayReportMonth(event.target.value || todayIso().slice(0, 7))} />
                    </label>
                    <button className="secondary-action" onClick={handleExportHolidayWorkExcel} disabled={!holidayWorkRowsForMonth.length}>
                      <FileSpreadsheet size={18} aria-hidden="true" />
                      Excel
                    </button>
                    <button className="secondary-action" onClick={handlePrintHolidayWorkReport} disabled={!holidayWorkRowsForMonth.length}>
                      <FileDown size={18} aria-hidden="true" />
                      PDF
                    </button>
                    <button className="secondary-action" onClick={() => void refreshHrRecords()} disabled={busy}>
                      <RefreshCw size={18} aria-hidden="true" />
                      Yenile
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Ay / Tarihler</th>
                        <th>Tatiller</th>
                        <th>Saatler</th>
                        <th>Toplam</th>
                        <th>Karşılık</th>
                        <th>Not</th>
                        <th aria-label="İşlem" />
                      </tr>
                    </thead>
                    <tbody>
                      {holidayWorkGroups.map((group) => (
                        <tr key={group.id}>
                          <td>
                            <strong>{staffById.get(group.staffId)?.name ?? ""}</strong>
                            <span>{staffById.get(group.staffId)?.department ?? ""}</span>
                          </td>
                          <td>
                            <strong>{formatMonthTr(group.month)}</strong>
                            <span>{group.dates.join(", ")}</span>
                          </td>
                          <td>{group.holidayNames.join(", ")}</td>
                          <td>{group.timeRanges.join(", ")}</td>
                          <td>{group.hours}</td>
                          <td><span className="status-toggle">{group.compensationSummary}</span></td>
                          <td>{group.notes.join(" / ")}</td>
                          <td>
                            <div className="row-actions">
                              {group.records.map((record) => (
                                <span className="record-action-pair" key={record.id}>
                                  <small>{record.date}</small>
                                  <button className="icon-button" onClick={() => handleEditHolidayWork(record)} title={`${record.date} düzenle`} aria-label={`${record.date} çalışma kaydını düzenle`}>
                                    <Edit3 size={17} />
                                  </button>
                                  <button className="icon-button danger" onClick={() => void handleDeleteHolidayWork(record)} title={`${record.date} sil`} aria-label={`${record.date} çalışma kaydını sil`}>
                                    <Trash2 size={17} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!holidayWorkRowsForMonth.length && <div className="empty-state">Seçili ayda resmi tatil çalışma kaydı bulunmuyor.</div>}
              </section>
            </section>
          </main>
        )}

        {activeTab === "annualLeave" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Yıllık izin özeti">
              <Metric label="Kayıt" value={annualLeaveStats.records} />
              <Metric label="Kullanılan" value={annualLeaveStats.used} tone="amber" />
              <Metric label="Planlanan" value={annualLeaveStats.planned} tone="blue" />
              <Metric label="Kalan" value={annualLeaveStats.remaining} tone="green" />
            </section>

            <section className="workspace two-column">
              <section className="data-panel form-panel">
                <form className="staff-form" onSubmit={(event) => void handleSaveAnnualLeave(event)}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Yıllık İzin Takibi</h2>
                      <span>{annualLeaveForm.id ? "Kayıt düzenleniyor" : "Yeni kayıt"}</span>
                    </div>
                  </div>
                  <label>
                    Personel
                    <select value={annualLeaveForm.staffId} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, staffId: event.target.value }))}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Yıl
                    <input type="number" value={annualLeaveForm.year} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, year: Number(event.target.value) }))} />
                  </label>
                  <label>
                    İzin Türü
                    <select value={annualLeaveForm.leaveType} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, leaveType: event.target.value as AnnualLeaveType }))}>
                      <option value="annual">Yıllık izin</option>
                      <option value="excuse">Mazeret</option>
                      <option value="other">Diğer</option>
                    </select>
                  </label>
                  <label>
                    Başlangıç
                    <input type="date" value={annualLeaveForm.startDate} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, startDate: event.target.value, year: Number(event.target.value.slice(0, 4)) || previous.year }))} />
                  </label>
                  <label>
                    Bitiş
                    <input type="date" value={annualLeaveForm.endDate} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, endDate: event.target.value }))} />
                  </label>
                  <label>
                    Kullanılan Gün
                    <input value={countLeaveDays(annualLeaveForm.startDate, annualLeaveForm.endDate)} readOnly />
                  </label>
                  <label>
                    Hak Edilen Gün
                    <input type="number" min="0" value={annualLeaveForm.entitlementDays} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, entitlementDays: Number(event.target.value) }))} />
                  </label>
                  <label>
                    Durum
                    <select value={annualLeaveForm.status} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, status: event.target.value as LeaveStatus }))}>
                      <option value="planned">Planlandı</option>
                      <option value="used">Kullanıldı</option>
                      <option value="cancelled">İptal</option>
                    </select>
                  </label>
                  <label>
                    Not
                    <textarea value={annualLeaveForm.notes} onChange={(event) => setAnnualLeaveForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} />
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Kaydet
                    </button>
                    <button className="secondary-action" type="button" onClick={() => void handleDownloadAnnualLeavePdf()} disabled={busy}>
                      <FileDown size={18} aria-hidden="true" />
                      PDF İndir
                    </button>
                    {annualLeaveForm.id && (
                      <button className="secondary-action" type="button" onClick={resetAnnualLeaveForm}>
                        <X size={18} aria-hidden="true" />
                        Vazgeç
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="data-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{annualLeaveYear} Kalan İzin Özeti</h2>
                    <span>Yıllık izin türündeki planlanan ve kullanılan günler hesaplanır</span>
                  </div>
                  <button className="secondary-action" onClick={() => void refreshHrRecords()} disabled={busy}>
                    <RefreshCw size={18} aria-hidden="true" />
                    Yenile
                  </button>
                </div>
                <div className="table-scroll">
                  <table className="data-table summary-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Hak</th>
                        <th>Kullanılan</th>
                        <th>Planlanan</th>
                        <th>Kalan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualLeaveSummaries.map((row) => (
                        <tr key={row.staff.id}>
                          <td>
                            <strong>{row.staff.name}</strong>
                            <span>{row.staff.department}</span>
                          </td>
                          <td>{row.entitlement}</td>
                          <td>{row.used}</td>
                          <td>{row.planned}</td>
                          <td>{row.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!annualLeaveSummaries.length && <div className="empty-state">Bu yıl için yıllık izin özeti bulunmuyor.</div>}
              </section>
            </section>

            <section className="data-panel">
              <div className="panel-heading">
                <div>
                  <h2>İzin Kayıtları</h2>
                  <span>Pazar günleri izin gününden düşülmez</span>
                </div>
                <div className="button-row">
                  <label className="compact-month-filter">
                    Ay
                    <input type="month" value={annualLeaveReportMonth} onChange={(event) => setAnnualLeaveReportMonth(event.target.value || todayIso().slice(0, 7))} />
                  </label>
                  <label className="compact-month-filter">
                    Personel
                    <select value={annualLeaveReportStaffId} onChange={(event) => setAnnualLeaveReportStaffId(event.target.value)}>
                      <option value="all">Tüm personel</option>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-action" onClick={handleExportAnnualLeaveExcel} disabled={!annualLeaveRowsForMonth.length}>
                    <FileSpreadsheet size={18} aria-hidden="true" />
                    Excel
                  </button>
                  <button className="secondary-action" onClick={handlePrintAnnualLeaveReport} disabled={!annualLeaveRowsForMonth.length}>
                    <FileDown size={18} aria-hidden="true" />
                    PDF
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Personel</th>
                      <th>Yıl</th>
                      <th>Tür</th>
                      <th>Tarih</th>
                      <th>Gün</th>
                      <th>Durum</th>
                      <th>Not</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {annualLeaveTrackingRecords.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{staffById.get(record.staffId)?.name ?? ""}</strong>
                          <span>{staffById.get(record.staffId)?.department ?? ""}</span>
                        </td>
                        <td>{record.year}</td>
                        <td>{annualLeaveTypeLabels[record.leaveType]}</td>
                        <td>{record.startDate} - {record.endDate}</td>
                        <td>{record.usedDays}</td>
                        <td><span className="status-toggle">{getLeaveDisplayStatus(record)}</span></td>
                        <td>{record.notes}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => handleEditAnnualLeave(record)} title="Düzenle" aria-label="İzin kaydını düzenle">
                              <Edit3 size={17} />
                            </button>
                            <button className="icon-button danger" onClick={() => void handleDeleteAnnualLeave(record)} title="Sil" aria-label="İzin kaydını sil">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!annualLeaveTrackingRecords.length && <div className="empty-state">Yıllık izin kaydı bulunmuyor.</div>}
            </section>
          </main>
        )}

        {activeTab === "unpaidLeave" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Ücretsiz izin özeti">
              <Metric label="Kayıt" value={unpaidLeaveStats.records} />
              <Metric label="Kullanılan" value={unpaidLeaveStats.used} tone="amber" />
              <Metric label="Planlanan" value={unpaidLeaveStats.planned} tone="blue" />
              <Metric label="Bitti" value={unpaidLeaveStats.completed} tone="green" />
            </section>

            <section className="workspace two-column">
              <section className="data-panel form-panel">
                <form className="staff-form" onSubmit={(event) => void handleSaveUnpaidLeave(event)}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Ücretsiz İzin Takibi</h2>
                      <span>{unpaidLeaveForm.id ? "Kayıt düzenleniyor" : "Yeni kayıt"}</span>
                    </div>
                  </div>
                  <label>
                    Personel
                    <select value={unpaidLeaveForm.staffId} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, staffId: event.target.value }))}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Yıl
                    <input type="number" value={unpaidLeaveForm.year} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, year: Number(event.target.value) }))} />
                  </label>
                  <label>
                    İzin Türü
                    <select value={unpaidLeaveForm.leaveType} disabled>
                      <option value="unpaid">Ücretsiz izin</option>
                    </select>
                  </label>
                  <label>
                    Başlangıç
                    <input type="date" value={unpaidLeaveForm.startDate} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, startDate: event.target.value, year: Number(event.target.value.slice(0, 4)) || previous.year }))} />
                  </label>
                  <label>
                    Bitiş
                    <input type="date" value={unpaidLeaveForm.endDate} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, endDate: event.target.value }))} />
                  </label>
                  <label>
                    Kullanılan Gün
                    <input value={countLeaveDays(unpaidLeaveForm.startDate, unpaidLeaveForm.endDate)} readOnly />
                  </label>
                  <label>
                    Durum
                    <select value={unpaidLeaveForm.status} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, status: event.target.value as LeaveStatus }))}>
                      <option value="planned">Planlandı</option>
                      <option value="used">Kullanıldı</option>
                      <option value="cancelled">İptal</option>
                    </select>
                  </label>
                  <label>
                    Not
                    <textarea value={unpaidLeaveForm.notes} onChange={(event) => setUnpaidLeaveForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} />
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Kaydet
                    </button>
                    <button className="secondary-action" type="button" onClick={() => void handleDownloadUnpaidLeavePdf()} disabled={busy}>
                      <FileDown size={18} aria-hidden="true" />
                      PDF İndir
                    </button>
                    {unpaidLeaveForm.id && (
                      <button className="secondary-action" type="button" onClick={resetUnpaidLeaveForm}>
                        <X size={18} aria-hidden="true" />
                        Vazgeç
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="data-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{unpaidLeaveYear} Ücretsiz İzin Özeti</h2>
                    <span>Ücretsiz izin türündeki kullanılan, planlanan ve biten günler hesaplanır</span>
                  </div>
                  <button className="secondary-action" onClick={() => void refreshHrRecords()} disabled={busy}>
                    <RefreshCw size={18} aria-hidden="true" />
                    Yenile
                  </button>
                </div>
                <div className="table-scroll">
                  <table className="data-table summary-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Kullanılan</th>
                        <th>Planlanan</th>
                        <th>Bitti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidLeaveSummaries.map((row) => (
                        <tr key={row.staff.id}>
                          <td>
                            <strong>{row.staff.name}</strong>
                            <span>{row.staff.department}</span>
                          </td>
                          <td>{row.used}</td>
                          <td>{row.planned}</td>
                          <td>{row.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!unpaidLeaveSummaries.length && <div className="empty-state">Bu yıl için ücretsiz izin özeti bulunmuyor.</div>}
              </section>
            </section>

            <section className="data-panel">
              <div className="panel-heading">
                <div>
                  <h2>Ücretsiz İzin Kayıtları</h2>
                  <span>Pazar günleri izin gününden düşülmez</span>
                </div>
                <div className="button-row">
                  <label className="compact-month-filter">
                    Ay
                    <input type="month" value={unpaidLeaveReportMonth} onChange={(event) => setUnpaidLeaveReportMonth(event.target.value || todayIso().slice(0, 7))} />
                  </label>
                  <label className="compact-month-filter">
                    Personel
                    <select value={unpaidLeaveReportStaffId} onChange={(event) => setUnpaidLeaveReportStaffId(event.target.value)}>
                      <option value="all">Tüm personel</option>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-action" onClick={handleExportUnpaidLeaveExcel} disabled={!unpaidLeaveRowsForMonth.length}>
                    <FileSpreadsheet size={18} aria-hidden="true" />
                    Excel
                  </button>
                  <button className="secondary-action" onClick={handlePrintUnpaidLeaveReport} disabled={!unpaidLeaveRowsForMonth.length}>
                    <FileDown size={18} aria-hidden="true" />
                    PDF
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Personel</th>
                      <th>Yıl</th>
                      <th>Tür</th>
                      <th>Tarih</th>
                      <th>Gün</th>
                      <th>Durum</th>
                      <th>Not</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidLeaveRecords.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{staffById.get(record.staffId)?.name ?? ""}</strong>
                          <span>{staffById.get(record.staffId)?.department ?? ""}</span>
                        </td>
                        <td>{record.year}</td>
                        <td>{annualLeaveTypeLabels[record.leaveType]}</td>
                        <td>{record.startDate} - {record.endDate}</td>
                        <td>{record.usedDays}</td>
                        <td><span className="status-toggle">{getLeaveDisplayStatus(record)}</span></td>
                        <td>{record.notes}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => handleEditUnpaidLeave(record)} title="Düzenle" aria-label="Ücretsiz izin kaydını düzenle">
                              <Edit3 size={17} />
                            </button>
                            <button className="icon-button danger" onClick={() => void handleDeleteUnpaidLeave(record)} title="Sil" aria-label="Ücretsiz izin kaydını sil">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!unpaidLeaveRecords.length && <div className="empty-state">Ücretsiz izin kaydı bulunmuyor.</div>}
            </section>
          </main>
        )}

        {activeTab === "profiles" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label className="wide-filter">
                Personel
                <select value={profileStaff?.id ?? ""} onChange={(event) => setProfileStaffId(event.target.value)}>
                  {activeStaff.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      {index + 1}. {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Başlangıç
                <input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} />
              </label>
              <label>
                Bitiş
                <input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} />
              </label>
              <button className="secondary-action" onClick={() => void handleLoadReport()} disabled={busy}>
                <BarChart3 size={18} aria-hidden="true" />
                Getir
              </button>
              <button className="secondary-action" onClick={() => void handleLoadMonthlyReport()} disabled={busy}>
                <CalendarDays size={18} aria-hidden="true" />
                Bu Ay
              </button>
            </section>

            {profileStaff && (
              <>
                <section className="profile-hero">
                  <div>
                    <span className="section-kicker">
                      <UserRound size={17} aria-hidden="true" />
                      Personel profili
                    </span>
                    <h2>{profileStaff.name}</h2>
                    <p>{[profileStaff.department, profileStaff.title].filter(Boolean).join(" / ") || "Departman ve ünvan bilgisi yok"}</p>
                  </div>
                  <div className="profile-dates">
                    <span>İşe giriş: <strong>{profileStaff.startDate || "-"}</strong></span>
                    <span>İşten çıkış: <strong>{profileStaff.endDate || "-"}</strong></span>
                    <span>T.C.: <strong>{profileStaff.nationalId || "-"}</strong></span>
                    <span>Telefon: <strong>{profileStaff.phone || "-"}</strong></span>
                    <span>SGK kodu: <strong>{profileStaff.socialSecurityCode || "-"}</strong></span>
                    <span>Vardiya: <strong>{profileStaff.shiftType || "-"}</strong></span>
                    <span>Durum: <strong>{profileStaff.active ? "Aktif" : "Pasif"}</strong></span>
                  </div>
                </section>

                <section className="metric-row" aria-label="Personel profil özeti">
                  <Metric label="Kayıt" value={profileStats.total} />
                  <Metric label="Geldi" value={profileStats.present} tone="green" />
                  <Metric label="Geç" value={profileStats.late} tone="amber" />
                  <Metric label="Gelmedi" value={profileStats.absent} tone="red" />
                  <Metric label="İzinli" value={profileStats.excused} tone="blue" />
                  <Metric label="Gecikme Dk" value={profileStats.lateMinutes} tone="amber" />
                </section>

                <section className="data-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Personel Geçmişi</h2>
                      <span>{reportStart} - {reportEnd}</span>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tarih</th>
                          <th>Giriş</th>
                          <th>Gecikme</th>
                          <th>Durum</th>
                          <th>Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileRows.map((record) => (
                          <tr key={record.id} className={getStatusRowClass(record.status)}>
                            <td>{record.date}</td>
                            <td>{record.checkInTime || "-"}</td>
                            <td>
                              <span className={`late-badge late-${getLateTone(getRecordLateMinutes(record, settings))}`}>
                                {getRecordLateMinutes(record, settings) || "-"}
                              </span>
                            </td>
                            <td><StatusPill status={record.status} /></td>
                            <td>{record.lateReason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!profileRows.length && <div className="empty-state">Bu tarih aralığında profil kaydı yok. Getir veya Bu Ay butonunu kullanın.</div>}
                </section>
              </>
            )}
          </main>
        )}

        {activeTab === "bulk" && (
          <main className="workspace two-column">
            <section className="data-panel form-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <h2>Toplu İşlem</h2>
                  <span>{bulkSelectedIds.length} personel seçili</span>
                </div>
              </div>

              <label>
                Tarih
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                Durum
                <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as AttendanceStatus)}>
                  <option value="absent">Gelmedi</option>
                  <option value="excused">İzinli</option>
                  <option value="present">Geldi</option>
                  <option value="late">Geç</option>
                </select>
              </label>
              {(bulkStatus === "present" || bulkStatus === "late") && (
                <label>
                  Giriş Saati
                  <input type="time" value={bulkCheckInTime} onChange={(event) => setBulkCheckInTime(event.target.value)} />
                </label>
              )}
              <label>
                Açıklama
                <input value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder="Toplu işlem açıklaması" />
              </label>
              <button className="primary-action" onClick={() => void handleBulkAttendance()} disabled={busy || !bulkSelectedIds.length || selectedDayLocked}>
                <Save size={18} aria-hidden="true" />
                Günlük Durum Ata
              </button>

              <div className="bulk-divider" />

              <label>
                Yeni Departman
                <input value={bulkTargetDepartment} onChange={(event) => setBulkTargetDepartment(event.target.value)} placeholder="Departman adı" />
              </label>
              <button className="secondary-action" onClick={() => void handleBulkDepartmentUpdate()} disabled={busy || !bulkSelectedIds.length}>
                Departmanı Değiştir
              </button>
              <div className="button-row">
                <button className="secondary-action" onClick={() => void handleBulkActiveUpdate(false)} disabled={busy || !bulkSelectedIds.length}>
                  Pasife Al
                </button>
                <button className="secondary-action" onClick={() => void handleBulkActiveUpdate(true)} disabled={busy || !bulkSelectedIds.length}>
                  Aktife Al
                </button>
              </div>
            </section>

            <section className="data-panel">
              <div className="list-tools">
                <label className="wide-filter">
                  Arama
                  <div className="input-with-icon compact-input">
                    <Search size={17} aria-hidden="true" />
                    <input value={bulkSearch} onChange={(event) => setBulkSearch(event.target.value)} placeholder="Personel ara" />
                  </div>
                </label>
                <label>
                  Departman
                  <select value={bulkDepartment} onChange={(event) => setBulkDepartment(event.target.value)}>
                    <option value="all">Tümü</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-action" onClick={toggleBulkVisibleStaff}>
                  <CheckSquare size={18} aria-hidden="true" />
                  Görünenleri Seç
                </button>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seç</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Ünvan</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkVisibleStaff.map((member) => (
                      <tr key={member.id} className={!member.active ? "is-muted" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={bulkSelectedIds.includes(member.id)}
                            onChange={() => toggleBulkStaff(member.id)}
                            aria-label={`${member.name} seç`}
                          />
                        </td>
                        <td>
                          <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                            <strong>{member.name}</strong>
                            <span>{member.startDate || "-"}</span>
                          </button>
                        </td>
                        <td>{member.department}</td>
                        <td>{member.title}</td>
                        <td><span className="status-toggle">{member.active ? "Aktif" : "Pasif"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "staff" && (
          <main className="workspace two-column">
            <section className="data-panel form-panel">
              <form onSubmit={handleAddStaff} className="staff-form">
                <div className="panel-heading compact-heading">
                  <div>
                    <h2>Yeni Personel</h2>
                    <span>Liste alfabetik sıralanır</span>
                  </div>
                </div>
                <label>
                  Ad Soyad
                  <input
                    value={newStaff.name}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Departman
                  <input
                    value={newStaff.department}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, department: event.target.value }))}
                  />
                </label>
                <label>
                  Ünvan
                  <input
                    value={newStaff.title}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, title: event.target.value }))}
                  />
                </label>
                <label>
                  T.C. Kimlik No
                  <input
                    value={newStaff.nationalId}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, nationalId: event.target.value }))}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Telefon
                  <input
                    value={newStaff.phone}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, phone: event.target.value }))}
                    inputMode="tel"
                  />
                </label>
                <label>
                  SGK Görev Kodu
                  <input
                    value={newStaff.socialSecurityCode}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, socialSecurityCode: event.target.value }))}
                  />
                </label>
                <label>
                  Vardiya
                  <input
                    value={newStaff.shiftType}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, shiftType: event.target.value }))}
                    placeholder="09:00 - 18:00"
                  />
                </label>
                <label>
                  İşe Giriş
                  <input
                    type="date"
                    value={newStaff.startDate}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, startDate: event.target.value }))}
                  />
                </label>
                <label>
                  İşten Çıkış
                  <input
                    type="date"
                    value={newStaff.endDate}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, endDate: event.target.value }))}
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={newStaff.showOnSignatureSheet}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, showOnSignatureSheet: event.target.checked }))}
                  />
                  <span>İmza föyünde göster</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={newStaff.fixedStaff}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, fixedStaff: event.target.checked }))}
                  />
                  <span>Sabit personel</span>
                </label>
                <button className="primary-action" type="submit" disabled={busy}>
                  <Plus size={18} aria-hidden="true" />
                  Ekle
                </button>
              </form>

              {editingStaff && (
                <form onSubmit={handleUpdateStaff} className="staff-form edit-form">
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Personel Düzenle</h2>
                      <span>{editingStaff.name}</span>
                    </div>
                  </div>
                  <label>
                    Ad Soyad
                    <input
                      value={editingStaff.name}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, name: event.target.value } : previous)}
                      required
                    />
                  </label>
                  <label>
                    Departman
                    <input
                      value={editingStaff.department}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, department: event.target.value } : previous)}
                    />
                  </label>
                  <label>
                    Ünvan
                    <input
                      value={editingStaff.title}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, title: event.target.value } : previous)}
                    />
                  </label>
                  <label>
                    T.C. Kimlik No
                    <input
                      value={editingStaff.nationalId ?? ""}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, nationalId: event.target.value } : previous)}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    Telefon
                    <input
                      value={editingStaff.phone ?? ""}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, phone: event.target.value } : previous)}
                      inputMode="tel"
                    />
                  </label>
                  <label>
                    SGK Görev Kodu
                    <input
                      value={editingStaff.socialSecurityCode ?? ""}
                      onChange={(event) =>
                        setEditingStaff((previous) => previous ? { ...previous, socialSecurityCode: event.target.value } : previous)
                      }
                    />
                  </label>
                  <label>
                    Vardiya
                    <input
                      value={editingStaff.shiftType ?? ""}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, shiftType: event.target.value } : previous)}
                      placeholder="09:00 - 18:00"
                    />
                  </label>
                  <label>
                    İşe Giriş
                    <input
                      type="date"
                      value={editingStaff.startDate ?? ""}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, startDate: event.target.value } : previous)}
                    />
                  </label>
                  <label>
                    İşten Çıkış
                    <input
                      type="date"
                      value={editingStaff.endDate ?? ""}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, endDate: event.target.value } : previous)}
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={editingStaff.showOnSignatureSheet !== false}
                      onChange={(event) =>
                        setEditingStaff((previous) => previous ? { ...previous, showOnSignatureSheet: event.target.checked } : previous)
                      }
                    />
                    <span>İmza föyünde göster</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={Boolean(editingStaff.fixedStaff)}
                      onChange={(event) =>
                        setEditingStaff((previous) => previous ? { ...previous, fixedStaff: event.target.checked } : previous)
                      }
                    />
                    <span>Sabit personel</span>
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Güncelle
                    </button>
                    <button className="secondary-action" type="button" onClick={() => setEditingStaff(null)}>
                      <X size={18} aria-hidden="true" />
                      Vazgeç
                    </button>
                  </div>
                </form>
              )}

              <div className="import-box">
                <label>
                  Toplu Personel
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    rows={9}
                    placeholder="Ad Soyad;Departman;Unvan;Ise Giris;Isten Cikis;Imza Foyunde Goster;Sabit Personel;TC Kimlik;Telefon;SGK Gorev Kodu;Vardiya"
                  />
                </label>
                <label>
                  <span className="label-with-icon">
                    <FileUp size={16} aria-hidden="true" />
                    Excel CSV Dosyası
                  </span>
                  <input type="file" accept=".csv,.txt" onChange={(event) => void handleImportStaffFile(event.target.files?.[0] ?? null)} />
                </label>
                <div className="button-row">
                  <button className="secondary-action" onClick={() => void handleImportStaff()} disabled={busy}>
                    <Upload size={18} aria-hidden="true" />
                    Aktar
                  </button>
                  <button className="secondary-action" onClick={() => void handleSeedStaff()} disabled={busy}>
                    <Users size={18} aria-hidden="true" />
                    85 Şablon
                  </button>
                </div>
              </div>
            </section>

            <section className="data-panel">
              <div className="list-tools">
                <label className="wide-filter">
                  Arama
                  <div className="input-with-icon compact-input">
                    <Search size={17} aria-hidden="true" />
                    <input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Personel ara" />
                  </div>
                </label>
                <label>
                  Departman
                  <select value={staffDepartment} onChange={(event) => setStaffDepartment(event.target.value)}>
                    <option value="all">Tümü</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="panel-heading compact-heading">
                <div>
                  <h2>Personel Listesi</h2>
                  <span>{regularStaffList.length} personel</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>İşe Giriş</th>
                      <th>İşten Çıkış</th>
                      <th>İmza Föyü</th>
                      <th>Durum</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {regularStaffList.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty-cell">Bu filtrede normal personel bulunamadı.</td>
                      </tr>
                    )}
                    {regularStaffList.map((member, index) => (
                      <tr key={member.id} className={!member.active ? "is-muted" : ""}>
                        <td className="number-cell">{index + 1}</td>
                        <td>
                          <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                            <strong>{member.name}</strong>
                            <span>{member.title}</span>
                          </button>
                        </td>
                        <td>{member.department}</td>
                        <td>{member.startDate}</td>
                        <td>{member.endDate}</td>
                        <td>
                          <span className={`status-pill ${member.showOnSignatureSheet === false ? "status-empty" : "status-present"}`}>
                            {member.showOnSignatureSheet === false ? "Gizli" : "Göster"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => handleStartEditStaff(member)} title="Düzenle" aria-label={`${member.name} düzenle`}>
                              <Edit3 size={17} />
                            </button>
                            <button className="status-toggle" onClick={() => void handleToggleStaff(member)}>
                              {member.active ? "Aktif" : "Pasif"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="icon-button danger"
                            onClick={() => void handleDeleteStaff(member)}
                            title="Personeli sil"
                            aria-label={`${member.name} personelini sil`}
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderStaffTable(fixedStaffList, "Sabit Personel", "Bu filtrede sabit personel bulunamadı.")}
            </section>
          </main>
        )}

        {activeTab === "settings" && (
          <main className="workspace">
            <section className="settings-grid">
              <label>
                Firma Adı
                <input value={settings.companyName} onChange={(event) => updateSettings({ companyName: event.target.value })} />
              </label>
              <label>
                Föy Başlığı
                <input value={settings.formTitle} onChange={(event) => updateSettings({ formTitle: event.target.value })} />
              </label>
              <label>
                Mesai Başlangıcı
                <input
                  type="time"
                  value={settings.shiftStart}
                  onChange={(event) => updateSettings({ shiftStart: event.target.value })}
                />
              </label>
              <label>
                Geç Kalma Toleransı
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.lateAfterMinutes}
                  onChange={(event) => updateSettings({ lateAfterMinutes: Number(event.target.value) })}
                />
              </label>
              <label>
                Sayfa Başına Satır
                <input
                  type="number"
                  min="35"
                  max="48"
                  value={settings.rowsPerPrintSide}
                  onChange={(event) => updateSettings({ rowsPerPrintSide: Number(event.target.value) })}
                />
              </label>
              <label>
                Tema
                <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as AppSettings["theme"] })}>
                  <option value="light">Açık</option>
                  <option value="dark">Koyu</option>
                </select>
              </label>
              <div className="firebase-card">
                <span>Firebase</span>
                <strong>{firebaseConfigured ? firebaseProjectId : "Config bekliyor"}</strong>
              </div>
              <div className="firebase-card backup-card">
                <span>Yedekleme</span>
                <strong>JSON</strong>
                <button className="secondary-action" type="button" onClick={() => void handleDownloadBackup()} disabled={busy}>
                  <Database size={18} aria-hidden="true" />
                  Yedek İndir
                </button>
              </div>
            </section>
            <section className="data-panel">
              <div className="panel-heading">
                <div>
                  <h2>Silinen Kayıtlar</h2>
                  <span>Yanlış silinen günlük kayıtları geri yükleyin</span>
                </div>
                <button className="secondary-action" onClick={() => void refreshDeletedAttendance()}>
                  <RefreshCw size={18} aria-hidden="true" />
                  Yenile
                </button>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Silinme</th>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {deletedAttendance.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.deletedAt).toLocaleString("tr-TR")}</td>
                        <td>{item.record.date}</td>
                        <td>
                          <strong>{item.staffName}</strong>
                          <span>{item.deletedBy ?? ""}</span>
                        </td>
                        <td><StatusPill status={item.record.status} /></td>
                        <td>{item.record.lateReason}</td>
                        <td>
                          <button className="secondary-action" onClick={() => void handleRestoreDeletedAttendance(item)} disabled={busy}>
                            <ArchiveRestore size={18} aria-hidden="true" />
                            Geri Yükle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!deletedAttendance.length && <div className="empty-state">Silinen kayıt bulunmuyor.</div>}
            </section>
            <section className="data-panel">
              <div className="panel-heading">
                <div>
                  <h2>Değişiklik Geçmişi</h2>
                  <span>Son işlemler</span>
                </div>
                <button className="secondary-action" onClick={() => void refreshAuditLogs()}>
                  <History size={18} aria-hidden="true" />
                  Yenile
                </button>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>İşlem</th>
                      <th>Detay</th>
                      <th>Kullanıcı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.createdAt).toLocaleString("tr-TR")}</td>
                        <td>{log.action}</td>
                        <td>{log.detail}</td>
                        <td>{log.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}
          {selectedStaffInsight && (
            <div className="floating-staff-card">
              <StaffInsightPanel insight={selectedStaffInsight} onClose={() => setSelectedStaffId("")} />
            </div>
          )}
        </div>
      </div>

      <div className="print-area" aria-hidden="true">
        {printMode === "incapacity" ? (
          <IncapacityPrintReport
            records={incapacityRowsForMonth}
            staffById={staffById}
            stats={incapacityStats}
            reportMonth={incapacityReportMonth}
          />
        ) : printMode === "holidayWork" ? (
          <HolidayWorkPrintReport
            groups={holidayWorkGroups}
            staffById={staffById}
            stats={holidayWorkStats}
            reportMonth={holidayReportMonth}
          />
        ) : printMode === "annualLeave" ? (
          <LeavePrintReport
            records={annualLeaveRowsForMonth}
            staffById={staffById}
            stats={annualLeaveReportStats}
            reportMonth={annualLeaveReportMonth}
            title="Yıllık İzin Raporu"
          />
        ) : printMode === "unpaidLeave" ? (
          <LeavePrintReport
            records={unpaidLeaveRowsForMonth}
            staffById={staffById}
            stats={unpaidLeaveReportStats}
            reportMonth={unpaidLeaveReportMonth}
            title="Ücretsiz İzin Raporu"
          />
        ) : (
          printPages.map((pageStaff, index) => (
            <SheetPage
              key={`print-${index}-${pageStaff.length}`}
              staff={pageStaff}
              startNumber={index * settings.rowsPerPrintSide}
              pageIndex={index}
              pageCount={printPages.length}
              selectedDate={selectedDate}
              settings={settings}
            />
          ))
        )}
      </div>
    </>
  );
}

function IncapacityPrintReport({
  records,
  staffById,
  stats,
  reportMonth,
}: {
  records: IncapacityReportRecord[];
  staffById: Map<string, StaffMember>;
  stats: { total: number; active: number; days: number };
  reportMonth: string;
}) {
  const sortedRecords = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate) || (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr"));

  return (
    <article className="holiday-report-page">
      <header className="holiday-report-header">
        <div>
          <strong>{formatMonthTr(reportMonth)} İş Göremezlik Raporu</strong>
          <span>{new Date().toLocaleString("tr-TR")} tarihinde oluşturuldu</span>
        </div>
        <FileSpreadsheet size={26} aria-hidden="true" />
      </header>
      <section className="holiday-report-summary">
        <div>
          <span>Rapor</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <span>Aktif</span>
          <strong>{stats.active}</strong>
        </div>
        <div>
          <span>Toplam Gün</span>
          <strong>{stats.days}</strong>
        </div>
        <div>
          <span>Ay</span>
          <strong>{formatMonthTr(reportMonth)}</strong>
        </div>
      </section>
      <table className="holiday-report-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Rapor No</th>
            <th>Personel</th>
            <th>Departman</th>
            <th>Tarih</th>
            <th>Gün</th>
            <th>Neden</th>
            <th>Durum</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {sortedRecords.map((record, index) => {
            const member = staffById.get(record.staffId);
            return (
              <tr key={record.id}>
                <td>{index + 1}</td>
                <td>{record.reportNumber || "-"}</td>
                <td>{member?.name ?? ""}</td>
                <td>{member?.department ?? ""}</td>
                <td>{record.startDate} - {record.endDate}</td>
                <td>{record.dayCount}</td>
                <td>{record.reason}</td>
                <td>{incapacityStatusLabels[record.status]}</td>
                <td>{record.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function HolidayWorkPrintReport({
  groups,
  staffById,
  stats,
  reportMonth,
}: {
  groups: HolidayWorkGroup[];
  staffById: Map<string, StaffMember>;
  stats: { total: number; hours: number; leaveCompensation: number; paidCompensation: number };
  reportMonth: string;
}) {
  const sortedGroups = [...groups].sort((a, b) => a.month.localeCompare(b.month) || (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr"));

  return (
    <article className="holiday-report-page">
      <header className="holiday-report-header">
        <div>
          <strong>{formatMonthTr(reportMonth)} Resmi Tatil Çalışan Raporu</strong>
          <span>{new Date().toLocaleString("tr-TR")} tarihinde oluşturuldu</span>
        </div>
        <CalendarDays size={26} aria-hidden="true" />
      </header>
      <section className="holiday-report-summary">
        <div>
          <span>Kayıt</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <span>Toplam Saat</span>
          <strong>{stats.hours}</strong>
        </div>
        <div>
          <span>Ücret</span>
          <strong>{stats.paidCompensation}</strong>
        </div>
        <div>
          <span>İzin Karşılığı</span>
          <strong>{stats.leaveCompensation}</strong>
        </div>
      </section>
      <table className="holiday-report-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Personel</th>
            <th>Departman</th>
            <th>Ay / Tarihler</th>
            <th>Tatiller</th>
            <th>Saatler</th>
            <th>Toplam</th>
            <th>Karşılık</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((group, index) => {
            const member = staffById.get(group.staffId);
            return (
              <tr key={group.id}>
                <td>{index + 1}</td>
                <td>{member?.name ?? ""}</td>
                <td>{member?.department ?? ""}</td>
                <td>{formatMonthTr(group.month)} / {group.dates.join(", ")}</td>
                <td>{group.holidayNames.join(", ")}</td>
                <td>{group.timeRanges.join(", ")}</td>
                <td>{group.hours}</td>
                <td>{group.compensationSummary}</td>
                <td>{group.notes.join(" / ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function LoginScreen({
  email,
  password,
  error,
  busy,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="auth-page screen-only">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-brand">
          <img className="brand-logo login-logo" src={BRAND_LOGO_SRC} alt="Personel imza rapor logosu" />
          <div>
            <p className="eyebrow">Yönetici girişi</p>
            <h1>Personel Devam Sistemi</h1>
          </div>
        </div>

        <label>
          E-posta
          <div className="input-with-icon">
            <Mail size={17} aria-hidden="true" />
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
        </label>

        <label>
          Şifre
          <div className="input-with-icon">
            <Lock size={17} aria-hidden="true" />
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </label>

        {error && <div className="form-error">{error}</div>}

        <button className="primary-action login-action" type="submit" disabled={busy}>
          <KeyRound size={18} aria-hidden="true" />
          {busy ? "Giriş yapılıyor" : "Giriş Yap"}
        </button>

        <div className="login-meta">
          <Database size={16} aria-hidden="true" />
          Firebase {firebaseProjectId}
        </div>
      </form>
    </main>
  );
}

function AuthStatusScreen({
  title,
  email,
  onSignOut,
}: {
  title: string;
  email?: string | null;
  onSignOut?: () => void;
}) {
  return (
    <main className="auth-page screen-only">
      <section className="login-panel auth-status-panel">
        <img className="brand-logo login-logo" src={BRAND_LOGO_SRC} alt="Personel imza rapor logosu" />
        <div>
          <p className="eyebrow">Personel devam sistemi</p>
          <h1>{title}</h1>
        </div>
        {email && <div className="login-meta">{email}</div>}
        {onSignOut && (
          <button className="secondary-action login-action" onClick={onSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Çıkış
          </button>
        )}
      </section>
    </main>
  );
}

function AccessDeniedScreen({ email, onSignOut, busy }: { email: string | null; onSignOut: () => void; busy: boolean }) {
  return (
    <main className="auth-page screen-only">
      <section className="login-panel auth-status-panel">
        <img className="brand-logo login-logo" src={BRAND_LOGO_SRC} alt="Personel imza rapor logosu" />
        <div>
          <p className="eyebrow">Yetki gerekli</p>
          <h1>Bu hesap yönetici değil</h1>
        </div>
        <p className="auth-copy">{email} hesabı için Firestore `admins` yetkisi bulunamadı.</p>
        <button className="secondary-action login-action" onClick={onSignOut} disabled={busy}>
          <LogOut size={18} aria-hidden="true" />
          Çıkış
        </button>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" | "blue" }) {
  return (
    <div className={`metric ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status }: { status: AttendanceStatus | "" }) {
  return <span className={`status-pill status-${status || "empty"}`}>{status ? statusLabels[status] : "Boş"}</span>;
}

function DailyDashboard({
  selectedDate,
  shiftStart,
  lateAfterMinutes,
  activeStaffCount,
  dailyStats,
  dailyEmptyCount,
  dailyProgress,
  isHoliday,
  isLocked,
  lastAuditLog,
}: {
  selectedDate: string;
  shiftStart: string;
  lateAfterMinutes: number;
  activeStaffCount: number;
  dailyStats: { processed: number; present: number; late: number; absent: number; excused: number };
  dailyEmptyCount: number;
  dailyProgress: number;
  isHoliday: boolean;
  isLocked: boolean;
  lastAuditLog: AuditLogRecord | null;
}) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-main">
        <span className="section-kicker">
          <LayoutDashboard size={17} aria-hidden="true" />
          Günlük kontrol
        </span>
        <h2>{formatDateTr(selectedDate)}</h2>
        <p>
          Mesai {shiftStart}, tolerans {lateAfterMinutes} dk. {isHoliday ? "Pazar resmi tatil." : "Normal çalışma günü."}
        </p>
        <div className="progress-track" aria-label="Günlük kayıt ilerlemesi">
          <span style={{ width: `${dailyProgress}%` }} />
        </div>
        <div className="dashboard-flags">
          <span className={isLocked ? "flag is-locked" : "flag is-open"}>{isLocked ? "Gün kilitli" : "Gün açık"}</span>
          <span className={isHoliday ? "flag is-holiday" : "flag"}>{isHoliday ? "Resmi tatil" : "Mesai günü"}</span>
          <span className="flag">{dailyProgress}% işlendi</span>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MiniStat label="Personel" value={activeStaffCount} tone="blue" />
        <MiniStat label="İşlenen" value={dailyStats.processed} tone="green" />
        <MiniStat label="Eksik" value={dailyEmptyCount} tone="amber" />
        <MiniStat label="Geç" value={dailyStats.late} tone="red" />
      </div>
      <div className="dashboard-log">
        <span className="section-kicker">
          <History size={17} aria-hidden="true" />
          Son işlem
        </span>
        {lastAuditLog ? (
          <>
            <strong>{lastAuditLog.action}</strong>
            <small>{new Date(lastAuditLog.createdAt).toLocaleString("tr-TR")}</small>
            <p>{lastAuditLog.detail || lastAuditLog.createdBy}</p>
          </>
        ) : (
          <p>Henüz işlem kaydı yok.</p>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" | "blue" }) {
  return (
    <div className={`mini-stat ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StaffInsightPanel({ insight, onClose, compact = false }: { insight: StaffInsight; onClose: () => void; compact?: boolean }) {
  return (
    <section className={`staff-insight ${compact ? "is-compact" : ""}`}>
      <div className="staff-insight-head">
        <span className="section-kicker">
          <Eye size={17} aria-hidden="true" />
          Personel kartı
        </span>
        <button className="icon-button" onClick={onClose} title="Kapat" aria-label="Personel kartını kapat">
          <X size={17} />
        </button>
      </div>
      <div className="staff-insight-person">
        <strong>{insight.staff.name}</strong>
        <span>{[insight.staff.department, insight.staff.title].filter(Boolean).join(" / ") || "Departman yok"}</span>
        <small>
          {insight.staff.startDate ? `Giriş: ${insight.staff.startDate}` : "Giriş tarihi yok"}
          {insight.staff.endDate ? ` · Çıkış: ${insight.staff.endDate}` : ""}
        </small>
        <small>
          {[insight.staff.phone, insight.staff.nationalId ? `T.C.: ${insight.staff.nationalId}` : "", insight.staff.shiftType]
            .filter(Boolean)
            .join(" · ") || "Ek özlük bilgisi yok"}
        </small>
      </div>
      <div className="staff-insight-grid">
        <MiniStat label="Bugün" value={insight.todayStatus ? 1 : 0} tone={insight.todayStatus === "late" ? "amber" : "blue"} />
        <MiniStat label="Geç Gün" value={insight.counts.late} tone="amber" />
        <MiniStat label="Gelmedi" value={insight.counts.absent} tone="red" />
        <MiniStat label="Gecikme Dk" value={insight.counts.lateMinutes} tone="blue" />
      </div>
      <div className="staff-insight-foot">
        <StatusPill status={insight.todayStatus} />
        <span>{insight.todayDraft.checkInTime || "Giriş yok"}</span>
        <span>{insight.lastRecord ? `Son kayıt: ${insight.lastRecord.date}` : "Rapor kaydı yok"}</span>
      </div>
    </section>
  );
}

function ReportCharts({
  dailyTrendRows,
  departmentRows,
  topAbsentRows,
  onSelectStaff,
}: {
  dailyTrendRows: DailyTrendRow[];
  departmentRows: DepartmentReportRow[];
  topAbsentRows: ReportSummaryRow[];
  onSelectStaff: (id: string) => void;
}) {
  const visibleDays = dailyTrendRows.slice(-31);
  const maxDayTotal = Math.max(1, ...visibleDays.map((row) => row.total));
  const maxDepartmentTotal = Math.max(1, ...departmentRows.map((row) => row.total));

  return (
    <section className="chart-grid">
      <div className="data-panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Günlük Dağılım</h2>
            <span>{visibleDays.length ? `${visibleDays[0].date} - ${visibleDays[visibleDays.length - 1].date}` : "Kayıt yok"}</span>
          </div>
          <Activity size={19} aria-hidden="true" />
        </div>
        <div className="timeline-chart">
          {visibleDays.map((row) => {
            const dominantStatus = row.absent > 0 ? "absent" : row.late > 0 ? "late" : row.excused > 0 ? "excused" : "present";
            return (
              <div className="chart-day" key={row.date} title={`${row.date}: ${row.total} kayıt`}>
                <span className={`chart-bar status-${dominantStatus}`} style={{ height: `${Math.max(8, (row.total / maxDayTotal) * 100)}%` }} />
                <small>{formatShortDate(row.date)}</small>
              </div>
            );
          })}
          {!visibleDays.length && <div className="empty-state">Rapor getirildiğinde grafik oluşur.</div>}
        </div>
      </div>

      <div className="data-panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Departman</h2>
            <span>Gelmedi ve geç yoğunluğu</span>
          </div>
          <PieChart size={19} aria-hidden="true" />
        </div>
        <div className="department-bars">
          {departmentRows.slice(0, 7).map((row) => (
            <div className="department-bar" key={row.department}>
              <div>
                <strong>{row.department}</strong>
                <span>{row.total} kayıt · {row.late} geç · {row.absent} gelmedi</span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(row.total / maxDepartmentTotal) * 100}%` }} />
              </div>
            </div>
          ))}
          {!departmentRows.length && <div className="empty-state">Departman verisi yok.</div>}
        </div>
      </div>

      <div className="data-panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Gelmeyenler</h2>
            <span>Gelmedi kaydı bulunan personel</span>
          </div>
          <TriangleAlert size={19} aria-hidden="true" />
        </div>
        <div className="top-late-list">
          {topAbsentRows.map((row) => (
            <button key={row.staff.id} onClick={() => onSelectStaff(row.staff.id)}>
              <span>
                <strong>{row.staff.name}</strong>
                <small>{row.staff.department}</small>
              </span>
              <b>{row.absent} gelmedi</b>
            </button>
          ))}
          {!topAbsentRows.length && <div className="empty-state">Gelmedi kaydı yok.</div>}
        </div>
      </div>
    </section>
  );
}

function LeavePrintReport({
  records,
  staffById,
  stats,
  reportMonth,
  title,
}: {
  records: AnnualLeaveRecord[];
  staffById: Map<string, StaffMember>;
  stats: { records: number; used: number; planned: number; completed: number; cancelled: number };
  reportMonth: string;
  title: string;
}) {
  const sortedRecords = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate) || (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr"));

  return (
    <article className="holiday-report-page">
      <header className="holiday-report-header">
        <div>
          <strong>{formatMonthTr(reportMonth)} {title}</strong>
          <span>{new Date().toLocaleString("tr-TR")} tarihinde oluşturuldu</span>
        </div>
        <CalendarCheck size={26} aria-hidden="true" />
      </header>
      <section className="holiday-report-summary">
        <div>
          <span>Kayıt</span>
          <strong>{stats.records}</strong>
        </div>
        <div>
          <span>Kullanılan</span>
          <strong>{stats.used}</strong>
        </div>
        <div>
          <span>Planlanan</span>
          <strong>{stats.planned}</strong>
        </div>
        <div>
          <span>Bitti</span>
          <strong>{stats.completed}</strong>
        </div>
      </section>
      <table className="holiday-report-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Personel</th>
            <th>Departman</th>
            <th>Ünvan</th>
            <th>Tür</th>
            <th>Tarih</th>
            <th>Gün</th>
            <th>Durum</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {sortedRecords.map((record, index) => {
            const member = staffById.get(record.staffId);
            return (
              <tr key={record.id}>
                <td>{index + 1}</td>
                <td>{member?.name ?? ""}</td>
                <td>{member?.department ?? ""}</td>
                <td>{member?.title ?? ""}</td>
                <td>{annualLeaveTypeLabels[record.leaveType]}</td>
                <td>{record.startDate} - {record.endDate}</td>
                <td>{record.usedDays}</td>
                <td>{getLeaveDisplayStatus(record)}</td>
                <td>{record.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function PrintPreviewOverview({
  pageCount,
  staffCount,
  rowsPerPrintSide,
  shiftStart,
  selectedDate,
  pages,
}: {
  pageCount: number;
  staffCount: number;
  rowsPerPrintSide: number;
  shiftStart: string;
  selectedDate: string;
  pages: StaffMember[][];
}) {
  return (
    <section className="print-preview-overview">
      <div className="panel-heading">
        <div>
          <h2>Yazdırma Önizlemesi</h2>
          <span>{formatDateTr(selectedDate)}</span>
        </div>
        <Printer size={19} aria-hidden="true" />
      </div>
      <div className="preview-stat-grid">
        <MiniStat label="Sayfa" value={pageCount} tone="blue" />
        <MiniStat label="Personel" value={staffCount} tone="green" />
        <MiniStat label="Satır/Yüz" value={rowsPerPrintSide} tone="amber" />
        <div className="mini-stat">
          <span>Mesai</span>
          <strong>{shiftStart}</strong>
        </div>
      </div>
      <div className="duplex-map">
        {pages.map((page, index) => (
          <div className="duplex-page" key={`${index}-${page.length}`}>
            <span>{index + 1}</span>
            <strong>{index === 0 ? "Ön yüz" : index === 1 ? "Arka yüz" : `${index + 1}. sayfa`}</strong>
            <small>{page.length} satır</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function SheetPage({
  staff,
  startNumber,
  pageIndex,
  pageCount,
  selectedDate,
  settings,
  preview = false,
}: {
  staff: StaffMember[];
  startNumber: number;
  pageIndex: number;
  pageCount: number;
  selectedDate: string;
  settings: AppSettings;
  preview?: boolean;
}) {
  return (
    <article className={`sheet-page ${preview ? "is-preview" : ""}`}>
      <header className="sheet-header">
        <div className="sheet-brand">
          <img className="sheet-logo" src={BRAND_LOGO_SRC} alt="Logo" />
          <div>
            <strong>{settings.companyName}</strong>
            <span>{settings.formTitle}</span>
          </div>
        </div>
        <div>
          <strong>{formatDateTr(selectedDate)}</strong>
          <span>
            Mesai {settings.shiftStart} / {pageIndex === 0 ? "Ön yüz" : pageIndex === 1 ? "Arka yüz" : `${pageIndex + 1}. sayfa`}
          </span>
        </div>
      </header>

      <table className="signature-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Ad Soyad</th>
            <th>Ünvan</th>
            <th>Departman</th>
            <th>Giriş Saati</th>
            <th>İmza</th>
            <th>Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member, index) => (
            <tr key={member.id}>
              <td>{startNumber + index + 1}</td>
              <td className="signature-name-cell">
                <strong>{member.name}</strong>
              </td>
              <td>{member.title}</td>
              <td>{member.department}</td>
              <td>{settings.shiftStart}</td>
              <td />
              <td />
            </tr>
          ))}
          {pageIndex === pageCount - 1 &&
            Array.from({ length: EXTRA_SIGNATURE_ROWS }, (_, index) => (
              <tr key={`extra-${index}`} className="extra-signature-row">
                <td>Ek-{index + 1}</td>
                <td />
                <td />
                <td />
                <td>{settings.shiftStart}</td>
                <td />
                <td />
              </tr>
            ))}
        </tbody>
      </table>

      <footer className="sheet-footer">
        <span>Sayfa {pageIndex + 1} / {pageCount}</span>
        <span>Toplam satır: {staff.length}</span>
      </footer>
    </article>
  );
}

export default App;
