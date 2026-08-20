import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArchiveRestore,
  BarChart3,
  Cake,
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
  Grid3X3,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Moon,
  MoreVertical,
  PieChart,
  Plane,
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
  deleteHourlyLeaveRecord,
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
  loadDayLocks,
  loadDeletedAttendance,
  loadHolidayWorkRecords,
  loadHourlyLeaveRecords,
  loadIncapacityReports,
  loadAppSettings,
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
  saveHourlyLeaveRecord,
  saveIncapacityReport,
  saveAppSettings,
  savePrintArchive,
  saveStaffMember,
  saveStaffMembers,
  restoreBackup,
  signInAdmin,
  signOutAdmin,
  type AdminUser,
} from "./lib/repository";
import { defaultSettings, loadSettings, saveSettings } from "./lib/settings";
import { buildAppNavigationSearch, parseAppNavigation } from "./lib/navigation";
import { formatHourlyLeaveFormDuration, getHourlyLeaveEndDate } from "./lib/hourlyLeaveForm";
import {
  findIncapacityReportForDate,
  getIncapacityReminderTone,
  getIncapacityWorkDates,
} from "./lib/incapacity";
import { getStaffDepartureLabel, shouldIncludeUnpaidLeaveInMonth } from "./lib/staffDeparture";
import { getUnpaidLeaveAutomaticStatus } from "./lib/unpaidLeave";
import { getSignatureSheetExplanation } from "./lib/signatureSheet";
import {
  getAttendanceSummary,
  getConsecutiveAbsenceRows,
  getDepartmentComparisonRows,
  getEarlyExitRows,
  getExpectedWorkdays,
  getLeaveDensityRows,
  getLeaveReportSummary,
  getMonthlyWorkforceTrend,
  getWorkforceSummary,
  type MonthlyWorkforceTrend,
} from "./lib/hrReports";
import { getBirthdayTimingLabel, getUpcomingBirthdays } from "./lib/birthday";
import {
  calculateAnnualEntitlementForServiceYear,
  calculateAnnualEntitlementFromStartDate,
  calculateAnnualLeaveYearBalances,
  calculateProfileLeaveStats,
  getAnnualLeaveEligibleStaff,
  getAnnualLeaveEntitlementDate,
  sortProfileHistoryNewestFirst,
} from "./lib/profile";
import type {
  AnnualLeaveRecord,
  AnnualLeaveType,
  AppBackup,
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
  AuditLogRecord,
  DayLockRecord,
  DeletedAttendanceRecord,
  HourlyLeaveRecord,
  HourlyLeaveStatus,
  HolidayCompensationType,
  HolidayWorkRecord,
  IncapacityReportRecord,
  IncapacityReportType,
  IncapacityStatus,
  LeaveStatus,
  PrintArchiveRecord,
  StaffMember,
} from "./types";

type TabKey =
  | "home"
  | "daily"
  | "print"
  | "reports"
  | "incapacity"
  | "holidayWork"
  | "hourlyLeave"
  | "annualLeave"
  | "unpaidLeave"
  | "profiles"
  | "bulk"
  | "staff"
  | "settings";
type AccessState = "idle" | "checking" | "allowed" | "denied";
type PrintMode = "signature" | "holidayWork" | "incapacity" | "annualLeave" | "unpaidLeave" | "hourlyLeave";
type ReportView = "overview" | "movements" | "attendance" | "leave" | "departments";
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
type LeaveGroup = {
  id: string;
  staffId: string;
  year: number;
  leaveType: AnnualLeaveType;
  records: AnnualLeaveRecord[];
  dateRanges: string[];
  usedDays: number;
  statusSummary: string;
  notes: string[];
};
type HourlyLeaveFormState = {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: HourlyLeaveStatus;
  notes: string;
};
type HourlyLeaveGroup = {
  id: string;
  staffId: string;
  records: HourlyLeaveRecord[];
  dates: string[];
  timeRanges: string[];
  minutes: number;
  statusSummary: string;
  reasons: string[];
  notes: string[];
};
type ProfileHistoryEvent = {
  id: string;
  date: string;
  sortDate: string;
  category: string;
  action: string;
  detail: string;
};
type ProfileExportTable = {
  staffName: string;
  staffDetails: Array<{ label: string; value: string }>;
  title: string;
  subtitle: string;
  notice?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};
type StaffInsight = {
  staff: StaffMember;
  counts: StatusCounts;
  todayDraft: DraftRecord;
  todayStatus: AttendanceStatus | "";
  lastRecord: AttendanceRecord | null;
};

type NavigationTab = { key: TabKey; label: string; icon: typeof CalendarCheck };

const tabs: NavigationTab[] = [
  { key: "home", label: "Ana Sayfa", icon: LayoutDashboard },
  { key: "daily", label: "Günlük Kayıt", icon: CalendarCheck },
  { key: "print", label: "İmza Föyü", icon: Printer },
  { key: "reports", label: "Raporlar", icon: BarChart3 },
  { key: "incapacity", label: "İş Göremezlik Raporu", icon: FileSpreadsheet },
  { key: "holidayWork", label: "Resmi Tatil Çalışan", icon: CalendarDays },
  { key: "hourlyLeave", label: "Saatlik İzin", icon: CalendarCheck },
  { key: "annualLeave", label: "Yıllık İzin Takibi", icon: CalendarCheck },
  { key: "unpaidLeave", label: "Ücretsiz İzin", icon: CalendarCheck },
  { key: "profiles", label: "Profil", icon: UserRound },
  { key: "bulk", label: "Toplu İşlem", icon: CheckSquare },
  { key: "staff", label: "Personel", icon: Users },
  { key: "settings", label: "Ayarlar", icon: Settings },
];
const tabKeys = tabs.map((tab) => tab.key);

function NavigationTabs({
  className,
  activeTab,
  onSelect,
}: {
  className: string;
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
}) {
  return (
    <nav className={className} aria-label="Ana bölümler">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "is-active" : ""}
            onClick={() => onSelect(tab.key)}
            title={tab.label}
            type="button"
          >
            <Icon size={18} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

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
const incapacityReportTypeLabels: Record<IncapacityReportType, string> = {
  illness: "Hastalık",
  work_accident: "İş kazası",
  maternity: "Analık",
  occupational_disease: "Meslek hastalığı",
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
  completed: "Bitti",
  cancelled: "İptal",
};
const departureTypeLabels: Record<string, string> = {
  resignation: "İstifa",
  employer_termination: "İşveren feshi",
  retirement: "Emeklilik",
  military: "Askerlik",
  contract_end: "Sözleşme bitişi",
  other: "Diğer",
};
const hourlyLeaveStatusLabels: Record<HourlyLeaveStatus, string> = {
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
const HOURLY_LEAVE_WORKDAY_MINUTES = 8 * 60;
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

function shiftIsoMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return isoFromUtcDate(target);
}

function shiftIsoYears(date: string, years: number) {
  const [year, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function getReportComparisonRanges(startDate: string, endDate: string) {
  return {
    previousMonth: { start: shiftIsoMonths(startDate, -1), end: shiftIsoMonths(endDate, -1) },
    previousYear: { start: shiftIsoYears(startDate, -1), end: shiftIsoYears(endDate, -1) },
  };
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

function filterReportAttendance(
  records: AttendanceRecord[],
  staffById: Map<string, StaffMember>,
  staffId: string,
  department: string,
) {
  return records.filter((record) => {
    const member = staffById.get(record.staffId);
    return (staffId === "all" || record.staffId === staffId) && (department === "all" || member?.department === department);
  });
}

function getMetricDelta(current: number, previous: number) {
  const difference = Number((current - previous).toFixed(1));
  const percentage = previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : current ? 100 : 0;
  return { difference, percentage };
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

function getAnnualEntitlementForStaff(
  staffId: string,
  year: number,
  records: AnnualLeaveRecord[],
  staffById: Map<string, StaffMember>,
) {
  const staffMember = staffById.get(staffId);
  const calculatedEntitlement = calculateAnnualEntitlementFromStartDate(
    staffMember?.startDate,
    year,
    todayIso(),
    staffMember?.endDate,
  );
  if (calculatedEntitlement <= 0) return 0;

  const existingEntitlements = records
    .filter((record) => record.staffId === staffId && record.year === year && record.leaveType === "annual" && record.entitlementDays > 0)
    .map((record) => record.entitlementDays);

  if (existingEntitlements.length) return Math.max(...existingEntitlements);
  return calculatedEntitlement;
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

function calculateHourlyLeaveMinutes(startTime: string, endTime: string) {
  if (!startTime || !endTime) return 0;
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  const grossMinutes = Math.max(0, end - start);
  const breakMinutes = grossMinutes >= 7.5 * 60 ? 60 : 0;
  return Math.max(0, grossMinutes - breakMinutes);
}

function getHourlyLeaveNetMinutes(record: HourlyLeaveRecord) {
  return calculateHourlyLeaveMinutes(record.startTime, record.endTime) || record.minutes || 0;
}

function formatLeaveDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours} sa ${remainingMinutes} dk`;
  if (hours) return `${hours} sa`;
  return `${remainingMinutes} dk`;
}

function getHourlyLeaveDays(minutes: number) {
  return Math.round((minutes / HOURLY_LEAVE_WORKDAY_MINUTES) * 100) / 100;
}

function formatLeaveDayValue(minutes: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(getHourlyLeaveDays(minutes));
}

function groupHourlyLeaveRecords(records: HourlyLeaveRecord[], staffById: Map<string, StaffMember>): HourlyLeaveGroup[] {
  const grouped = new Map<string, HourlyLeaveGroup>();

  records.forEach((record) => {
    const netMinutes = record.status === "cancelled" ? 0 : getHourlyLeaveNetMinutes(record);
    const current =
      grouped.get(record.staffId) ??
      {
        id: record.staffId,
        staffId: record.staffId,
        records: [],
        dates: [],
        timeRanges: [],
        minutes: 0,
        statusSummary: "",
        reasons: [],
        notes: [],
      };

    current.records.push(record);
    current.dates.push(record.date);
    current.timeRanges.push(`${record.date} ${record.startTime}-${record.endTime}`);
    current.minutes += netMinutes;
    if (record.reason.trim()) current.reasons.push(record.reason.trim());
    if (record.notes.trim()) current.notes.push(record.notes.trim());
    grouped.set(record.staffId, current);
  });

  return Array.from(grouped.values())
    .map((group) => {
      const statusCounts = group.records.reduce<Record<HourlyLeaveStatus, number>>(
        (counts, record) => ({ ...counts, [record.status]: counts[record.status] + 1 }),
        { planned: 0, used: 0, cancelled: 0 },
      );
      const summaryParts = [
        statusCounts.used ? `${statusCounts.used} kullanılan` : "",
        statusCounts.planned ? `${statusCounts.planned} planlanan` : "",
        statusCounts.cancelled ? `${statusCounts.cancelled} iptal` : "",
      ].filter(Boolean);

      return {
        ...group,
        dates: uniqueValues(group.dates).sort((a, b) => a.localeCompare(b)),
        timeRanges: group.timeRanges.sort((a, b) => a.localeCompare(b)),
        statusSummary: summaryParts.join(", ") || "-",
        reasons: uniqueValues(group.reasons),
        notes: uniqueValues(group.notes),
      };
    })
    .sort(
      (a, b) =>
        (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr", { sensitivity: "base" }) ||
        a.staffId.localeCompare(b.staffId),
    );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMonthTr(month: string) {
  if (!month) return "";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}

function formatDurationMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} dk`;
  return remainingMinutes ? `${hours} sa ${remainingMinutes} dk` : `${hours} sa`;
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
  if (record.leaveType === "unpaid" && record.status !== "cancelled") {
    return leaveStatusLabels[getUnpaidLeaveAutomaticStatus(record.endDate, todayIso())];
  }
  if (record.status === "planned" && record.endDate < todayIso()) return "Bitti";
  return leaveStatusLabels[record.status];
}

function getUnpaidLeaveRecordStats(records: AnnualLeaveRecord[]) {
  return {
    records: records.length,
    planned: records
      .filter((record) => record.status !== "cancelled" && getUnpaidLeaveAutomaticStatus(record.endDate, todayIso()) === "planned")
      .reduce((sum, record) => sum + record.usedDays, 0),
    completed: records
      .filter((record) => record.status !== "cancelled" && getUnpaidLeaveAutomaticStatus(record.endDate, todayIso()) === "completed")
      .reduce((sum, record) => sum + record.usedDays, 0),
    cancelled: records.filter((record) => record.status === "cancelled").length,
  };
}

function getAnnualLeaveUsageBreakdown(record: AnnualLeaveRecord) {
  if (record.status === "cancelled") return { used: 0, planned: 0 };
  if (record.status === "used" || record.status === "completed") return { used: record.usedDays, planned: 0 };
  if (record.status !== "planned") return { used: 0, planned: 0 };

  const today = todayIso();
  if (today < record.startDate) return { used: 0, planned: record.usedDays };

  const usedUntil = today < record.endDate ? today : record.endDate;
  const used = Math.min(record.usedDays, countLeaveDays(record.startDate, usedUntil));
  const planned = Math.max(0, record.usedDays - used);
  return { used, planned };
}

function isAnnualLeaveUsed(record: AnnualLeaveRecord) {
  return getAnnualLeaveUsageBreakdown(record).used > 0;
}

function isAnnualLeavePlanned(record: AnnualLeaveRecord) {
  return getAnnualLeaveUsageBreakdown(record).planned > 0;
}

function getAnnualLeaveDisplayStatus(record: AnnualLeaveRecord) {
  const breakdown = getAnnualLeaveUsageBreakdown(record);
  if (breakdown.used > 0 && breakdown.planned > 0) return "Kısmen Kullanıldı";
  if (breakdown.used > 0) return "Kullanıldı";
  return leaveStatusLabels[record.status];
}

function groupLeaveRecords(records: AnnualLeaveRecord[], staffById: Map<string, StaffMember>): LeaveGroup[] {
  const grouped = new Map<string, LeaveGroup>();

  records.forEach((record) => {
    const current =
      grouped.get(record.staffId) ??
      {
        id: record.staffId,
        staffId: record.staffId,
        year: record.year,
        leaveType: record.leaveType,
        records: [],
        dateRanges: [],
        usedDays: 0,
        statusSummary: "",
        notes: [],
      };

    current.year = Math.min(current.year, record.year);
    current.records.push(record);
    current.dateRanges.push(`${record.startDate} - ${record.endDate}`);
    if (record.status !== "cancelled") current.usedDays += record.usedDays;
    if (record.notes.trim()) current.notes.push(record.notes.trim());
    grouped.set(record.staffId, current);
  });

  return Array.from(grouped.values())
    .map((group) => {
      const statusCounts = group.records.reduce<Record<string, number>>((counts, record) => {
        const label = getLeaveDisplayStatus(record);
        return { ...counts, [label]: (counts[label] ?? 0) + 1 };
      }, {});

      return {
        ...group,
        dateRanges: uniqueValues(group.dateRanges).sort((a, b) => a.localeCompare(b)),
        statusSummary: Object.entries(statusCounts).map(([label, count]) => `${count} ${label}`).join(", "),
        notes: uniqueValues(group.notes),
      };
    })
    .sort(
      (a, b) =>
        (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr", { sensitivity: "base" }) ||
        a.staffId.localeCompare(b.staffId),
    );
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

function downloadProfileSectionExcel(table: ProfileExportTable) {
  downloadExcelFile(
    `${safeFilename(table.staffName)}-${safeFilename(table.title)}.xls`,
    [
      {
        title: `${table.staffName} - ${table.title} - ${table.subtitle}`,
        rows: [table.columns, ...table.rows],
      },
    ],
  );
}

function getProfileExportStaffDetails(staffMember: StaffMember) {
  return [
    { label: "Departman", value: staffMember.department || "-" },
    { label: "Ünvan", value: staffMember.title || "-" },
    { label: "Durum", value: staffMember.active ? "Aktif" : "Pasif" },
    { label: "Doğum Tarihi", value: staffMember.birthDate || "-" },
    { label: "İşe Giriş", value: staffMember.startDate || "-" },
    { label: "İşten Çıkış", value: staffMember.endDate || "-" },
    { label: "Çıkış Türü", value: departureTypeLabels[staffMember.departureType ?? ""] ?? "-" },
    { label: "Çıkış Nedeni", value: staffMember.departureReason || "-" },
    { label: "Vardiya", value: staffMember.shiftType || "-" },
    { label: "T.C. Kimlik No", value: staffMember.nationalId || "-" },
    { label: "Telefon", value: staffMember.phone || "-" },
    { label: "SGK Kodu", value: staffMember.socialSecurityCode || "-" },
  ];
}

function configurePdfMake(pdfMake: any, pdfFonts: any) {
  const virtualFileSystem = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? pdfFonts;
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(virtualFileSystem);
  } else {
    pdfMake.vfs = virtualFileSystem;
  }
}

async function downloadProfileSectionPdf(table: ProfileExportTable) {
  try {
    const pdfMakeModule = await import("pdfmake/build/pdfmake");
    const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
    const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
    const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as any;
    configurePdfMake(pdfMake, pdfFonts);

    const body = [
      table.columns.map((column) => ({ text: column, style: "tableHeader" })),
      ...table.rows.map((row) =>
        row.map((cell) => ({ text: String(cell ?? ""), style: "tableCell" })),
      ),
    ];
    const staffDetailRows = Array.from(
      { length: Math.ceil(table.staffDetails.length / 3) },
      (_, rowIndex) =>
        Array.from({ length: 3 }, (_, columnIndex) => {
          const detail = table.staffDetails[rowIndex * 3 + columnIndex];
          return detail
            ? {
                stack: [
                  { text: detail.label, style: "staffDetailLabel" },
                  { text: detail.value, style: "staffDetailValue" },
                ],
                margin: [5, 4, 5, 4],
              }
            : { text: "" };
        }),
    );

    const docDefinition = {
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [28, 34, 28, 34],
      defaultStyle: { font: "Roboto", fontSize: 8.5, color: "#172033" },
      content: [
        { text: table.staffName, style: "personName" },
        { text: table.title, style: "title" },
        {
          table: {
            widths: ["*", "*", "*"],
            body: staffDetailRows,
          },
          layout: {
            fillColor: () => "#f7f9fc",
            hLineColor: () => "#cbd5e1",
            vLineColor: () => "#cbd5e1",
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
          },
          margin: [0, 8, 0, 10],
        },
        { text: table.subtitle, style: "subtitle" },
        ...(table.notice
          ? [
              {
                table: {
                  widths: ["*"],
                  body: [[{ text: table.notice, style: "pdfNotice", margin: [7, 5, 7, 5] }]],
                },
                layout: {
                  fillColor: () => "#fff7ed",
                  hLineColor: () => "#fdba74",
                  vLineColor: () => "#fdba74",
                  hLineWidth: () => 0.8,
                  vLineWidth: () => 0.8,
                },
                margin: [0, -4, 0, 12],
              },
            ]
          : []),
        {
          table: {
            headerRows: 1,
            widths: table.columns.map((_, index) => index === table.columns.length - 1 ? "*" : "auto"),
            body,
          },
          layout: {
            fillColor: (rowIndex: number) => rowIndex === 0 ? "#e9eef5" : rowIndex % 2 === 0 ? "#f7f9fc" : null,
            hLineColor: () => "#cbd5e1",
            vLineColor: () => "#cbd5e1",
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },
      ],
      styles: {
        personName: { fontSize: 15, bold: true, color: "#0f766e", margin: [0, 0, 0, 2] },
        title: { fontSize: 12, bold: true, margin: [0, 0, 0, 2] },
        subtitle: { fontSize: 8.5, color: "#526079", margin: [0, 0, 0, 14] },
        staffDetailLabel: { fontSize: 7, bold: true, color: "#64748b" },
        staffDetailValue: { fontSize: 8.5, bold: true, color: "#172033", margin: [0, 1, 0, 0] },
        pdfNotice: { fontSize: 8.2, bold: true, color: "#9a3412" },
        tableHeader: { bold: true, fontSize: 8.5, color: "#172033" },
        tableCell: { fontSize: 8.2 },
      },
      footer: (currentPage: number, pageCount: number) => ({
        text: `${new Date().toLocaleString("tr-TR")} - Sayfa ${currentPage} / ${pageCount}`,
        alignment: "center",
        fontSize: 7,
        color: "#64748b",
        margin: [0, 8, 0, 0],
      }),
    };

    pdfMake
      .createPdf(docDefinition)
      .download(`${safeFilename(table.staffName)}-${safeFilename(table.title)}.pdf`);
  } catch {
    window.alert("PDF oluşturulamadı. Lütfen tekrar deneyin.");
  }
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
  const [activeTab, setActiveTab] = useState<TabKey>(
    () => parseAppNavigation(window.location.search, tabKeys, "home").tab,
  );
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
  const [previousMonthReportRows, setPreviousMonthReportRows] = useState<AttendanceRecord[]>([]);
  const [previousYearReportRows, setPreviousYearReportRows] = useState<AttendanceRecord[]>([]);
  const [reportStaffId, setReportStaffId] = useState("all");
  const [reportDepartment, setReportDepartment] = useState("all");
  const [reportView, setReportView] = useState<ReportView>("overview");
  const [profileStaffId, setProfileStaffId] = useState(
    () => parseAppNavigation(window.location.search, tabKeys, "home").profileStaffId,
  );
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
    birthDate: "",
    startDate: todayIso(),
    endDate: "",
    departureType: "",
    departureReason: "",
    showOnSignatureSheet: true,
    fixedStaff: false,
  });
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [printMode, setPrintMode] = useState<PrintMode>("signature");
  const [incapacityReportMonth, setIncapacityReportMonth] = useState(todayIso().slice(0, 7));
  const [holidayReportMonth, setHolidayReportMonth] = useState(todayIso().slice(0, 7));
  const [hourlyLeaveReportMonth, setHourlyLeaveReportMonth] = useState(todayIso().slice(0, 7));
  const [annualLeaveReportMonth, setAnnualLeaveReportMonth] = useState(todayIso().slice(0, 7));
  const [unpaidLeaveReportMonth, setUnpaidLeaveReportMonth] = useState(todayIso().slice(0, 7));
  const [incapacityReportStaffId, setIncapacityReportStaffId] = useState("all");
  const [hourlyLeaveReportStaffId, setHourlyLeaveReportStaffId] = useState("all");
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
  const [hourlyLeaveRecords, setHourlyLeaveRecords] = useState<HourlyLeaveRecord[]>([]);
  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [incapacityForm, setIncapacityForm] = useState({
    id: "",
    staffId: "",
    reportNumber: "",
    reportType: "illness" as IncapacityReportType,
    startDate: todayIso(),
    endDate: todayIso(),
    reason: "",
    status: "active" as IncapacityStatus,
    sgkNotified: false,
    sgkNotificationDate: "",
    notificationDeadline: "",
    reminderEnabled: true,
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
  const [hourlyLeaveForm, setHourlyLeaveForm] = useState<HourlyLeaveFormState>({
    id: "",
    staffId: "",
    date: todayIso(),
    startTime: settings.shiftStart,
    endTime: addMinutesToTime(settings.shiftStart, 60),
    reason: "",
    status: "used",
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
  const activeRegularStaffList = useMemo(
    () => filteredStaff.filter((member) => member.active && !member.fixedStaff),
    [filteredStaff],
  );
  const activeFixedStaffList = useMemo(
    () => filteredStaff.filter((member) => member.active && member.fixedStaff),
    [filteredStaff],
  );
  const inactiveStaffList = useMemo(() => filteredStaff.filter((member) => !member.active), [filteredStaff]);
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
        const incapacityReport = findIncapacityReportForDate(incapacityReports, member.id, selectedDate);
        const status = incapacityReport ? "excused" : getDraftStatus(draft, settings);
        if (status || draft.checkInTime || draft.lateReason.trim()) stats.processed += 1;
        if (status === "present") stats.present += 1;
        if (status === "late") stats.late += 1;
        if (status === "absent") stats.absent += 1;
        if (status === "excused") stats.excused += 1;
        return stats;
      },
      { processed: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [activeStaff, drafts, incapacityReports, selectedDate, settings]);
  const dailyEmptyCount = Math.max(0, activeStaff.length - dailyStats.processed);

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
  const profileStaff = (profileStaffId ? staffById.get(profileStaffId) : staff[0]) ?? null;
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
  const profileAttendanceExportTable = useMemo<ProfileExportTable | null>(
    () =>
      profileStaff
        ? {
            staffName: profileStaff.name,
            staffDetails: getProfileExportStaffDetails(profileStaff),
            title: "Devam Geçmişi",
            subtitle: `${reportStart} - ${reportEnd}`,
            columns: ["Tarih", "Giriş", "Gecikme (Dk)", "Durum", "Açıklama"],
            rows: profileRows.map((record) => [
              record.date,
              record.checkInTime || "-",
              getRecordLateMinutes(record, settings),
              statusLabels[record.status],
              record.lateReason,
            ]),
          }
        : null,
    [profileRows, profileStaff, reportEnd, reportStart, settings],
  );
  const profileAnnualLeaveBalances = useMemo(() => {
    if (!profileStaff) return [];

    const currentYear = getCurrentYear();
    const staffAnnualRecords = annualLeaveRecords.filter(
      (record) => record.staffId === profileStaff.id && record.leaveType === "annual",
    );
    const startDateYear = Number(profileStaff.startDate?.slice(0, 4));
    const recordYears = staffAnnualRecords.map((record) => record.year).filter((year) => year > 0);
    const startYearCandidates = [
      ...(Number.isFinite(startDateYear) && startDateYear > 0 ? [startDateYear] : []),
      ...recordYears,
    ];
    const startYear = startYearCandidates.length ? Math.min(...startYearCandidates) : currentYear;
    const endDateYear = Number(profileStaff.endDate?.slice(0, 4));
    const endYear = !profileStaff.active && Number.isFinite(endDateYear) && endDateYear > 0
      ? Math.max(startYear, Math.min(currentYear, endDateYear))
      : currentYear;
    const entitlements: Record<number, number> = {};

    for (let year = startYear; year <= endYear; year += 1) {
      entitlements[year] = getAnnualEntitlementForStaff(
        profileStaff.id,
        year,
        annualLeaveRecords,
        staffById,
      );
    }

    return calculateAnnualLeaveYearBalances(
      profileStaff.id,
      startYear,
      endYear,
      entitlements,
      annualLeaveRecords,
      todayIso(),
    );
  }, [annualLeaveRecords, profileStaff, staffById]);
  const profileAnnualLeaveBalanceRows = useMemo(
    () =>
      profileAnnualLeaveBalances.map((balance) => {
        const entitlementDate = getAnnualLeaveEntitlementDate(profileStaff?.startDate, balance.year);
        const prospectiveEntitlement = calculateAnnualEntitlementForServiceYear(
          profileStaff?.startDate,
          balance.year,
        );
        const pendingEntitlement =
          balance.entitlement === 0 &&
          profileStaff?.active !== false &&
          entitlementDate !== null &&
          entitlementDate > todayIso() &&
          (!profileStaff?.endDate || entitlementDate <= profileStaff.endDate)
            ? prospectiveEntitlement
            : 0;

        return {
          ...balance,
          entitlementDate,
          pendingEntitlement,
          isEntryYear: Number(profileStaff?.startDate?.slice(0, 4)) === balance.year,
        };
      }),
    [profileAnnualLeaveBalances, profileStaff],
  );
  const profileAnnualLeaveExportTable = useMemo<ProfileExportTable | null>(
    () =>
      profileStaff
        ? {
            staffName: profileStaff.name,
            staffDetails: getProfileExportStaffDetails(profileStaff),
            title: "Yıllık İzin Hakları ve Devirler",
            subtitle: "Yıllık haklar, kullanılan günler ve sonraki yıla aktarılan bakiye",
            notice: "İşe giriş yılında yıllık izin hakkı oluşmaz. İlk hak, bir yıllık çalışma tamamlandığında kazanılır.",
            columns: ["Yıl", "Hak Ediş Tarihi", "Yıllık Hak", "Hak Edecek", "Önceki Yıldan Devir", "Kullanılan", "Planlanan", "Kalan / Devreden"],
            rows: profileAnnualLeaveBalanceRows.map((balance) => [
              balance.year,
              balance.entitlementDate ?? "-",
              balance.entitlement,
              balance.isEntryYear
                ? "İşe giriş yılı - hak yok"
                : balance.pendingEntitlement || "-",
              balance.carryIn,
              balance.used,
              balance.planned,
              balance.carryOut,
            ]),
          }
        : null,
    [profileAnnualLeaveBalanceRows, profileStaff],
  );
  const profileLeaveStats = useMemo(() => {
    if (!profileStaff) {
      return {
        annualUsedTotal: 0,
        annualEntitlement: 0,
        annualPlannedCurrentYear: 0,
        annualRemaining: 0,
        annualBalanceYear: getCurrentYear(),
        unpaidUsedTotal: 0,
        incapacityDays: 0,
        hourlyLeaveMinutes: 0,
        holidayWorkHours: 0,
      };
    }

    const latestBalance = profileAnnualLeaveBalances[profileAnnualLeaveBalances.length - 1];
    const balanceYear = latestBalance?.year ?? getCurrentYear();
    const leaveStats = calculateProfileLeaveStats(
      profileStaff.id,
      balanceYear,
      latestBalance?.entitlement ?? getAnnualEntitlementForStaff(
        profileStaff.id,
        balanceYear,
        annualLeaveRecords,
        staffById,
      ),
      annualLeaveRecords,
      todayIso(),
    );

    return {
      ...leaveStats,
      annualEntitlement: latestBalance?.entitlement ?? leaveStats.annualEntitlement,
      annualPlannedCurrentYear: latestBalance?.planned ?? leaveStats.annualPlannedCurrentYear,
      annualRemaining: latestBalance?.carryOut ?? leaveStats.annualRemaining,
      annualBalanceYear: balanceYear,
      incapacityDays: incapacityReports
        .filter((record) => record.staffId === profileStaff.id && record.status !== "cancelled")
        .reduce((sum, record) => sum + record.dayCount, 0),
      hourlyLeaveMinutes: hourlyLeaveRecords
        .filter((record) => record.staffId === profileStaff.id && record.status !== "cancelled")
        .reduce((sum, record) => sum + getHourlyLeaveNetMinutes(record), 0),
      holidayWorkHours: holidayWorkRecords
        .filter((record) => record.staffId === profileStaff.id)
        .reduce((sum, record) => sum + getHolidayWorkNetHours(record), 0),
    };
  }, [
    annualLeaveRecords,
    holidayWorkRecords,
    hourlyLeaveRecords,
    incapacityReports,
    profileAnnualLeaveBalances,
    profileStaff,
    staffById,
  ]);
  const profileHistoryEvents = useMemo<ProfileHistoryEvent[]>(() => {
    if (!profileStaff) return [];

    const events: ProfileHistoryEvent[] = [];
    const addEvent = (event: ProfileHistoryEvent) => events.push(event);

    annualLeaveRecords
      .filter((record) => record.staffId === profileStaff.id)
      .forEach((record) => {
        addEvent({
          id: `leave-${record.id}`,
          date: record.startDate,
          sortDate: record.updatedAt ?? record.createdAt ?? record.startDate,
          category: annualLeaveTypeLabels[record.leaveType],
          action: record.leaveType === "annual"
            ? getAnnualLeaveDisplayStatus(record)
            : getLeaveDisplayStatus(record),
          detail: `${record.startDate} - ${record.endDate} • ${record.usedDays} gün${record.notes ? ` • ${record.notes}` : ""}`,
        });
      });

    hourlyLeaveRecords
      .filter((record) => record.staffId === profileStaff.id)
      .forEach((record) => {
        addEvent({
          id: `hourly-${record.id}`,
          date: record.date,
          sortDate: record.updatedAt ?? record.createdAt ?? record.date,
          category: "Saatlik İzin",
          action: hourlyLeaveStatusLabels[record.status],
          detail: `${record.startTime} - ${record.endTime} • ${formatLeaveDuration(getHourlyLeaveNetMinutes(record))}${record.reason ? ` • ${record.reason}` : ""}`,
        });
      });

    incapacityReports
      .filter((record) => record.staffId === profileStaff.id)
      .forEach((record) => {
        addEvent({
          id: `incapacity-${record.id}`,
          date: record.startDate,
          sortDate: record.updatedAt ?? record.createdAt ?? record.startDate,
          category: "İş Göremezlik",
          action: incapacityStatusLabels[record.status],
          detail: `${incapacityReportTypeLabels[record.reportType ?? "illness"]} • ${record.startDate} - ${record.endDate} • ${record.dayCount} gün${record.reason ? ` • ${record.reason}` : ""}`,
        });
      });

    holidayWorkRecords
      .filter((record) => record.staffId === profileStaff.id)
      .forEach((record) => {
        addEvent({
          id: `holiday-${record.id}`,
          date: record.date,
          sortDate: record.updatedAt ?? record.createdAt ?? record.date,
          category: "Resmi Tatil",
          action: holidayCompensationLabels[record.compensationType],
          detail: `${record.holidayName} • ${record.startTime} - ${record.endTime} • ${getHolidayWorkNetHours(record)} saat${record.notes ? ` • ${record.notes}` : ""}`,
        });
      });

    const normalizedName = profileStaff.name.trim().toLocaleLowerCase("tr-TR");
    auditLogs
      .filter(
        (log) =>
          log.staffId === profileStaff.id ||
          (!log.staffId && normalizedName && log.detail.toLocaleLowerCase("tr-TR").includes(normalizedName)),
      )
      .forEach((log) => {
        addEvent({
          id: `audit-${log.id}`,
          date: log.createdAt.slice(0, 10),
          sortDate: log.createdAt,
          category: "İşlem",
          action: log.action,
          detail: log.detail,
        });
      });

    return sortProfileHistoryNewestFirst(events);
  }, [
    annualLeaveRecords,
    auditLogs,
    holidayWorkRecords,
    hourlyLeaveRecords,
    incapacityReports,
    profileStaff,
  ]);
  const profileHistorySections = useMemo(() => {
    const annual: ProfileHistoryEvent[] = [];
    const unpaid: ProfileHistoryEvent[] = [];
    const incapacity: ProfileHistoryEvent[] = [];
    const hourly: ProfileHistoryEvent[] = [];
    const holiday: ProfileHistoryEvent[] = [];
    const deleted: ProfileHistoryEvent[] = [];
    const other: ProfileHistoryEvent[] = [];

    profileHistoryEvents.forEach((event) => {
      const action = event.action.toLocaleLowerCase("tr-TR");
      const isAudit = event.category === "İşlem";
      const isDeletionAudit =
        isAudit &&
        (
          action.includes("silindi") ||
          action.includes("silinen") ||
          action.includes("temizlendi") ||
          action.includes("geri yüklendi")
        );
      const isStaffDataAudit = isAudit && action.startsWith("personel ");

      if (isDeletionAudit) {
        deleted.push(event);
      } else if (event.category === "Yıllık izin") {
        annual.push(event);
      } else if (event.category === "Ücretsiz izin") {
        unpaid.push(event);
      } else if (event.category === "İş Göremezlik") {
        incapacity.push(event);
      } else if (event.category === "Saatlik İzin") {
        hourly.push(event);
      } else if (event.category === "Resmi Tatil") {
        holiday.push(event);
      } else if (isStaffDataAudit) {
        other.push(event);
      }
    });

    return { annual, unpaid, incapacity, hourly, holiday, deleted, other };
  }, [profileHistoryEvents]);
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
  const reportStaffFilter = useMemo(
    () => ({ department: reportDepartment, staffId: reportStaffId }),
    [reportDepartment, reportStaffId],
  );
  const reportScopedStaffIds = useMemo(
    () =>
      new Set(
        staff
          .filter(
            (member) =>
              (reportDepartment === "all" || member.department === reportDepartment) &&
              (reportStaffId === "all" || member.id === reportStaffId),
          )
          .map((member) => member.id),
      ),
    [reportDepartment, reportStaffId, staff],
  );
  const workforceReport = useMemo(
    () => getWorkforceSummary(staff, reportStart, reportEnd, reportStaffFilter),
    [reportEnd, reportStaffFilter, reportStart, staff],
  );
  const attendanceReport = useMemo(
    () => getAttendanceSummary(filteredReportRows, settings.shiftStart),
    [filteredReportRows, settings.shiftStart],
  );
  const leaveReport = useMemo(
    () =>
      getLeaveReportSummary(
        annualLeaveRecords,
        incapacityReports,
        hourlyLeaveRecords,
        reportStart,
        reportEnd,
        reportScopedStaffIds,
      ),
    [annualLeaveRecords, hourlyLeaveRecords, incapacityReports, reportEnd, reportScopedStaffIds, reportStart],
  );
  const workforceTrendRows = useMemo(
    () => getMonthlyWorkforceTrend(staff, reportEnd, reportStaffFilter),
    [reportEnd, reportStaffFilter, staff],
  );
  const departmentComparisonRows = useMemo(
    () =>
      getDepartmentComparisonRows(
        staff,
        reportRows,
        annualLeaveRecords,
        incapacityReports,
        hourlyLeaveRecords,
        reportStart,
        reportEnd,
        settings.shiftStart,
        reportStaffFilter,
      ),
    [
      annualLeaveRecords,
      hourlyLeaveRecords,
      incapacityReports,
      reportEnd,
      reportRows,
      reportStaffFilter,
      reportStart,
      settings.shiftStart,
      staff,
    ],
  );
  const punctualReportStaff = useMemo(
    () =>
      attendanceReport.punctualStaffIds
        .map((staffId) => staffById.get(staffId))
        .filter((member): member is StaffMember => Boolean(member))
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [attendanceReport.punctualStaffIds, staffById],
  );
  const reportComparisonRanges = useMemo(
    () => getReportComparisonRanges(reportStart, reportEnd),
    [reportEnd, reportStart],
  );
  const previousMonthWorkforce = useMemo(
    () =>
      getWorkforceSummary(
        staff,
        reportComparisonRanges.previousMonth.start,
        reportComparisonRanges.previousMonth.end,
        reportStaffFilter,
      ),
    [reportComparisonRanges.previousMonth.end, reportComparisonRanges.previousMonth.start, reportStaffFilter, staff],
  );
  const previousYearWorkforce = useMemo(
    () =>
      getWorkforceSummary(
        staff,
        reportComparisonRanges.previousYear.start,
        reportComparisonRanges.previousYear.end,
        reportStaffFilter,
      ),
    [reportComparisonRanges.previousYear.end, reportComparisonRanges.previousYear.start, reportStaffFilter, staff],
  );
  const previousMonthAttendance = useMemo(
    () =>
      getAttendanceSummary(
        filterReportAttendance(previousMonthReportRows, staffById, reportStaffId, reportDepartment),
        settings.shiftStart,
      ),
    [previousMonthReportRows, reportDepartment, reportStaffId, settings.shiftStart, staffById],
  );
  const previousYearAttendance = useMemo(
    () =>
      getAttendanceSummary(
        filterReportAttendance(previousYearReportRows, staffById, reportStaffId, reportDepartment),
        settings.shiftStart,
      ),
    [previousYearReportRows, reportDepartment, reportStaffId, settings.shiftStart, staffById],
  );
  const expectedAttendanceDays = useMemo(
    () => getExpectedWorkdays(staff, reportStart, reportEnd, reportStaffFilter),
    [reportEnd, reportStaffFilter, reportStart, staff],
  );
  const attendanceRate = expectedAttendanceDays
    ? Number(((attendanceReport.attendedDays / expectedAttendanceDays) * 100).toFixed(1))
    : 0;
  const absenceRate = expectedAttendanceDays
    ? Number(((attendanceReport.absentDays / expectedAttendanceDays) * 100).toFixed(1))
    : 0;
  const consecutiveAbsenceRows = useMemo(
    () => getConsecutiveAbsenceRows(filteredReportRows),
    [filteredReportRows],
  );
  const earlyExitRows = useMemo(
    () => getEarlyExitRows(staff, reportStart, reportEnd, reportStaffFilter),
    [reportEnd, reportStaffFilter, reportStart, staff],
  );
  const futureLeaveDensityRows = useMemo(
    () =>
      getLeaveDensityRows(
        annualLeaveRecords,
        incapacityReports,
        todayIso(),
        addDaysIso(todayIso(), 30),
        reportScopedStaffIds,
      ),
    [annualLeaveRecords, incapacityReports, reportScopedStaffIds],
  );
  const workforceClosingMonthDelta = getMetricDelta(workforceReport.closing, previousMonthWorkforce.closing);
  const workforceClosingYearDelta = getMetricDelta(workforceReport.closing, previousYearWorkforce.closing);
  const attendanceMonthDelta = getMetricDelta(attendanceReport.attendedDays, previousMonthAttendance.attendedDays);
  const attendanceYearDelta = getMetricDelta(attendanceReport.attendedDays, previousYearAttendance.attendedDays);
  const managementSummaryLines = useMemo(() => {
    const departmentLabel = reportDepartment === "all" ? "Şirket genelinde" : `${reportDepartment} departmanında`;
    const peakLeave = futureLeaveDensityRows[0];
    return [
      `${departmentLabel} seçili dönemde ${workforceReport.hires} personel işe alındı, ${workforceReport.exits} personel işten çıktı ve net değişim ${workforceReport.net > 0 ? "+" : ""}${workforceReport.net} oldu.`,
      `Dönem sonu personel sayısı önceki aya göre ${workforceClosingMonthDelta.difference > 0 ? "+" : ""}${workforceClosingMonthDelta.difference}, geçen yılın aynı dönemine göre ${workforceClosingYearDelta.difference > 0 ? "+" : ""}${workforceClosingYearDelta.difference} değişti.`,
      `Devam oranı %${attendanceRate}, devamsızlık oranı %${absenceRate}; ${consecutiveAbsenceRows.length} personelde en az iki ardışık devamsızlık tespit edildi.`,
      earlyExitRows.length
        ? `${earlyExitRows.length} personel ilk 90 çalışma günü içinde ayrıldı.`
        : "Seçili dönemde ilk 90 gün içinde ayrılan personel bulunmuyor.",
      peakLeave
        ? `Önümüzdeki 30 günde en yoğun izin/rapor tarihi ${formatDateTr(peakLeave.date)}: ${peakLeave.staffIds.length} personel.`
        : "Önümüzdeki 30 gün için planlanmış izin veya rapor yoğunluğu bulunmuyor.",
    ];
  }, [
    absenceRate,
    attendanceRate,
    consecutiveAbsenceRows.length,
    earlyExitRows.length,
    futureLeaveDensityRows,
    reportDepartment,
    workforceClosingMonthDelta.difference,
    workforceClosingYearDelta.difference,
    workforceReport.exits,
    workforceReport.hires,
    workforceReport.net,
  ]);
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
      sgkPending: incapacityRowsForMonth.filter((record) => !record.sgkNotified && record.status !== "cancelled").length,
    }),
    [incapacityRowsForMonth],
  );
  const incapacityReminders = useMemo(() => {
    const today = todayIso();
    const dueSoonDate = addDaysIso(today, 7);
    return incapacityReports
      .map((record) => ({ record, tone: getIncapacityReminderTone(record, today, dueSoonDate) }))
      .filter(({ tone }) => tone === "overdue" || tone === "dueSoon")
      .sort((a, b) => (a.record.notificationDeadline ?? "").localeCompare(b.record.notificationDeadline ?? ""));
  }, [incapacityReports]);
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
  const hourlyLeaveRowsForMonth = useMemo(
    () =>
      hourlyLeaveRecords.filter(
        (record) =>
          record.date.startsWith(hourlyLeaveReportMonth) &&
          (hourlyLeaveReportStaffId === "all" || record.staffId === hourlyLeaveReportStaffId),
      ),
    [hourlyLeaveRecords, hourlyLeaveReportMonth, hourlyLeaveReportStaffId],
  );
  const hourlyLeaveStats = useMemo(
    () => ({
      records: hourlyLeaveRowsForMonth.length,
      minutes: hourlyLeaveRowsForMonth
        .filter((record) => record.status !== "cancelled")
        .reduce((sum, record) => sum + getHourlyLeaveNetMinutes(record), 0),
      used: hourlyLeaveRowsForMonth.filter((record) => record.status === "used").length,
      planned: hourlyLeaveRowsForMonth.filter((record) => record.status === "planned").length,
      cancelled: hourlyLeaveRowsForMonth.filter((record) => record.status === "cancelled").length,
    }),
    [hourlyLeaveRowsForMonth],
  );
  const hourlyLeaveGroups = useMemo(
    () => groupHourlyLeaveRecords(hourlyLeaveRowsForMonth, staffById),
    [hourlyLeaveRowsForMonth, staffById],
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
          entitlement: getAnnualEntitlementForStaff(record.staffId, annualLeaveYear, annualLeaveRecords, staffById),
          used: 0,
          planned: 0,
          remaining: 0,
        };

      current.entitlement = Math.max(current.entitlement, record.entitlementDays || 0);
      if (record.leaveType === "annual" && record.status !== "cancelled") {
        const breakdown = getAnnualLeaveUsageBreakdown(record);
        current.used += breakdown.used;
        current.planned += breakdown.planned;
      }
      current.remaining = Math.max(0, current.entitlement - current.used - current.planned);
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [annualLeaveRecords, annualLeaveRowsForYear, annualLeaveYear, staffById, staffRankById]);
  const annualLeaveStats = useMemo(
    () => ({
      records: annualLeaveRowsForYear.length,
      used: annualLeaveRowsForYear
        .filter((record) => record.leaveType === "annual")
        .reduce((sum, record) => sum + getAnnualLeaveUsageBreakdown(record).used, 0),
      planned: annualLeaveRowsForYear
        .filter((record) => record.leaveType === "annual")
        .reduce((sum, record) => sum + getAnnualLeaveUsageBreakdown(record).planned, 0),
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
      used: annualLeaveRowsForMonth.reduce((sum, record) => sum + getAnnualLeaveUsageBreakdown(record).used, 0),
      planned: annualLeaveRowsForMonth.reduce((sum, record) => sum + getAnnualLeaveUsageBreakdown(record).planned, 0),
      completed: annualLeaveRowsForMonth.filter((record) => record.status === "completed").reduce((sum, record) => sum + record.usedDays, 0),
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
  const signatureExplanations = useMemo(
    () =>
      new Map(
        signatureStaff.map((member) => [
          member.id,
          getSignatureSheetExplanation(member.id, selectedDate, annualLeaveRecords, incapacityReports),
        ]),
      ),
    [annualLeaveRecords, incapacityReports, selectedDate, signatureStaff],
  );
  const unpaidLeaveRowsForYear = useMemo(
    () => unpaidLeaveRecords.filter((record) => record.year === unpaidLeaveYear),
    [unpaidLeaveRecords, unpaidLeaveYear],
  );
  const activeUnpaidLeaveRowsForYear = useMemo(
    () => unpaidLeaveRowsForYear.filter((record) => staffById.get(record.staffId)?.active !== false),
    [staffById, unpaidLeaveRowsForYear],
  );
  const unpaidLeaveSummaries = useMemo(() => {
    const summary = new Map<string, { staff: StaffMember; planned: number; completed: number; cancelled: number }>();

    unpaidLeaveRowsForYear.forEach((record) => {
      const member = staffById.get(record.staffId);
      if (!member || member.active === false) return;

      const current =
        summary.get(record.staffId) ??
        {
          staff: member,
          planned: 0,
          completed: 0,
          cancelled: 0,
        };

      const automaticStatus = getUnpaidLeaveAutomaticStatus(record.endDate, todayIso());
      if (record.status === "cancelled") current.cancelled += 1;
      if (record.status !== "cancelled" && automaticStatus === "completed") current.completed += record.usedDays;
      if (record.status !== "cancelled" && automaticStatus === "planned") current.planned += record.usedDays;
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [staffById, staffRankById, unpaidLeaveRowsForYear]);
  const unpaidLeaveStats = useMemo(
    () => getUnpaidLeaveRecordStats(activeUnpaidLeaveRowsForYear),
    [activeUnpaidLeaveRowsForYear],
  );
  const unpaidLeaveRowsForMonth = useMemo(() => {
    return unpaidLeaveRecords.filter(
      (record) =>
        shouldIncludeUnpaidLeaveInMonth(record, staffById.get(record.staffId), unpaidLeaveReportMonth) &&
        (unpaidLeaveReportStaffId === "all" || record.staffId === unpaidLeaveReportStaffId),
    );
  }, [staffById, unpaidLeaveRecords, unpaidLeaveReportMonth, unpaidLeaveReportStaffId]);
  const unpaidLeaveReportStats = useMemo(
    () => getUnpaidLeaveRecordStats(
      unpaidLeaveRowsForMonth.filter((record) => staffById.get(record.staffId)?.active !== false),
    ),
    [staffById, unpaidLeaveRowsForMonth],
  );
  const departedUnpaidLeaveReportStats = useMemo(
    () => getUnpaidLeaveRecordStats(
      unpaidLeaveRowsForMonth.filter((record) => staffById.get(record.staffId)?.active === false),
    ),
    [staffById, unpaidLeaveRowsForMonth],
  );
  const unpaidLeaveGroupsForMonth = useMemo(
    () => groupLeaveRecords(unpaidLeaveRowsForMonth, staffById),
    [staffById, unpaidLeaveRowsForMonth],
  );
  const activeUnpaidLeaveGroupsForMonth = useMemo(
    () => unpaidLeaveGroupsForMonth.filter((group) => staffById.get(group.staffId)?.active !== false),
    [staffById, unpaidLeaveGroupsForMonth],
  );
  const departedUnpaidLeaveGroupsForMonth = useMemo(
    () => unpaidLeaveGroupsForMonth.filter((group) => staffById.get(group.staffId)?.active === false),
    [staffById, unpaidLeaveGroupsForMonth],
  );

  async function refreshStaff() {
    setBusy(true);
    try {
      const nextStaff = await loadStaff();
      setStaff(nextStaff);
    } catch {
      setMessage("Personel verileri okunamadı. Mevcut liste korunuyor; bağlantınızı kontrol edin.");
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
    } catch {
      setMessage("Günlük kayıtlar okunamadı. Mevcut ekran korunuyor; bağlantınızı kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrintArchives() {
    try {
      const records = await loadPrintArchives();
      setPrintArchives(records);
    } catch {
      setMessage("İmza föyü arşivi okunamadı; mevcut veriler korunuyor.");
    }
  }

  async function refreshDayLock(date = selectedDate) {
    try {
      setDayLock(await loadDayLock(date));
    } catch {
      setMessage("Gün kilidi durumu doğrulanamadı; mevcut kilit durumu korunuyor.");
    }
  }

  async function refreshAuditLogs() {
    try {
      setAuditLogs(await loadAuditLogs(500));
    } catch {
      setMessage("Değişiklik geçmişi okunamadı; mevcut kayıtlar korunuyor.");
    }
  }

  async function refreshDeletedAttendance() {
    try {
      setDeletedAttendance(await loadDeletedAttendance());
    } catch {
      setMessage("Silinen kayıtlar okunamadı; mevcut liste korunuyor.");
    }
  }

  async function refreshHrRecords() {
    try {
      const [reports, holidayWork, hourlyLeave, annualLeave] = await Promise.all([
        loadIncapacityReports(),
        loadHolidayWorkRecords(),
        loadHourlyLeaveRecords(),
        loadAnnualLeaveRecords(),
      ]);
      setIncapacityReports(reports);
      setHolidayWorkRecords(holidayWork);
      setHourlyLeaveRecords(hourlyLeave);
      setAnnualLeaveRecords(annualLeave);
    } catch {
      setMessage("İK kayıtları okunamadı. Mevcut veriler korunuyor; bağlantınızı kontrol edin.");
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
    void loadAppSettings()
      .then((remoteSettings) => {
        if (!remoteSettings) {
          return saveAppSettings(settings);
        }
        const next = { ...defaultSettings, ...remoteSettings };
        setSettings(next);
        saveSettings(next);
      })
      .catch(() => setMessage("Firma ayarları Firestore'dan okunamadı; bu cihazdaki ayarlar kullanılıyor."));
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
    if (!canUseApp) return;

    const unpaidLeavesWithOutdatedStatus = annualLeaveRecords.filter(
      (record) =>
        record.leaveType === "unpaid" &&
        record.status !== "cancelled" &&
        record.status !== getUnpaidLeaveAutomaticStatus(record.endDate, todayIso()),
    );
    if (!unpaidLeavesWithOutdatedStatus.length) return;

    void Promise.all(
      unpaidLeavesWithOutdatedStatus.map((record) =>
        saveAnnualLeaveRecord({
          ...record,
          status: getUnpaidLeaveAutomaticStatus(record.endDate, todayIso()),
          updatedAt: new Date().toISOString(),
        }),
      ),
    )
      .then(() => refreshHrRecords())
      .catch((error) => console.warn("Ücretsiz izin durumları güncellenemedi.", error));
  }, [annualLeaveRecords, canUseApp]);

  useEffect(() => {
    if ((!profileStaffId || !staffById.has(profileStaffId)) && staff.length) {
      setProfileStaffId(staff[0].id);
    }
  }, [profileStaffId, staff, staffById]);

  useEffect(() => {
    const nextSearch = buildAppNavigationSearch(
      window.location.search,
      activeTab,
      profileStaffId,
      "home",
    );
    if (nextSearch === window.location.search) return;

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${nextSearch}${window.location.hash}`,
    );
  }, [activeTab, profileStaffId]);

  useEffect(() => {
    const handlePopState = () => {
      const navigation = parseAppNavigation(window.location.search, tabKeys, "home");
      setActiveTab(navigation.tab);
      setProfileStaffId(navigation.profileStaffId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    setBulkSelectedIds((previous) => previous.filter((id) => staffById.has(id)));
  }, [staffById]);

  useEffect(() => {
    if (incapacityReportStaffId !== "all" && !staffById.has(incapacityReportStaffId)) {
      setIncapacityReportStaffId("all");
    }
    if (hourlyLeaveReportStaffId !== "all" && !staffById.has(hourlyLeaveReportStaffId)) {
      setHourlyLeaveReportStaffId("all");
    }
    if (annualLeaveReportStaffId !== "all" && !staffById.has(annualLeaveReportStaffId)) {
      setAnnualLeaveReportStaffId("all");
    }
    if (unpaidLeaveReportStaffId !== "all" && !staffById.has(unpaidLeaveReportStaffId)) {
      setUnpaidLeaveReportStaffId("all");
    }
  }, [annualLeaveReportStaffId, hourlyLeaveReportStaffId, incapacityReportStaffId, staffById, unpaidLeaveReportStaffId]);

  useEffect(() => {
    if (!activeStaff.length) return;
    const fallbackId = activeStaff[0].id;
    setIncapacityForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setHolidayWorkForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setHourlyLeaveForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
    setAnnualLeaveForm((previous) =>
      previous.staffId && staffById.has(previous.staffId)
        ? previous
        : {
            ...previous,
            staffId: fallbackId,
            entitlementDays: getAnnualEntitlementForStaff(fallbackId, Number(previous.year) || getCurrentYear(), annualLeaveRecords, staffById),
          },
    );
    setUnpaidLeaveForm((previous) => (previous.staffId && staffById.has(previous.staffId) ? previous : { ...previous, staffId: fallbackId }));
  }, [activeStaff, annualLeaveRecords, staffById]);

  function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    void saveAppSettings(next).catch(() => {
      setMessage("Ayar bu cihazda kaydedildi ancak Firestore'a aktarılamadı.");
    });
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
      setActiveTab("home");
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
      if (findIncapacityReportForDate(incapacityReports, member.id, selectedDate)) return false;
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
          if (findIncapacityReportForDate(incapacityReports, member.id, selectedDate)) return null;
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
    if (findIncapacityReportForDate(incapacityReports, staffId, selectedDate)) {
      setMessage("Rapor süresindeki otomatik izin kaydı iş göremezlik ekranından yönetilir.");
      return;
    }
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
      await saveAuditLog("Günlük kayıt temizlendi", `${selectedDate} - ${staffName}`, staffId);
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
      await saveAuditLog("Silinen kayıt geri yüklendi", `${record.record.date} - ${record.staffName}`, record.record.staffId);
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
      birthDate: newStaff.birthDate,
      active: true,
      showOnSignatureSheet: newStaff.showOnSignatureSheet,
      fixedStaff: newStaff.fixedStaff,
      startDate: newStaff.startDate,
      endDate: newStaff.endDate,
      departureType: newStaff.departureType,
      departureReason: newStaff.departureReason.trim(),
    };

    setBusy(true);
    try {
      await saveStaffMember(member);
      await saveAuditLog("Personel eklendi", member.name, member.id);
      setNewStaff({
        name: "",
        department: "",
        title: "",
        nationalId: "",
        phone: "",
        socialSecurityCode: "",
        shiftType: "",
        birthDate: "",
        startDate: todayIso(),
        endDate: "",
        departureType: "",
        departureReason: "",
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

  function handleStartEditProfileStaff(member: StaffMember) {
    setProfileStaffId(member.id);
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
        birthDate: editingStaff.birthDate ?? "",
        showOnSignatureSheet: editingStaff.showOnSignatureSheet !== false,
        fixedStaff: Boolean(editingStaff.fixedStaff),
        startDate: editingStaff.startDate,
        endDate: editingStaff.endDate,
        departureType: editingStaff.departureType?.trim() ?? "",
        departureReason: editingStaff.departureReason?.trim() ?? "",
      });
      await saveAuditLog("Personel güncellendi", editingStaff.name.trim(), editingStaff.id);
      setProfileStaffId(editingStaff.id);
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
        birthDate = "",
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
        birthDate,
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
      await saveStaffMember({
        ...member,
        active: !member.active,
        endDate: member.active ? member.endDate || todayIso() : "",
      });
      await saveAuditLog(member.active ? "Personel pasife alındı" : "Personel aktife alındı", member.name, member.id);
      await refreshStaff();
      await refreshAuditLogs();
      setMessage(
        member.active
          ? `${member.name} pasif personel bölümüne taşındı.`
          : `${member.name} aktif personel bölümüne taşındı.`,
      );
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
      await saveAuditLog("Personel silindi", member.name, member.id);
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
    const eligibleMembers = selectedMembers.filter(
      (member) => member.active && !findIncapacityReportForDate(incapacityReports, member.id, selectedDate),
    );
    const skippedCount = selectedMembers.length - eligibleMembers.length;

    if (!selectedMembers.length) {
      setMessage("Toplu işlem için personel seçin.");
      return;
    }

    if (!eligibleMembers.length) {
      setMessage("Seçilen personeller pasif veya seçili tarihte raporlu olduğu için devam kaydı oluşturulmadı.");
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
    const records = eligibleMembers.map((member) => ({
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
      setMessage(
        `${records.length} personel için ${statusLabels[bulkStatus]} kaydı işlendi.${
          skippedCount ? ` ${skippedCount} pasif veya raporlu personel atlandı.` : ""
        }`,
      );
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
      await saveStaffMembers(
        selectedMembers.map((member) => ({
          ...member,
          active,
          endDate: !active && !member.endDate ? todayIso() : member.endDate,
        })),
      );
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

  async function syncIncapacityAttendance(
    record: IncapacityReportRecord,
    previous?: IncapacityReportRecord,
  ) {
    const starts = [record.startDate, previous?.startDate].filter(Boolean) as string[];
    const ends = [record.endDate, previous?.endDate].filter(Boolean) as string[];
    const rangeStart = starts.sort()[0];
    const sortedEnds = ends.sort();
    const rangeEnd = sortedEnds[sortedEnds.length - 1];
    if (!rangeStart || !rangeEnd) return { saved: 0, removed: 0, skipped: 0, locked: 0 };

    const allDates = getIncapacityWorkDates(rangeStart, rangeEnd);
    const existingRecords = await loadAttendanceRange(rangeStart, rangeEnd);
    const locks = await Promise.all(allDates.map((date) => loadDayLock(date)));
    const lockByDate = new Map(allDates.map((date, index) => [date, Boolean(locks[index]?.locked)]));
    const existingByDate = new Map(
      existingRecords.filter((item) => item.staffId === record.staffId).map((item) => [item.date, item]),
    );
    const targetDates = new Set(
      record.status === "cancelled" ? [] : getIncapacityWorkDates(record.startDate, record.endDate),
    );
    let saved = 0;
    let removed = 0;
    let skipped = 0;
    let locked = 0;

    for (const date of allDates) {
      const existing = existingByDate.get(date);
      const isOwnAutomaticRecord = existing?.source === "incapacity" && existing.incapacityReportId === record.id;
      const shouldExist = targetDates.has(date);
      if (!shouldExist && !isOwnAutomaticRecord) continue;
      if (lockByDate.get(date)) {
        locked += 1;
        continue;
      }

      if (!shouldExist && isOwnAutomaticRecord) {
        await deleteAttendanceRecord(existing.id);
        removed += 1;
        continue;
      }

      if (existing && !isOwnAutomaticRecord) {
        skipped += 1;
        continue;
      }

      await saveAttendanceRecord({
        id: makeAttendanceId(date, record.staffId),
        staffId: record.staffId,
        date,
        checkInTime: "",
        status: "excused",
        lateReason: `İş göremezlik raporu${record.reportNumber ? ` (${record.reportNumber})` : ""}`,
        source: "incapacity",
        incapacityReportId: record.id,
      });
      saved += 1;
    }

    return { saved, removed, skipped, locked };
  }

  function resetIncapacityForm() {
    setIncapacityForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      reportNumber: "",
      reportType: "illness",
      startDate: todayIso(),
      endDate: todayIso(),
      reason: "",
      status: "active",
      sgkNotified: false,
      sgkNotificationDate: "",
      notificationDeadline: "",
      reminderEnabled: true,
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
    const reportId = incapacityForm.id || crypto.randomUUID();
    const record: IncapacityReportRecord = {
      id: reportId,
      staffId,
      reportNumber: incapacityForm.reportNumber.trim(),
      reportType: incapacityForm.reportType,
      startDate: incapacityForm.startDate,
      endDate: incapacityForm.endDate,
      dayCount: countCalendarDays(incapacityForm.startDate, incapacityForm.endDate),
      reason: incapacityForm.reason.trim(),
      status: incapacityForm.status,
      sgkNotified: incapacityForm.sgkNotified,
      sgkNotificationDate: incapacityForm.sgkNotified ? incapacityForm.sgkNotificationDate : "",
      notificationDeadline: incapacityForm.notificationDeadline,
      reminderEnabled: incapacityForm.reminderEnabled,
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
      let cleanupResult = { saved: 0, removed: 0, skipped: 0, locked: 0 };
      if (existing && existing.staffId !== record.staffId) {
        cleanupResult = await syncIncapacityAttendance({ ...existing, status: "cancelled" }, existing);
      }
      const syncResult = await syncIncapacityAttendance(
        record,
        existing?.staffId === record.staffId ? existing : undefined,
      );
      await saveAuditLog(incapacityForm.id ? "İş göremezlik raporu güncellendi" : "İş göremezlik raporu eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`, staffId);
      await refreshHrRecords();
      if (record.startDate <= selectedDate && record.endDate >= selectedDate) await refreshAttendance(selectedDate);
      await refreshAuditLogs();
      resetIncapacityForm();
      setMessage(
        `İş göremezlik raporu kaydedildi; ${syncResult.saved} gün puantaja işlendi.${
          syncResult.skipped ? ` ${syncResult.skipped} manuel kayıt korunarak atlandı.` : ""
        }${syncResult.locked + cleanupResult.locked ? ` ${syncResult.locked + cleanupResult.locked} kilitli gün değiştirilemedi.` : ""}`,
      );
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
      reportType: record.reportType ?? "illness",
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
      status: record.status,
      sgkNotified: Boolean(record.sgkNotified),
      sgkNotificationDate: record.sgkNotificationDate ?? "",
      notificationDeadline: record.notificationDeadline ?? "",
      reminderEnabled: record.reminderEnabled !== false,
      notes: record.notes,
    });
  }

  async function handleDeleteIncapacityReport(record: IncapacityReportRecord) {
    if (!window.confirm("İş göremezlik raporu silinsin mi?")) return;
    setBusy(true);
    try {
      const syncResult = await syncIncapacityAttendance({ ...record, status: "cancelled" }, record);
      await deleteIncapacityReport(record.id);
      await saveAuditLog("İş göremezlik raporu silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`, record.staffId);
      await refreshHrRecords();
      if (record.startDate <= selectedDate && record.endDate >= selectedDate) await refreshAttendance(selectedDate);
      await refreshAuditLogs();
      setMessage(
        `İş göremezlik raporu silindi; ${syncResult.removed} otomatik puantaj kaydı kaldırıldı.${
          syncResult.locked ? ` ${syncResult.locked} kilitli gün değiştirilemedi.` : ""
        }`,
      );
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
      await saveAuditLog(holidayWorkForm.id ? "Resmi tatil çalışması güncellendi" : "Resmi tatil çalışması eklendi", `${record.date} - ${staffById.get(staffId)?.name ?? staffId}`, staffId);
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
      await saveAuditLog("Resmi tatil çalışması silindi", `${record.date} - ${staffById.get(record.staffId)?.name ?? record.staffId}`, record.staffId);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("Resmi tatil çalışma kaydı silindi.");
    } catch {
      setMessage("Resmi tatil çalışma kaydı silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function resetHourlyLeaveForm() {
    setHourlyLeaveForm({
      id: "",
      staffId: activeStaff[0]?.id ?? "",
      date: todayIso(),
      startTime: settings.shiftStart,
      endTime: addMinutesToTime(settings.shiftStart, 60),
      reason: "",
      status: "used",
      notes: "",
    });
  }

  async function handleSaveHourlyLeave(event: FormEvent) {
    event.preventDefault();
    const staffId = hourlyLeaveForm.staffId || activeStaff[0]?.id || "";
    if (!staffId) {
      setMessage("Saatlik izin kaydı için personel seçin.");
      return;
    }

    const minutes = calculateHourlyLeaveMinutes(hourlyLeaveForm.startTime, hourlyLeaveForm.endTime);
    if (!minutes) {
      setMessage("Saatlik izin kaydı için geçerli başlangıç ve bitiş saati girin.");
      return;
    }

    const existing = hourlyLeaveRecords.find((record) => record.id === hourlyLeaveForm.id);
    const record: HourlyLeaveRecord = {
      id: hourlyLeaveForm.id || crypto.randomUUID(),
      staffId,
      date: hourlyLeaveForm.date,
      startTime: hourlyLeaveForm.startTime,
      endTime: hourlyLeaveForm.endTime,
      minutes,
      reason: hourlyLeaveForm.reason.trim(),
      status: hourlyLeaveForm.status,
      notes: hourlyLeaveForm.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBusy(true);
    try {
      await saveHourlyLeaveRecord(record);
      await saveAuditLog(hourlyLeaveForm.id ? "Saatlik izin kaydı güncellendi" : "Saatlik izin kaydı eklendi", `${record.date} - ${staffById.get(staffId)?.name ?? staffId}`, staffId);
      await refreshHrRecords();
      await refreshAuditLogs();
      setHourlyLeaveReportMonth(record.date.slice(0, 7));
      resetHourlyLeaveForm();
      setMessage("Saatlik izin kaydı kaydedildi.");
    } catch {
      setMessage("Saatlik izin kaydı kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditHourlyLeave(record: HourlyLeaveRecord) {
    setHourlyLeaveForm({
      id: record.id,
      staffId: record.staffId,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      reason: record.reason,
      status: record.status,
      notes: record.notes,
    });
  }

  async function handleDeleteHourlyLeave(record: HourlyLeaveRecord) {
    if (!window.confirm("Saatlik izin kaydı silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteHourlyLeaveRecord(record.id);
      await saveAuditLog("Saatlik izin kaydı silindi", `${record.date} - ${staffById.get(record.staffId)?.name ?? record.staffId}`, record.staffId);
      await refreshHrRecords();
      await refreshAuditLogs();
      setMessage("Saatlik izin kaydı silindi.");
    } catch {
      setMessage("Saatlik izin kaydı silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadHourlyLeaveFormPdf(
    form: HourlyLeaveFormState | HourlyLeaveRecord = hourlyLeaveForm,
  ) {
    const staffId = form.staffId || activeStaff[0]?.id || "";
    const staffMember = staffById.get(staffId);
    if (!staffMember) {
      setMessage("Mazeret izin formu için personel seçin.");
      return;
    }

    const minutes = calculateHourlyLeaveMinutes(form.startTime, form.endTime);
    if (!form.date || !minutes) {
      setMessage("Mazeret izin formu için geçerli tarih ve saat aralığı girin.");
      return;
    }

    try {
      const pdfMakeModule = await import("pdfmake/build/pdfmake");
      const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
      const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as any;
      configurePdfMake(pdfMake, pdfFonts);

      const endDateIso = getHourlyLeaveEndDate(form.date, form.startTime, form.endTime);
      const startDateTime = `${formatDateDotTr(form.date)} / ${form.startTime}`;
      const endDateTime = `${formatDateDotTr(endDateIso)} / ${form.endTime}`;
      const duration = formatHourlyLeaveFormDuration(minutes);
      const borderColor = "#111111";
      const layout = annualLeavePdfLayout(borderColor);
      const innerMargin = [70, 0, 70, 12];
      const headingCell = (text: string) => ({
        text,
        bold: true,
        colSpan: 2,
        margin: [0, 1, 0, 1],
      });
      const labelCell = (text: string, bold = false) => ({
        text,
        bold,
        margin: [0, 1, 0, 1],
      });
      const valueCell = (text: string) => ({
        text,
        margin: [0, 1, 0, 1],
      });

      const docDefinition = {
        pageSize: "A4",
        pageMargins: [40, 30, 40, 36],
        defaultStyle: { font: "Roboto", fontSize: 8.4, lineHeight: 1.08 },
        styles: {
          title: { fontSize: 10.5, bold: true, alignment: "center", margin: [0, 0, 0, 12] },
          approvalHeading: { fontSize: 9, bold: true, alignment: "center" },
          approvalText: { fontSize: 9.2 },
          instruction: { fontSize: 9.3, bold: true, lineHeight: 1.15 },
        },
        content: [
          { text: "MAZERET İZİN FORMU", style: "title" },
          {
            table: {
              widths: [230, 142],
              body: [
                [headingCell("İzin İsteminde Bulunan Personelin"), ""],
                [labelCell("Adı ve Soyadı"), valueCell(staffMember.name.toLocaleUpperCase("tr-TR"))],
                [labelCell("Ünvanı"), valueCell((staffMember.title || "").toLocaleUpperCase("tr-TR"))],
                [labelCell("Toplam İzin Süresi"), valueCell(duration)],
              ],
            },
            layout,
            margin: innerMargin,
          },
          {
            table: {
              widths: [230, 142],
              heights: (rowIndex: number) => (rowIndex === 4 ? 24 : 14),
              body: [
                [headingCell("Kullanılacak İzin"), ""],
                [labelCell("Başlangıç Tarihi/Saat"), valueCell(startDateTime)],
                [labelCell("Bitiş Tarihi/Saati (Tatile Rastlasa Bile Bitiş Günü Yazılır)"), valueCell(endDateTime)],
                [labelCell("Göreve Başlayacağı Tarih/Saat"), valueCell(endDateTime)],
                [labelCell("Talep Eden Çalışanın İmzası", true), ""],
              ],
            },
            layout,
            margin: innerMargin,
          },
          {
            table: {
              widths: [372],
              heights: (rowIndex: number) => (rowIndex === 0 ? 14 : 67),
              body: [
                [{ text: "PERSONELİN İZİN KULLANDIĞINA DAİR ONAYI", style: "approvalHeading", margin: [0, 1, 0, 1] }],
                [
                  {
                    stack: [
                      {
                        text: [
                          { text: `${startDateTime}  ve ` },
                          { text: `${endDateTime} tarihinde iznimi kullandım. `, bold: true },
                          { text: `${endDateTime} tarihinde görevime başladım.`, bold: true },
                        ],
                        style: "approvalText",
                        margin: [4, 10, 4, 12],
                      },
                      {
                        columns: [
                          { text: "Ad Soyad:", bold: true, width: "50%" },
                          { text: "İmza:", bold: true, width: "50%" },
                        ],
                        margin: [4, 0, 4, 0],
                      },
                    ],
                  },
                ],
              ],
            },
            layout,
            margin: innerMargin,
          },
          {
            table: {
              widths: [372],
              heights: () => 86,
              body: [
                [
                  {
                    stack: [
                      {
                        text: `İlgili Personel ${endDateTime} tarihinde izinden dönmüş ve ${endDateTime} tarihinde görevine başlamıştır.`,
                        margin: [0, 10, 0, 18],
                      },
                      { text: "ONAY", bold: true },
                    ],
                  },
                ],
              ],
            },
            layout,
            margin: [70, 0, 70, 28],
          },
          {
            ol: [
              "Bu form iki nüsha olarak düzenlenir. Birinci nüshası ilgili birimde saklanır. İkinci nüshası ilgilinin izinden dönüşünden sonra gerekli kısımları doldurulup onaylanarak amirine teslim edilir.",
              "Amiri bayi merkezine ya da muhasebeye ilgili ay içerisinde teslim eder.",
              "Farklı tarihleri kapsayan her izin dönemi için ayrı ayrı izin formu kullanılması gerekir.",
            ].map((text) => ({ text, style: "instruction", margin: [0, 0, 0, 24] })),
            margin: [26, 0, 26, 0],
          },
        ],
      };

      pdfMake
        .createPdf(docDefinition)
        .download(`${safeFilename(staffMember.name || "personel")}-mazeret-izin-formu-${form.date}.pdf`);
    } catch {
      setMessage("Mazeret izin formu PDF'i oluşturulamadı. Lütfen tekrar deneyin.");
    }
  }

  function resetAnnualLeaveForm() {
    const staffId = activeStaff[0]?.id ?? "";
    const year = getCurrentYear();
    setAnnualLeaveForm({
      id: "",
      staffId,
      year,
      leaveType: "annual",
      startDate: todayIso(),
      endDate: todayIso(),
      entitlementDays: staffId ? getAnnualEntitlementForStaff(staffId, year, annualLeaveRecords, staffById) : 14,
      status: "planned",
      notes: "",
    });
  }

  function getAnnualLeaveFormEntitlement(staffId: string, year: number) {
    return staffId ? getAnnualEntitlementForStaff(staffId, year, annualLeaveRecords, staffById) : 14;
  }

  function handleAnnualLeaveStaffChange(staffId: string) {
    setAnnualLeaveForm((previous) => ({
      ...previous,
      staffId,
      entitlementDays: getAnnualLeaveFormEntitlement(staffId, Number(previous.year) || getCurrentYear()),
    }));
  }

  function handleAnnualLeaveYearChange(year: number) {
    setAnnualLeaveForm((previous) => ({
      ...previous,
      year,
      entitlementDays: getAnnualLeaveFormEntitlement(previous.staffId, year || getCurrentYear()),
    }));
  }

  function handleAnnualLeaveStartDateChange(startDate: string) {
    const year = Number(startDate.slice(0, 4)) || annualLeaveForm.year || getCurrentYear();
    setAnnualLeaveForm((previous) => ({
      ...previous,
      startDate,
      year,
      entitlementDays: getAnnualLeaveFormEntitlement(previous.staffId, year),
    }));
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
      await saveAuditLog(annualLeaveForm.id ? "Yıllık izin kaydı güncellendi" : "Yıllık izin kaydı eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`, staffId);
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
      await saveAuditLog("Yıllık izin kaydı silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`, record.staffId);
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
      status: existing?.status === "cancelled"
        ? "cancelled"
        : getUnpaidLeaveAutomaticStatus(unpaidLeaveForm.endDate, todayIso()),
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
      await saveAuditLog(unpaidLeaveForm.id ? "Ücretsiz izin kaydı güncellendi" : "Ücretsiz izin kaydı eklendi", `${record.startDate} - ${staffById.get(staffId)?.name ?? staffId}`, staffId);
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
      status: record.status === "cancelled"
        ? "cancelled"
        : getUnpaidLeaveAutomaticStatus(record.endDate, todayIso()),
      notes: record.notes,
    });
  }

  async function handleDeleteUnpaidLeave(record: AnnualLeaveRecord) {
    if (!window.confirm("Ücretsiz izin kaydı silinsin mi?")) return;
    setBusy(true);
    try {
      await deleteAnnualLeaveRecord(record.id);
      await saveAuditLog("Ücretsiz izin kaydı silindi", `${record.startDate} - ${staffById.get(record.staffId)?.name ?? record.staffId}`, record.staffId);
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
    configurePdfMake(pdfMake, pdfFonts);

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
    configurePdfMake(pdfMake, pdfFonts);

    const { firstName, lastName } = splitStaffName(staffMember.name);
    const startDate = formatDateDotTr(unpaidLeaveForm.startDate);
    const endDate = formatDateDotTr(unpaidLeaveForm.endDate);
    const returnDate = formatDateDotTr(getNextCalendarDateIso(unpaidLeaveForm.endDate));
    const startDayName = formatWeekdayTr(unpaidLeaveForm.startDate);
    const departureLabel = getStaffDepartureLabel(staffMember);
    const hasLeftEmployment = !staffMember.active;
    const employmentResultText = hasLeftEmployment
      ? `İlgili personel${staffMember.endDate ? ` ${formatDateDotTr(staffMember.endDate)} tarihinde` : ""} işten ayrılmıştır.`
      : `İlgili Personel ${endDate} tarihinde izinden dönmüş ve ${returnDate} tarihinde görevine başlamıştır.`;
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
          text: `Yukarıda belirttiğim tarihler arasında kişisel işlerim nedeniyle toplam ${usedDays} (${numberToTurkishText(usedDays)}) gün\nücretsiz izin kullandım. ${hasLeftEmployment ? `${departureLabel}.` : `${returnDate} Tarihinde işbaşı yaptım.`} Gereğinin yapılmasını arz ederim.`,
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
              [cell(hasLeftEmployment ? "PERSONEL DURUMU" : "İŞ BAŞI TARİHİ"), cell(hasLeftEmployment ? departureLabel : returnDate)],
            ],
          },
          layout,
          margin: [0, 0, 0, 48],
        },
        { text: employmentResultText, fontSize: 9.4, bold: hasLeftEmployment, margin: [0, 0, 0, 20] },
        { text: "Onay", style: "boldCenter" },
      ],
    };

    pdfMake.createPdf(docDefinition).download(`${safeFilename(staffMember.name || "personel")}-ucretsiz-izin-formu-${unpaidLeaveForm.startDate}.pdf`);
  }

  async function handleLoadReport() {
    setBusy(true);
    try {
      const ranges = getReportComparisonRanges(reportStart, reportEnd);
      const [records, previousMonthRecords, previousYearRecords] = await Promise.all([
        loadAttendanceRange(reportStart, reportEnd),
        loadAttendanceRange(ranges.previousMonth.start, ranges.previousMonth.end),
        loadAttendanceRange(ranges.previousYear.start, ranges.previousYear.end),
      ]);
      const sortRecords = (rows: AttendanceRecord[]) =>
        [...rows].sort((a, b) => {
          const dateSort = a.date.localeCompare(b.date);
          if (dateSort !== 0) return dateSort;
          return (staffRankById.get(a.staffId) ?? 0) - (staffRankById.get(b.staffId) ?? 0);
        });
      setReportRows(sortRecords(records));
      setPreviousMonthReportRows(sortRecords(previousMonthRecords));
      setPreviousYearReportRows(sortRecords(previousYearRecords));
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
      const ranges = getReportComparisonRanges(start, end);
      const [records, previousMonthRecords, previousYearRecords] = await Promise.all([
        loadAttendanceRange(start, end),
        loadAttendanceRange(ranges.previousMonth.start, ranges.previousMonth.end),
        loadAttendanceRange(ranges.previousYear.start, ranges.previousYear.end),
      ]);
      const sortRecords = (rows: AttendanceRecord[]) =>
        [...rows].sort((a, b) => {
          const dateSort = a.date.localeCompare(b.date);
          if (dateSort !== 0) return dateSort;
          return (staffRankById.get(a.staffId) ?? 0) - (staffRankById.get(b.staffId) ?? 0);
        });
      setReportRows(sortRecords(records));
      setPreviousMonthReportRows(sortRecords(previousMonthRecords));
      setPreviousYearReportRows(sortRecords(previousYearRecords));
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

  async function handleDownloadManagementSummaryPdf() {
    try {
      const pdfMakeModule = await import("pdfmake/build/pdfmake");
      const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
      const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as any;
      configurePdfMake(pdfMake, pdfFonts);
      const metricBody = [
        ["Gösterge", "Dönem", "Önceki Ay", "Geçen Yıl"],
        ["Dönem Sonu Personel", workforceReport.closing, previousMonthWorkforce.closing, previousYearWorkforce.closing],
        ["İşe Alınan", workforceReport.hires, previousMonthWorkforce.hires, previousYearWorkforce.hires],
        ["İşten Çıkan", workforceReport.exits, previousMonthWorkforce.exits, previousYearWorkforce.exits],
        ["İşe Gelinen Gün", attendanceReport.attendedDays, previousMonthAttendance.attendedDays, previousYearAttendance.attendedDays],
        ["Devam Oranı", `%${attendanceRate}`, "-", "-"],
        ["Devamsızlık Oranı", `%${absenceRate}`, "-", "-"],
        ["İzin/Rapor Günü", leaveReport.totalDays, "-", "-"],
      ];
      const docDefinition = {
        pageSize: "A4",
        pageMargins: [36, 36, 36, 36],
        defaultStyle: { font: "Roboto", fontSize: 9, color: "#263a5d" },
        content: [
          { text: settings.companyName, fontSize: 11, bold: true, color: "#356cff" },
          { text: "YÖNETİCİ İK ÖZETİ", fontSize: 19, bold: true, margin: [0, 5, 0, 3] },
          { text: `${reportStart} - ${reportEnd}${reportDepartment !== "all" ? ` · ${reportDepartment}` : ""}`, color: "#64748b", margin: [0, 0, 0, 16] },
          { text: "Dönem Değerlendirmesi", fontSize: 13, bold: true, margin: [0, 0, 0, 7] },
          { ul: managementSummaryLines, margin: [0, 0, 0, 16] },
          {
            table: { headerRows: 1, widths: ["*", 60, 60, 60], body: metricBody },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 16],
          },
          { text: "Kritik Listeler", fontSize: 13, bold: true, margin: [0, 0, 0, 7] },
          { text: `Ardışık devamsızlık: ${consecutiveAbsenceRows.length} personel · İlk 90 günde ayrılan: ${earlyExitRows.length} personel · Eksik personel tarihi: ${workforceReport.missingDates}`, margin: [0, 0, 0, 10] },
          { text: `Oluşturulma: ${new Date().toLocaleString("tr-TR")}`, fontSize: 7, color: "#94a3b8", margin: [0, 18, 0, 0] },
        ],
      };
      pdfMake.createPdf(docDefinition).download(`yonetici-ik-ozeti-${reportStart}-${reportEnd}.pdf`);
    } catch {
      setMessage("Yönetici özeti PDF dosyası oluşturulamadı.");
    }
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
    const workforceRows: Array<Array<string | number>> = [
      ["Gösterge", "Değer"],
      ["Dönem Başı Personel", workforceReport.opening],
      ["İşe Alınan Personel", workforceReport.hires],
      ["İşten Çıkan Personel", workforceReport.exits],
      ["Dönem Sonu Personel", workforceReport.closing],
      ["Net Değişim", workforceReport.net],
      ["Ortalama Personel", workforceReport.average],
      ["Devir Oranı (%)", workforceReport.turnoverRate],
      ["Eksik Giriş / Çıkış Tarihi", workforceReport.missingDates],
    ];
    const movementRows: Array<Array<string | number>> = [
      ["Tarih", "Hareket", "Personel", "Departman", "Ünvan", "Çıkış Türü", "Çıkış Nedeni"],
      ...workforceReport.movements.map((row) => [
        row.date,
        row.kind === "hire" ? "İşe alındı" : "İşten çıktı",
        row.staff.name,
        row.staff.department,
        row.staff.title,
        row.kind === "exit" ? departureTypeLabels[row.staff.departureType ?? ""] ?? row.staff.departureType ?? "" : "",
        row.kind === "exit" ? row.staff.departureReason ?? "" : "",
      ]),
    ];
    const attendanceOverviewRows: Array<Array<string | number>> = [
      ["Gösterge", "Değer"],
      ["Giriş Kaydı Olan Personel", attendanceReport.uniqueCheckIns],
      ["Toplam İşe Gelinen Gün", attendanceReport.attendedDays],
      ["Geç Kalan Personel", attendanceReport.latePeople],
      ["Geç Kalınan Gün", attendanceReport.lateDays],
      ["Gelmeyen Personel", attendanceReport.absentPeople],
      ["Gelinmeyen Gün", attendanceReport.absentDays],
      ["İzinli Gün", attendanceReport.excusedDays],
      ["Toplam Gecikme (Dk)", attendanceReport.totalLateMinutes],
      ["Ortalama Gecikme (Dk)", attendanceReport.averageLateMinutes],
      ["Beklenen Çalışma Günü", expectedAttendanceDays],
      ["Devam Oranı (%)", attendanceRate],
      ["Devamsızlık Oranı (%)", absenceRate],
    ];
    const leaveRows: Array<Array<string | number>> = [
      ["İzin / Rapor", "Personel", "Kayıt", "Gün", "Dakika"],
      ...leaveReport.categories.map((row) => [row.label, row.people, row.records, row.days, row.minutes]),
    ];
    const departmentRows: Array<Array<string | number>> = [
      ["Departman", "Hedef Kadro", "Mevcut", "Hedef Farkı", "Dönem Başı", "İşe Alınan", "İşten Çıkan", "Net", "Devir %", "Giriş Yapan", "Gelinen Gün", "Geç", "Gelmedi", "İzin/Rapor Günü"],
      ...departmentComparisonRows.map((row) => [
        row.department,
        settings.departmentHeadcountTargets[row.department] ?? 0,
        row.closing,
        (settings.departmentHeadcountTargets[row.department] ?? 0) - row.closing,
        row.opening,
        row.hires,
        row.exits,
        row.closing,
        row.net,
        row.turnoverRate,
        row.uniqueCheckIns,
        row.attendedDays,
        row.lateDays,
        row.absentDays,
        row.leaveDays,
      ]),
    ];
    const trendRows: Array<Array<string | number>> = [
      ["Ay", "Dönem Başı", "İşe Alınan", "İşten Çıkan", "Dönem Sonu", "Net", "Devir %"],
      ...workforceTrendRows.map((row) => [row.month, row.opening, row.hires, row.exits, row.closing, row.net, row.turnoverRate]),
    ];
    const comparisonRows: Array<Array<string | number>> = [
      ["Gösterge", "Seçili Dönem", "Önceki Ay", "Geçen Yıl"],
      ["Dönem Sonu Personel", workforceReport.closing, previousMonthWorkforce.closing, previousYearWorkforce.closing],
      ["İşe Alınan", workforceReport.hires, previousMonthWorkforce.hires, previousYearWorkforce.hires],
      ["İşten Çıkan", workforceReport.exits, previousMonthWorkforce.exits, previousYearWorkforce.exits],
      ["İşe Gelinen Gün", attendanceReport.attendedDays, previousMonthAttendance.attendedDays, previousYearAttendance.attendedDays],
    ];
    const consecutiveRows: Array<Array<string | number>> = [
      ["Personel", "Departman", "Ardışık Gün", "Başlangıç", "Bitiş"],
      ...consecutiveAbsenceRows.map((row) => [staffById.get(row.staffId)?.name ?? "", staffById.get(row.staffId)?.department ?? "", row.maxConsecutiveDays, "", row.latestAbsenceDate]),
    ];
    const earlyExitExportRows: Array<Array<string | number>> = [
      ["Personel", "Departman", "İşe Giriş", "İşten Çıkış", "Çalışma Süresi", "Çıkış Türü", "Neden"],
      ...earlyExitRows.map((row) => [row.staff.name, row.staff.department, row.staff.startDate ?? "", row.staff.endDate ?? "", row.employmentDays, departureTypeLabels[row.staff.departureType ?? ""] ?? row.staff.departureType ?? "", row.staff.departureReason ?? ""]),
    ];
    const leaveDensityExportRows: Array<Array<string | number>> = [
      ["Tarih", "Kişi Sayısı", "Personeller"],
      ...futureLeaveDensityRows.map((row) => [row.date, row.staffIds.length, row.staffIds.map((staffId) => staffById.get(staffId)?.name).filter(Boolean).join(", ")]),
    ];
    const personPart = reportStaffId === "all" ? "tum-personel" : staffById.get(reportStaffId)?.name ?? "personel";
    downloadExcelFile(`personel-rapor-${personPart}-${reportStart}-${reportEnd}.xls`, [
      { title: "Genel Bakış", rows: workforceRows },
      { title: "Dönem Karşılaştırması", rows: comparisonRows },
      { title: "Personel Hareketleri", rows: movementRows },
      { title: "Devamlılık Göstergeleri", rows: attendanceOverviewRows },
      { title: "Aylık Özet", rows: summaryRows },
      { title: "Detay Kayıtları", rows: detailRows },
      { title: "İzin ve Raporlar", rows: leaveRows },
      { title: "Ardışık Devamsızlık", rows: consecutiveRows },
      { title: "İlk 90 Günde Ayrılan", rows: earlyExitExportRows },
      { title: "İzin Yoğunluğu", rows: leaveDensityExportRows },
      { title: "Departman Karşılaştırması", rows: departmentRows },
      { title: "Son 12 Ay Personel Hareketi", rows: trendRows },
    ]);
  }

  async function handleDownloadBackup() {
    setBusy(true);
    try {
      const [allAttendance, allDayLocks] = await Promise.all([
        loadAttendanceRange("2000-01-01", "2100-12-31"),
        loadDayLocks(),
      ]);
      const backup = {
        exportedAt: new Date().toISOString(),
        firebaseProjectId,
        settings,
        staff,
        attendance: allAttendance,
        printArchives,
        dayLocks: allDayLocks,
        deletedAttendance,
        incapacityReports,
        holidayWorkRecords,
        hourlyLeaveRecords,
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

  async function handleRestoreBackupFile(file: File | null) {
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as AppBackup;
      const hasRestorableData = [
        parsed.staff,
        parsed.attendance,
        parsed.incapacityReports,
        parsed.holidayWorkRecords,
        parsed.hourlyLeaveRecords,
        parsed.annualLeaveRecords,
      ].some(Array.isArray);
      if (!hasRestorableData) {
        setMessage("Seçilen dosya geçerli bir personel yedeği değil.");
        return;
      }

      if (!window.confirm("Yedek mevcut verilerle birleştirilecek. Aynı kimlikteki kayıtlar yedekteki sürümle güncellensin mi?")) return;

      setBusy(true);
      await restoreBackup(parsed);
      if (parsed.settings) {
        const restoredSettings = { ...defaultSettings, ...parsed.settings };
        setSettings(restoredSettings);
        saveSettings(restoredSettings);
        await saveAppSettings(restoredSettings);
      }
      await Promise.all([
        refreshStaff(),
        refreshAttendance(selectedDate),
        refreshPrintArchives(),
        refreshDayLock(selectedDate),
        refreshAuditLogs(),
        refreshDeletedAttendance(),
        refreshHrRecords(),
      ]);
      await saveAuditLog("Yedek geri yüklendi", file.name);
      await refreshAuditLogs();
      setMessage("Yedek mevcut verilerle birleştirilerek geri yüklendi.");
    } catch (error) {
      console.warn("Backup restore failed.", error);
      setMessage("Yedek geri yüklenemedi. Dosya biçimini, bağlantıyı ve yönetici yetkisini kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function getIncapacityExportRows() {
    return [
      ["Rapor Numarası", "Rapor Türü", "Personel", "Departman", "Ünvan", "Başlangıç", "Bitiş", "Gün", "Rapor Nedeni", "Durum", "SGK Bildirimi", "Bildirim Tarihi", "Son Tarih", "Not"],
      ...incapacityRowsForMonth.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.reportNumber?.trim() || "-",
          incapacityReportTypeLabels[record.reportType ?? "illness"],
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.startDate,
          record.endDate,
          record.dayCount,
          record.reason,
          incapacityStatusLabels[record.status],
          record.sgkNotified ? "Yapıldı" : "Bekliyor",
          record.sgkNotificationDate ?? "",
          record.notificationDeadline ?? "",
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

  function getHourlyLeaveExportRows() {
    return [
      ["Personel", "Departman", "Ünvan", "Kayıt", "Tarihler", "Saat Detayları", "Toplam Süre", "Toplam Dakika", "Gün", "Durum Özeti", "Sebepler", "Notlar"],
      ...hourlyLeaveGroups.map((group) => {
        const member = staffById.get(group.staffId);
        return [
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          group.records.length,
          group.dates.join(", "),
          group.timeRanges.join(", "),
          formatLeaveDuration(group.minutes),
          group.minutes,
          getHourlyLeaveDays(group.minutes),
          group.statusSummary,
          group.reasons.join(" / "),
          group.notes.join(" / "),
        ];
      }),
    ];
  }

  function handleExportHourlyLeaveExcel() {
    downloadExcelFile(`saatlik-izin-raporu-${hourlyLeaveReportMonth}.xls`, [
      { title: `${formatMonthTr(hourlyLeaveReportMonth)} Saatlik İzin Raporu`, rows: getHourlyLeaveExportRows() },
    ]);
  }

  function handlePrintHourlyLeaveReport() {
    setPrintMode("hourlyLeave");
    window.setTimeout(() => {
      window.print();
      setPrintMode("signature");
    }, 0);
  }

  function getLeaveExportRows(records: AnnualLeaveRecord[]) {
    return [
      ["Personel", "Departman", "Ünvan", "Yıl", "Tür", "Başlangıç", "Bitiş", "Toplam Gün", "Kullanıldı", "Planlanan", "Durum", "Not"],
      ...records.map((record) => {
        const member = staffById.get(record.staffId);
        const annualBreakdown = getAnnualLeaveUsageBreakdown(record);
        return [
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.year,
          annualLeaveTypeLabels[record.leaveType],
          record.startDate,
          record.endDate,
          record.usedDays,
          annualBreakdown.used,
          annualBreakdown.planned,
          getAnnualLeaveDisplayStatus(record),
          record.notes,
        ];
      }),
    ];
  }

  function getGroupedLeaveExportRows(groups: LeaveGroup[]) {
    return [
      ["Personel", "Personel Durumu", "Departman", "Ünvan", "Kayıt", "Yıl", "Tür", "Tarih Aralıkları", "Toplam Gün", "Durum Özeti", "Notlar"],
      ...groups.map((group) => {
        const member = staffById.get(group.staffId);
        return [
          member?.name ?? "",
          getStaffDepartureLabel(member),
          member?.department ?? "",
          member?.title ?? "",
          group.records.length,
          group.year,
          annualLeaveTypeLabels[group.leaveType],
          group.dateRanges.join(", "),
          group.usedDays,
          group.statusSummary,
          group.notes.join(" / "),
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
    const sections = [
      {
        title: `${formatMonthTr(unpaidLeaveReportMonth)} Ücretsiz İzin Raporu - Aktif Personel`,
        rows: getGroupedLeaveExportRows(activeUnpaidLeaveGroupsForMonth),
      },
    ];
    if (departedUnpaidLeaveGroupsForMonth.length) {
      sections.push({
        title: `${formatMonthTr(unpaidLeaveReportMonth)} Ücretsiz İzin Raporu - İşten Ayrılmış Personel`,
        rows: getGroupedLeaveExportRows(departedUnpaidLeaveGroupsForMonth),
      });
    }
    downloadExcelFile(`ucretsiz-izin-raporu-${unpaidLeaveReportMonth}.xls`, sections);
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
              <p className="eyebrow">Personel</p>
              <strong>İK Yönetimi</strong>
            </div>
          </div>

          <p className="side-nav-label">Yönetim</p>
          <NavigationTabs className="tabbar" activeTab={activeTab} onSelect={setActiveTab} />

          <div className="side-footer">
            <span className={`side-status ${firebaseConfigured ? "is-online" : "is-local"}`}>
              <Database size={16} aria-hidden="true" />
              {firebaseConfigured ? "Firebase bağlı" : "Yerel taslak"}
            </span>
            <span className="side-company" title={settings.companyName}>
              <ShieldCheck size={16} aria-hidden="true" />
              {settings.companyName}
            </span>
          </div>
        </aside>

        <div className="content-shell">
          <header className="topbar">
            <div className="page-title">
              <p className="eyebrow">Merhaba, Yönetici</p>
              <h1>
                Bugün <strong>{formatDateTr(todayIso())}</strong>
                <span>{tabs.find((tab) => tab.key === activeTab)?.label ?? "Yönetici Paneli"}</span>
              </h1>
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
              <span className="app-launcher" aria-hidden="true">
                <Grid3X3 size={20} />
              </span>
            </div>
          </header>

          <NavigationTabs className="mobile-tabbar" activeTab={activeTab} onSelect={setActiveTab} />

          {message && <div className="notice">{message}</div>}

        {activeTab === "home" && (
          <HomeDashboard
            settings={settings}
            adminEmail={admin?.email ?? null}
            activeStaff={activeStaff}
            annualLeaveRecords={annualLeaveRecords}
            auditLogs={auditLogs}
            dailyStats={dailyStats}
            onNavigate={setActiveTab}
            onOpenProfile={(staffId) => {
              setProfileStaffId(staffId);
              setActiveTab("profiles");
            }}
          />
        )}

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
                      const incapacityReport = findIncapacityReportForDate(incapacityReports, member.id, selectedDate);
                      const lateMinutes = getLateMinutes(draft.checkInTime, settings);
                      const status = incapacityReport ? "excused" : getDraftStatus(draft, settings);
                      const rowDisabled = selectedDayLocked || Boolean(incapacityReport);

                      return (
                        <tr key={member.id} className={getStatusRowClass(status)}>
                          <td className="number-cell">{index + 1}</td>
                          <td>
                            <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}>
                              <strong>{member.name}</strong>
                              <span>{[member.department, member.title].filter(Boolean).join(" / ")}</span>
                              {incapacityReport && (
                                <small>Raporlu: {incapacityReportTypeLabels[incapacityReport.reportType ?? "illness"]}</small>
                              )}
                            </button>
                          </td>
                          <td>
                            <input
                              type="time"
                              value={draft.checkInTime}
                              disabled={rowDisabled}
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
                              value={incapacityReport ? "excused" : draft.status}
                              disabled={rowDisabled}
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
                              value={incapacityReport ? `İş göremezlik raporu${incapacityReport.reportNumber ? ` (${incapacityReport.reportNumber})` : ""}` : draft.lateReason}
                              disabled={rowDisabled}
                              onChange={(event) => updateDraft(member.id, { lateReason: event.target.value })}
                              placeholder="Geç kalma / izin açıklaması"
                            />
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              onClick={() => void handleClearRecord(member.id)}
                              disabled={rowDisabled}
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
                  explanations={signatureExplanations}
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
              <button className="secondary-action" onClick={handleExportExcel} disabled={!staff.length}>
                <FileSpreadsheet size={18} aria-hidden="true" />
                Excel
              </button>
              <button className="primary-action" onClick={handleExportCsv} disabled={!filteredReportRows.length}>
                <FileDown size={18} aria-hidden="true" />
                CSV
              </button>
            </section>

            <section className="report-view-tabs" aria-label="Rapor bölümleri">
              {([
                ["overview", "Genel Bakış"],
                ["movements", "Personel Hareketleri"],
                ["attendance", "Devamlılık"],
                ["leave", "İzin ve Raporlar"],
                ["departments", "Departman Karşılaştırması"],
              ] as Array<[ReportView, string]>).map(([key, label]) => (
                <button key={key} className={reportView === key ? "is-active" : ""} onClick={() => setReportView(key)}>
                  {label}
                </button>
              ))}
            </section>

            {reportView === "overview" && (
              <>
                <section className="metric-row report-workforce-metrics" aria-label="Personel hareketleri özeti">
                  <Metric label="Dönem Başı" value={workforceReport.opening} />
                  <Metric label="İşe Alınan" value={workforceReport.hires} tone="green" />
                  <Metric label="İşten Çıkan" value={workforceReport.exits} tone="red" />
                  <Metric label="Dönem Sonu" value={workforceReport.closing} tone="blue" />
                  <Metric label="Net Değişim" value={workforceReport.net} tone={workforceReport.net < 0 ? "red" : "green"} />
                  <Metric label="Devir Oranı" value={workforceReport.turnoverRate} suffix="%" tone="amber" />
                  <Metric label="Giriş Kaydı Olan" value={attendanceReport.uniqueCheckIns} tone="blue" />
                </section>

                <section className="report-narrative" aria-label="Dönem özeti">
                  <div>
                    <span>{reportDepartment === "all" ? "Tüm şirket" : reportDepartment}</span>
                    <strong>
                      Bu dönemde {workforceReport.hires} personel işe alındı, {workforceReport.exits} personel işten çıktı.
                    </strong>
                    <small>
                      Net değişim {workforceReport.net > 0 ? "+" : ""}{workforceReport.net}; dönem sonu personel sayısı {workforceReport.closing}.
                    </small>
                  </div>
                  <div className="report-narrative-stats">
                    <span><b>{attendanceReport.attendedDays}</b> işe gelinen gün</span>
                    <span><b>{attendanceReport.absentDays}</b> gelinmeyen gün</span>
                    <span><b>{leaveReport.totalDays}</b> izin/rapor günü</span>
                  </div>
                </section>

                <section className="report-comparison-grid" aria-label="Dönem karşılaştırması">
                  {[
                    { label: "Dönem Sonu Personel", current: workforceReport.closing, month: workforceClosingMonthDelta, year: workforceClosingYearDelta },
                    { label: "İşe Alınan", current: workforceReport.hires, month: getMetricDelta(workforceReport.hires, previousMonthWorkforce.hires), year: getMetricDelta(workforceReport.hires, previousYearWorkforce.hires) },
                    { label: "İşten Çıkan", current: workforceReport.exits, month: getMetricDelta(workforceReport.exits, previousMonthWorkforce.exits), year: getMetricDelta(workforceReport.exits, previousYearWorkforce.exits) },
                    { label: "İşe Gelinen Gün", current: attendanceReport.attendedDays, month: attendanceMonthDelta, year: attendanceYearDelta },
                  ].map((item) => (
                    <article className="report-comparison-card" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.current}</strong>
                      <small className={item.month.difference < 0 ? "is-negative" : item.month.difference > 0 ? "is-positive" : ""}>
                        Önceki aya göre {item.month.difference > 0 ? "+" : ""}{item.month.difference} · %{item.month.percentage > 0 ? "+" : ""}{item.month.percentage}
                      </small>
                      <small className={item.year.difference < 0 ? "is-negative" : item.year.difference > 0 ? "is-positive" : ""}>
                        Geçen yıla göre {item.year.difference > 0 ? "+" : ""}{item.year.difference} · %{item.year.percentage > 0 ? "+" : ""}{item.year.percentage}
                      </small>
                    </article>
                  ))}
                </section>

                <section className="management-summary-panel">
                  <div>
                    <span>Otomatik Yönetici Özeti</span>
                    <h2>Dönemin öne çıkanları</h2>
                    <ul>{managementSummaryLines.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                  <button className="secondary-action" onClick={() => void handleDownloadManagementSummaryPdf()}>
                    <FileDown size={18} aria-hidden="true" />
                    Yönetici Özeti PDF
                  </button>
                </section>

                <WorkforceTrendChart rows={workforceTrendRows} />

                <section className="warning-panel-grid" aria-label="Yönetim uyarıları">
                  <div className="warning-panel-card">
                    <span>Eksik Personel Tarihi</span>
                    <strong>{workforceReport.missingDates}</strong>
                    <small>Giriş tarihi veya pasif personelde çıkış tarihi eksik</small>
                  </div>
                  <div className="warning-panel-card">
                    <span>Aktif Rapor</span>
                    <strong>{incapacityStats.active}</strong>
                    <small>İş göremezlik ekranında takip edilir</small>
                  </div>
                  <div className="warning-panel-card">
                    <span>Yaklaşan İzin</span>
                    <strong>{upcomingAnnualLeaves.length}</strong>
                    <small>{upcomingAnnualLeaves[0] ? `${upcomingAnnualLeaves[0].startDate} - ${staffById.get(upcomingAnnualLeaves[0].staffId)?.name ?? ""}` : "14 gün içinde yok"}</small>
                  </div>
                  <div className="warning-panel-card">
                    <span>Az Kalan İzin</span>
                    <strong>{lowAnnualLeaveRows.length}</strong>
                    <small>{lowAnnualLeaveRows[0] ? `${lowAnnualLeaveRows[0].staff.name}: ${lowAnnualLeaveRows[0].remaining} gün` : "Kritik personel yok"}</small>
                  </div>
                </section>
              </>
            )}

            {reportView === "movements" && (
              <>
                <section className="metric-row" aria-label="Personel hareketleri">
                  <Metric label="Dönem Başı" value={workforceReport.opening} />
                  <Metric label="İşe Alınan" value={workforceReport.hires} tone="green" />
                  <Metric label="İşten Çıkan" value={workforceReport.exits} tone="red" />
                  <Metric label="Dönem Sonu" value={workforceReport.closing} tone="blue" />
                  <Metric label="Ortalama Personel" value={workforceReport.average} />
                  <Metric label="Net Değişim" value={workforceReport.net} tone={workforceReport.net < 0 ? "red" : "green"} />
                  <Metric label="Devir Oranı" value={workforceReport.turnoverRate} suffix="%" tone="amber" />
                </section>
                <WorkforceTrendChart rows={workforceTrendRows} />
                <section className="data-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>İşe Giriş ve Çıkış Listesi</h2>
                      <span>{reportStart} - {reportEnd} · {workforceReport.movements.length} hareket</span>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Tarih</th><th>Hareket</th><th>Personel</th><th>Departman</th><th>Ünvan</th><th>Çıkış Türü</th><th>Çıkış Nedeni</th></tr></thead>
                      <tbody>
                        {workforceReport.movements.map((row) => (
                          <tr key={row.id}>
                            <td>{row.date}</td>
                            <td><span className={`movement-chip is-${row.kind}`}>{row.kind === "hire" ? "İşe alındı" : "İşten çıktı"}</span></td>
                            <td><button className="person-trigger" onClick={() => setSelectedStaffId(row.staff.id)}><strong>{row.staff.name}</strong></button></td>
                            <td>{row.staff.department}</td>
                            <td>{row.staff.title}</td>
                            <td>{row.kind === "exit" ? departureTypeLabels[row.staff.departureType ?? ""] ?? row.staff.departureType ?? "-" : "-"}</td>
                            <td>{row.kind === "exit" ? row.staff.departureReason || "-" : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!workforceReport.movements.length && <div className="empty-state">Seçili dönemde işe giriş veya çıkış bulunmuyor.</div>}
                </section>
                <section className="data-panel">
                  <div className="panel-heading"><div><h2>İlk 90 Günde Ayrılanlar</h2><span>İşe başladıktan sonraki ilk 90 gün içinde çıkan personeller</span></div></div>
                  <div className="table-scroll"><table className="data-table"><thead><tr><th>Personel</th><th>Departman</th><th>İşe Giriş</th><th>İşten Çıkış</th><th>Çalışma Süresi</th><th>Çıkış Türü</th><th>Neden</th></tr></thead><tbody>{earlyExitRows.map((row) => <tr key={row.staff.id}><td><button className="person-trigger" onClick={() => setSelectedStaffId(row.staff.id)}><strong>{row.staff.name}</strong></button></td><td>{row.staff.department}</td><td>{row.staff.startDate}</td><td>{row.staff.endDate}</td><td>{row.employmentDays} gün</td><td>{departureTypeLabels[row.staff.departureType ?? ""] ?? row.staff.departureType ?? "-"}</td><td>{row.staff.departureReason || "-"}</td></tr>)}</tbody></table></div>
                  {!earlyExitRows.length && <div className="empty-state">Seçili dönemde ilk 90 gün içinde ayrılan personel yok.</div>}
                </section>
              </>
            )}

            {reportView === "attendance" && (
              <>
                <section className="metric-row" aria-label="Devamlılık özeti">
                  <Metric label="Giriş Kaydı Olan" value={attendanceReport.uniqueCheckIns} tone="green" />
                  <Metric label="İşe Gelinen Gün" value={attendanceReport.attendedDays} tone="green" />
                  <Metric label="Geç Kalan Kişi" value={attendanceReport.latePeople} tone="amber" />
                  <Metric label="Geç Kalınan Gün" value={attendanceReport.lateDays} tone="amber" />
                  <Metric label="Gelmeyen Kişi" value={attendanceReport.absentPeople} tone="red" />
                  <Metric label="Gelinmeyen Gün" value={attendanceReport.absentDays} tone="red" />
                  <Metric label="Toplam Gecikme" value={attendanceReport.totalLateMinutes} suffix=" dk" tone="blue" />
                  <Metric label="Ort. Gecikme" value={attendanceReport.averageLateMinutes} suffix=" dk" />
                  <Metric label="Devam Oranı" value={attendanceRate} suffix="%" tone="green" />
                  <Metric label="Devamsızlık Oranı" value={absenceRate} suffix="%" tone="red" />
                </section>
                <section className="data-panel compact-report-list">
                  <div className="panel-heading"><div><h2>Ardışık Devamsızlık Takibi</h2><span>En az iki iş günü üst üste gelmedi kaydı bulunanlar</span></div></div>
                  <div className="report-person-list">
                    {consecutiveAbsenceRows.map((row) => { const member = staffById.get(row.staffId); return member ? <button key={row.staffId} onClick={() => setSelectedStaffId(row.staffId)}><strong>{member.name}</strong><span>{row.maxConsecutiveDays} gün ardışık · son kayıt {formatDateTr(row.latestAbsenceDate)} · {member.department}</span></button> : null; })}
                    {!consecutiveAbsenceRows.length && <div className="empty-state">Ardışık devamsızlık uyarısı yok.</div>}
                  </div>
                </section>
                <ReportCharts dailyTrendRows={dailyTrendRows} departmentRows={departmentReportRows} topAbsentRows={topAbsentRows} onSelectStaff={setSelectedStaffId} />
                {selectedPersonSummary && (
                  <section className="person-card">
                    <div><span>Kişi Karnesi</span><strong>{selectedPersonSummary.staff.name}</strong><small>{[selectedPersonSummary.staff.department, selectedPersonSummary.staff.title].filter(Boolean).join(" / ")}</small></div>
                    <Metric label="Toplam Gecikme" value={selectedPersonSummary.lateMinutes} suffix=" dk" tone="amber" />
                    <Metric label="Geç Gün" value={selectedPersonSummary.late} tone="amber" />
                    <Metric label="Gelmedi" value={selectedPersonSummary.absent} tone="red" />
                  </section>
                )}
                <section className="report-two-column">
                  <div className="data-panel compact-report-list">
                    <div className="panel-heading"><div><h2>Hiç Geç Kalmayanlar</h2><span>Seçili dönemde giriş kaydı bulunanlar</span></div></div>
                    <div className="report-person-list">
                      {punctualReportStaff.map((member) => <button key={member.id} onClick={() => setSelectedStaffId(member.id)}><strong>{member.name}</strong><span>{member.department}</span></button>)}
                      {!punctualReportStaff.length && <div className="empty-state">Uygun personel bulunmuyor.</div>}
                    </div>
                  </div>
                  <div className="data-panel compact-report-list">
                    <div className="panel-heading"><div><h2>Devamsızlık Uyarısı</h2><span>Gelmedi kaydı bulunan personeller</span></div></div>
                    <div className="report-person-list">
                      {warningRows.map((row) => <button key={row.staff.id} onClick={() => setSelectedStaffId(row.staff.id)}><strong>{row.staff.name}</strong><span>{row.absent} gün · {row.staff.department}</span></button>)}
                      {!warningRows.length && <div className="empty-state">Seçili dönemde devamsızlık yok.</div>}
                    </div>
                  </div>
                </section>
                <section className="data-panel report-summary-panel">
                  <div className="panel-heading"><div><h2>Personel Devam Özeti</h2><span>{reportStart} - {reportEnd}</span></div></div>
                  <div className="table-scroll">
                    <table className="data-table summary-table">
                      <thead><tr><th>No</th><th>Personel</th><th>Departman</th><th>Kayıt</th><th>Geldi</th><th>Geç</th><th>Gelmedi</th><th>İzinli</th><th>Gecikme Dk</th><th>Uyarı</th></tr></thead>
                      <tbody>{reportSummaryRows.map((row) => (
                        <tr key={row.staff.id} className={row.absent > 0 ? "row-status-absent" : row.late >= 3 ? "row-status-late" : ""}>
                          <td className="number-cell">{(staffRankById.get(row.staff.id) ?? 0) + 1}</td>
                          <td><button className="person-trigger" onClick={() => setSelectedStaffId(row.staff.id)}><strong>{row.staff.name}</strong><span>{row.staff.title}</span></button></td>
                          <td>{row.staff.department}</td><td>{row.total}</td><td>{row.present}</td><td>{row.late}</td><td>{row.absent}</td><td>{row.excused}</td><td>{row.lateMinutes}</td>
                          <td>{row.absent > 0 ? <span className="warning-chip">{row.absent} gelmedi</span> : "-"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
                <section className="data-panel">
                  <div className="panel-heading"><div><h2>Günlük Detay Kayıtları</h2><span>{filteredReportRows.length} kayıt</span></div></div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Tarih</th><th>Personel</th><th>Departman</th><th>Giriş</th><th>Gecikme</th><th>Durum</th><th>Açıklama</th></tr></thead>
                      <tbody>{filteredReportRows.map((record) => {
                        const member = staffById.get(record.staffId);
                        return <tr key={record.id} className={getStatusRowClass(record.status)}><td>{record.date}</td><td>{member ? <button className="person-trigger" onClick={() => setSelectedStaffId(member.id)}><strong>{member.name}</strong><span>{member.title}</span></button> : ""}</td><td>{member?.department ?? ""}</td><td>{record.checkInTime}</td><td><span className={`late-badge late-${getLateTone(getRecordLateMinutes(record, settings))}`}>{getRecordLateMinutes(record, settings) || "-"}</span></td><td><StatusPill status={record.status} /></td><td>{record.lateReason}</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {reportView === "leave" && (
              <>
                <section className="metric-row" aria-label="İzin ve rapor özeti">
                  <Metric label="İzin/Raporlu Kişi" value={leaveReport.totalPeople} tone="blue" />
                  <Metric label="Toplam Gün" value={leaveReport.totalDays} tone="blue" />
                  {leaveReport.categories.filter((row) => row.key !== "other" && row.key !== "hourly").map((row) => <Metric key={row.key} label={row.label} value={row.days} suffix=" gün" tone={row.key === "incapacity" ? "red" : row.key === "unpaid" ? "amber" : "green"} />)}
                  <Metric label="Saatlik İzin" value={leaveReport.totalHourlyMinutes} suffix=" dk" tone="amber" />
                </section>
                <section className="report-two-column">
                  <div className="data-panel">
                    <div className="panel-heading"><div><h2>İzin Türü Dağılımı</h2><span>{reportStart} - {reportEnd}</span></div></div>
                    <div className="table-scroll"><table className="data-table"><thead><tr><th>Tür</th><th>Personel</th><th>Kayıt</th><th>Gün</th><th>Süre</th></tr></thead><tbody>{leaveReport.categories.map((row) => <tr key={row.key}><td><strong>{row.label}</strong></td><td>{row.people}</td><td>{row.records}</td><td>{row.days || "-"}</td><td>{row.minutes ? formatDurationMinutes(row.minutes) : "-"}</td></tr>)}</tbody></table></div>
                  </div>
                  <div className="data-panel compact-report-list">
                    <div className="panel-heading"><div><h2>En Çok İzin/Rapor Kullananlar</h2><span>Gün, ardından saatlik izin sıralaması</span></div></div>
                    <div className="report-person-list">
                      {leaveReport.topStaff.map((row) => { const member = staffById.get(row.staffId); return member ? <button key={row.staffId} onClick={() => setSelectedStaffId(row.staffId)}><strong>{member.name}</strong><span>{row.days} gün{row.minutes ? ` · ${formatDurationMinutes(row.minutes)}` : ""} · {member.department}</span></button> : null; })}
                      {!leaveReport.topStaff.length && <div className="empty-state">Seçili dönemde izin veya rapor kaydı yok.</div>}
                    </div>
                  </div>
                </section>
                <section className="data-panel">
                  <div className="panel-heading"><div><h2>Gelecek 30 Gün İzin Yoğunluğu</h2><span>Aynı gün izinli veya raporlu olacak personeller</span></div></div>
                  <div className="table-scroll"><table className="data-table"><thead><tr><th>Tarih</th><th>Gün</th><th>Kişi Sayısı</th><th>Personeller</th></tr></thead><tbody>{futureLeaveDensityRows.slice(0, 15).map((row) => <tr key={row.date}><td><strong>{formatDateTr(row.date)}</strong></td><td>{new Date(`${row.date}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "long" })}</td><td>{row.staffIds.length}</td><td>{row.staffIds.map((staffId) => staffById.get(staffId)?.name).filter(Boolean).join(", ")}</td></tr>)}</tbody></table></div>
                  {!futureLeaveDensityRows.length && <div className="empty-state">Önümüzdeki 30 gün için planlanmış izin veya rapor yok.</div>}
                </section>
              </>
            )}

            {reportView === "departments" && (
              <>
                <section className="data-panel">
                  <div className="panel-heading"><div><h2>Departman Karşılaştırması</h2><span>Personel hareketi, devamlılık ve izin göstergeleri</span></div></div>
                  <div className="table-scroll"><table className="data-table department-comparison-table"><thead><tr><th>Departman</th><th>Hedef Kadro</th><th>Mevcut</th><th>Hedef Farkı</th><th>Dönem Başı</th><th>İşe Alınan</th><th>İşten Çıkan</th><th>Net</th><th>Devir %</th><th>Giriş Yapan</th><th>Gelinen Gün</th><th>Geç</th><th>Gelmedi</th><th>İzin/Rapor Günü</th></tr></thead><tbody>{departmentComparisonRows.map((row) => { const target = settings.departmentHeadcountTargets[row.department] ?? 0; const gap = target ? target - row.closing : 0; return <tr key={row.department}><td><strong>{row.department}</strong></td><td><input className="headcount-target-input" type="number" min="0" value={target || ""} placeholder="0" aria-label={`${row.department} hedef kadro`} onChange={(event) => updateSettings({ departmentHeadcountTargets: { ...settings.departmentHeadcountTargets, [row.department]: Math.max(0, Number(event.target.value) || 0) } })} /></td><td><strong>{row.closing}</strong></td><td className={gap > 0 ? "negative-cell" : gap < 0 ? "positive-cell" : ""}>{target ? (gap > 0 ? `${gap} açık` : gap < 0 ? `${Math.abs(gap)} fazla` : "Hedefte") : "-"}</td><td>{row.opening}</td><td className="positive-cell">{row.hires}</td><td className="negative-cell">{row.exits}</td><td className={row.net < 0 ? "negative-cell" : "positive-cell"}>{row.net > 0 ? "+" : ""}{row.net}</td><td>{row.turnoverRate}%</td><td>{row.uniqueCheckIns}</td><td>{row.attendedDays}</td><td>{row.lateDays}</td><td>{row.absentDays}</td><td>{row.leaveDays}</td></tr>; })}</tbody></table></div>
                  {!departmentComparisonRows.length && <div className="empty-state">Karşılaştırılacak departman bulunmuyor.</div>}
                </section>
              </>
            )}
          </main>
        )}

        {activeTab === "incapacity" && (
          <main className="workspace">
            <section className="metric-row" aria-label="İş göremezlik özeti">
              <Metric label="Rapor" value={incapacityStats.total} />
              <Metric label="Aktif" value={incapacityStats.active} tone="amber" />
              <Metric label="Toplam Gün" value={incapacityStats.days} tone="blue" />
              <Metric label="SGK Bekleyen" value={incapacityStats.sgkPending} tone="red" />
            </section>

            {incapacityReminders.length > 0 && (
              <section className="alert-row">
                <div className="alert-card warning-alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  SGK bildirimi yaklaşan/geciken raporlar: {incapacityReminders
                    .slice(0, 5)
                    .map(({ record }) => `${staffById.get(record.staffId)?.name ?? "Personel"} (${record.notificationDeadline})`)
                    .join(", ")}
                </div>
              </section>
            )}

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
                    Rapor Türü
                    <select value={incapacityForm.reportType} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, reportType: event.target.value as IncapacityReportType }))}>
                      {Object.entries(incapacityReportTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
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
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={incapacityForm.sgkNotified}
                      onChange={(event) => setIncapacityForm((previous) => ({
                        ...previous,
                        sgkNotified: event.target.checked,
                        sgkNotificationDate: event.target.checked ? previous.sgkNotificationDate || todayIso() : "",
                      }))}
                    />
                    <span>SGK bildirimi yapıldı</span>
                  </label>
                  {incapacityForm.sgkNotified && (
                    <label>
                      SGK Bildirim Tarihi
                      <input type="date" value={incapacityForm.sgkNotificationDate} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, sgkNotificationDate: event.target.value }))} />
                    </label>
                  )}
                  <label>
                    Bildirim Son Tarihi
                    <input type="date" value={incapacityForm.notificationDeadline} onChange={(event) => setIncapacityForm((previous) => ({ ...previous, notificationDeadline: event.target.value }))} />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={incapacityForm.reminderEnabled}
                      onChange={(event) => setIncapacityForm((previous) => ({ ...previous, reminderEnabled: event.target.checked }))}
                    />
                    <span>Son tarih hatırlatması</span>
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
                        <th>Tür</th>
                        <th>Tarih</th>
                        <th>Gün</th>
                        <th>Neden</th>
                        <th>Durum</th>
                        <th>SGK</th>
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
                          <td>{incapacityReportTypeLabels[record.reportType ?? "illness"]}</td>
                          <td>{record.startDate} - {record.endDate}</td>
                          <td>{record.dayCount}</td>
                          <td>{record.reason}</td>
                          <td><span className="status-toggle">{incapacityStatusLabels[record.status]}</span></td>
                          <td>
                            <span className={`status-pill ${record.sgkNotified ? "status-present" : "status-empty"}`}>
                              {record.sgkNotified ? "Bildirildi" : record.notificationDeadline || "Bekliyor"}
                            </span>
                          </td>
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

        {activeTab === "hourlyLeave" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Saatlik izin özeti">
              <Metric label="Kayıt" value={hourlyLeaveStats.records} />
              <Metric label="Toplam Saat" value={Math.round((hourlyLeaveStats.minutes / 60) * 100) / 100} tone="blue" />
              <Metric label="Toplam Gün" value={getHourlyLeaveDays(hourlyLeaveStats.minutes)} tone="amber" />
              <Metric label="Kullanılan" value={hourlyLeaveStats.used} tone="green" />
              <Metric label="Planlanan" value={hourlyLeaveStats.planned} />
            </section>

            <section className="workspace two-column">
              <section className="data-panel form-panel">
                <form className="staff-form" onSubmit={(event) => void handleSaveHourlyLeave(event)}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Saatlik İzin</h2>
                      <span>{hourlyLeaveForm.id ? "Kayıt düzenleniyor" : "Yeni kayıt"}</span>
                    </div>
                  </div>
                  <label>
                    Personel
                    <select value={hourlyLeaveForm.staffId} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, staffId: event.target.value }))}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tarih
                    <input
                      type="date"
                      value={hourlyLeaveForm.date}
                      onChange={(event) => {
                        setHourlyLeaveReportMonth(event.target.value.slice(0, 7));
                        setHourlyLeaveForm((previous) => ({ ...previous, date: event.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    Başlangıç Saati
                    <input type="time" value={hourlyLeaveForm.startTime} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, startTime: event.target.value }))} />
                  </label>
                  <label>
                    Bitiş Saati
                    <input type="time" value={hourlyLeaveForm.endTime} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, endTime: event.target.value }))} />
                  </label>
                  <label>
                    Süre
                    <input value={formatLeaveDuration(calculateHourlyLeaveMinutes(hourlyLeaveForm.startTime, hourlyLeaveForm.endTime))} readOnly />
                  </label>
                  <label>
                    Durum
                    <select value={hourlyLeaveForm.status} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, status: event.target.value as HourlyLeaveStatus }))}>
                      <option value="used">Kullanıldı</option>
                      <option value="planned">Planlandı</option>
                      <option value="cancelled">İptal</option>
                    </select>
                  </label>
                  <label>
                    İzin Sebebi
                    <input value={hourlyLeaveForm.reason} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, reason: event.target.value }))} placeholder="Örn. hastane, banka, ailevi neden" />
                  </label>
                  <label>
                    Not
                    <textarea value={hourlyLeaveForm.notes} onChange={(event) => setHourlyLeaveForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} />
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Kaydet
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => void handleDownloadHourlyLeaveFormPdf()}
                      disabled={busy}
                    >
                      <FileDown size={18} aria-hidden="true" />
                      Mazeret Formu PDF
                    </button>
                    {hourlyLeaveForm.id && (
                      <button className="secondary-action" type="button" onClick={resetHourlyLeaveForm}>
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
                    <h2>Saatlik İzin Kayıtları</h2>
                    <span>{formatMonthTr(hourlyLeaveReportMonth)} personel bazlı saatlik izin geçmişi</span>
                  </div>
                  <div className="button-row">
                    <label className="compact-month-filter">
                      Ay
                      <input type="month" value={hourlyLeaveReportMonth} onChange={(event) => setHourlyLeaveReportMonth(event.target.value || todayIso().slice(0, 7))} />
                    </label>
                    <label className="compact-month-filter">
                      Personel
                      <select value={hourlyLeaveReportStaffId} onChange={(event) => setHourlyLeaveReportStaffId(event.target.value)}>
                        <option value="all">Tüm personel</option>
                        {activeStaff.map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary-action" onClick={handleExportHourlyLeaveExcel} disabled={!hourlyLeaveRowsForMonth.length}>
                      <FileSpreadsheet size={18} aria-hidden="true" />
                      Excel
                    </button>
                    <button className="secondary-action" onClick={handlePrintHourlyLeaveReport} disabled={!hourlyLeaveRowsForMonth.length}>
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
                        <th>Kayıt</th>
                        <th>Tarihler</th>
                        <th>Saat Detayları</th>
                        <th>Toplam Süre</th>
                        <th>Gün</th>
                        <th>Durum Özeti</th>
                        <th>Sebep / Not</th>
                        <th aria-label="İşlem" />
                      </tr>
                    </thead>
                    <tbody>
                      {hourlyLeaveGroups.map((group) => {
                        return (
                          <tr key={group.id}>
                            <td>
                              <strong>{staffById.get(group.staffId)?.name ?? ""}</strong>
                              <span>{staffById.get(group.staffId)?.department ?? ""}</span>
                            </td>
                            <td>{group.records.length}</td>
                            <td>{group.dates.join(", ")}</td>
                            <td>{group.timeRanges.join(", ")}</td>
                            <td>{formatLeaveDuration(group.minutes)}</td>
                            <td>{formatLeaveDayValue(group.minutes)}</td>
                            <td><span className="status-toggle">{group.statusSummary}</span></td>
                            <td>{[group.reasons.join(" / "), group.notes.join(" / ")].filter(Boolean).join(" - ") || "-"}</td>
                            <td>
                              <div className="row-actions">
                                {group.records.map((record) => (
                                  <span className="record-action-pair" key={record.id}>
                                    <small>{record.date} {record.startTime}</small>
                                    <button
                                      className="icon-button"
                                      onClick={() => void handleDownloadHourlyLeaveFormPdf(record)}
                                      title={`${record.date} mazeret izin formu`}
                                      aria-label={`${record.date} mazeret izin formunu PDF indir`}
                                    >
                                      <FileDown size={17} />
                                    </button>
                                    <button className="icon-button" onClick={() => handleEditHourlyLeave(record)} title={`${record.date} düzenle`} aria-label={`${record.date} saatlik izin kaydını düzenle`}>
                                      <Edit3 size={17} />
                                    </button>
                                    <button className="icon-button danger" onClick={() => void handleDeleteHourlyLeave(record)} title={`${record.date} sil`} aria-label={`${record.date} saatlik izin kaydını sil`}>
                                      <Trash2 size={17} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!hourlyLeaveRowsForMonth.length && <div className="empty-state">Seçili ayda saatlik izin kaydı bulunmuyor.</div>}
              </section>
            </section>
          </main>
        )}

        {activeTab === "annualLeave" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Yıllık izin özeti">
              <Metric label="Kayıt" value={annualLeaveStats.records} />
              <Metric label="Kullanıldı" value={annualLeaveStats.used} tone="amber" />
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
                    <select value={annualLeaveForm.staffId} onChange={(event) => handleAnnualLeaveStaffChange(event.target.value)}>
                      {activeStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Yıl
                    <input type="number" value={annualLeaveForm.year} onChange={(event) => handleAnnualLeaveYearChange(Number(event.target.value))} />
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
                    <input type="date" value={annualLeaveForm.startDate} onChange={(event) => handleAnnualLeaveStartDateChange(event.target.value)} />
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
                        <th>Kullanıldı</th>
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
                      <th>Kullanıldı</th>
                      <th>Planlanan</th>
                      <th>Durum</th>
                      <th>Not</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {annualLeaveRowsForMonth.map((record) => {
                      const annualBreakdown = getAnnualLeaveUsageBreakdown(record);
                      return (
                        <tr key={record.id}>
                          <td>
                            <strong>{staffById.get(record.staffId)?.name ?? ""}</strong>
                            <span>{staffById.get(record.staffId)?.department ?? ""}</span>
                          </td>
                          <td>{record.year}</td>
                          <td>{annualLeaveTypeLabels[record.leaveType]}</td>
                          <td>{record.startDate} - {record.endDate}</td>
                          <td>{record.usedDays}</td>
                          <td>{annualBreakdown.used}</td>
                          <td>{annualBreakdown.planned}</td>
                          <td><span className="status-toggle">{getAnnualLeaveDisplayStatus(record)}</span></td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!annualLeaveRowsForMonth.length && <div className="empty-state">Seçili ayda yıllık izin kaydı bulunmuyor.</div>}
            </section>
          </main>
        )}

        {activeTab === "unpaidLeave" && (
          <main className="workspace">
            <section className="metric-row" aria-label="Ücretsiz izin özeti">
              <Metric label="Kayıt" value={unpaidLeaveStats.records} />
              <Metric label="Planlanan" value={unpaidLeaveStats.planned} tone="blue" />
              <Metric label="Bitti" value={unpaidLeaveStats.completed} tone="green" />
              <Metric label="İptal" value={unpaidLeaveStats.cancelled} tone="amber" />
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
                      {unpaidLeaveForm.staffId && !staffById.get(unpaidLeaveForm.staffId)?.active && (
                        <option value={unpaidLeaveForm.staffId}>
                          {staffById.get(unpaidLeaveForm.staffId)?.name} — {getStaffDepartureLabel(staffById.get(unpaidLeaveForm.staffId))}
                        </option>
                      )}
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
                    Toplam Gün
                    <input value={countLeaveDays(unpaidLeaveForm.startDate, unpaidLeaveForm.endDate)} readOnly />
                  </label>
                  <label>
                    Durum
                    <input
                      value={unpaidLeaveForm.status === "cancelled"
                        ? "İptal"
                        : leaveStatusLabels[getUnpaidLeaveAutomaticStatus(unpaidLeaveForm.endDate, todayIso())]}
                      readOnly
                    />
                    <small>Bitiş tarihi dünde kaldığında otomatik olarak Bitti olur.</small>
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
                    <h2>{unpaidLeaveYear} Aktif Personel Özeti</h2>
                    <span>İşten ayrılmış personeller aşağıdaki ayrı kartta gösterilir</span>
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
                        <th>Planlanan</th>
                        <th>Bitti</th>
                        <th>İptal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidLeaveSummaries.map((row) => (
                        <tr key={row.staff.id}>
                          <td>
                            <strong>{row.staff.name}</strong>
                            <span>{row.staff.department}</span>
                          </td>
                          <td>{row.planned}</td>
                          <td>{row.completed}</td>
                          <td>{row.cancelled}</td>
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
                      {staff
                        .filter((member) =>
                          !member.active &&
                          departedUnpaidLeaveGroupsForMonth.some((group) => group.staffId === member.id),
                        )
                        .map((member) => (
                          <option key={member.id} value={member.id}>{member.name} — {getStaffDepartureLabel(member)}</option>
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
              <UnpaidLeaveGroupsTable
                groups={activeUnpaidLeaveGroupsForMonth}
                staffById={staffById}
                emptyText="Seçili ayda aktif personel için ücretsiz izin kaydı bulunmuyor."
                onEdit={handleEditUnpaidLeave}
                onDelete={(record) => void handleDeleteUnpaidLeave(record)}
              />
            </section>

            {departedUnpaidLeaveGroupsForMonth.length > 0 && (
              <section className="data-panel departed-unpaid-card">
                <div className="panel-heading">
                  <div>
                    <p className="departed-card-eyebrow">
                      <ArchiveRestore size={16} aria-hidden="true" />
                      Arşiv kayıtları
                    </p>
                    <h2>{formatMonthTr(unpaidLeaveReportMonth)} İşten Ayrılmış Personel Ücretsiz İzinleri</h2>
                    <span>Yalnızca seçili ayın kayıtları gösterilir; kayıtlar düzenlenebilir ve raporlarda ayrı bölümde yer alır</span>
                  </div>
                  <div className="departed-card-stats" aria-label="İşten ayrılmış personel ücretsiz izin özeti">
                    <span><strong>{departedUnpaidLeaveReportStats.records}</strong> kayıt</span>
                    <span><strong>{departedUnpaidLeaveReportStats.completed + departedUnpaidLeaveReportStats.planned}</strong> gün</span>
                  </div>
                </div>
                <UnpaidLeaveGroupsTable
                  groups={departedUnpaidLeaveGroupsForMonth}
                  staffById={staffById}
                  emptyText="İşten ayrılmış personel için ücretsiz izin kaydı bulunmuyor."
                  onEdit={handleEditUnpaidLeave}
                  onDelete={(record) => void handleDeleteUnpaidLeave(record)}
                />
              </section>
            )}
          </main>
        )}

        {activeTab === "profiles" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label className="wide-filter">
                Personel
                <select value={profileStaff?.id ?? ""} onChange={(event) => setProfileStaffId(event.target.value)}>
                  {staff.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      {index + 1}. {member.name}{member.active ? "" : " — İşten ayrıldı"}
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
                    <button className="secondary-action" type="button" onClick={() => handleStartEditProfileStaff(profileStaff)}>
                      <Edit3 size={18} aria-hidden="true" />
                      Düzenle
                    </button>
                    <p>{[profileStaff.department, profileStaff.title].filter(Boolean).join(" / ") || "Departman ve ünvan bilgisi yok"}</p>
                  </div>
                  <div className="profile-dates">
                    <span>Doğum tarihi: <strong>{profileStaff.birthDate ? formatDateTr(profileStaff.birthDate) : "-"}</strong></span>
                    <span>İşe giriş: <strong>{profileStaff.startDate || "-"}</strong></span>
                    <span>İşten çıkış: <strong>{profileStaff.endDate || "-"}</strong></span>
                    <span>T.C.: <strong>{profileStaff.nationalId || "-"}</strong></span>
                    <span>Telefon: <strong>{profileStaff.phone || "-"}</strong></span>
                    <span>SGK kodu: <strong>{profileStaff.socialSecurityCode || "-"}</strong></span>
                    <span>Vardiya: <strong>{profileStaff.shiftType || "-"}</strong></span>
                    <span>Durum: <strong>{profileStaff.active ? "Aktif" : "Pasif"}</strong></span>
                  </div>
                </section>

                <section className="metric-row" aria-label="Personel izin özeti">
                  <Metric label="Yıllık İzin Kullanıldı" value={profileLeaveStats.annualUsedTotal} tone="amber" />
                  <Metric label={`${profileLeaveStats.annualBalanceYear} Yıllık Hak`} value={profileLeaveStats.annualEntitlement} />
                  <Metric label={`${profileLeaveStats.annualBalanceYear} Planlanan`} value={profileLeaveStats.annualPlannedCurrentYear} tone="blue" />
                  <Metric label="Devir Dahil Kalan İzin" value={profileLeaveStats.annualRemaining} tone="green" />
                  <Metric label="Ücretsiz İzin Günü" value={profileLeaveStats.unpaidUsedTotal} tone="amber" />
                  <Metric label="Raporlu Gün" value={profileLeaveStats.incapacityDays} tone="blue" />
                  <Metric label="Saatlik İzin Günü" value={getHourlyLeaveDays(profileLeaveStats.hourlyLeaveMinutes)} />
                  <Metric label="Resmi Tatil Saati" value={profileLeaveStats.holidayWorkHours} />
                </section>

                <section className="data-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Yıllık İzin Hakları ve Devirler</h2>
                      <span>
                        Her yılın hakkı ve kullanılmayan günlerin sonraki yıla aktarımı ayrı gösterilir.{" "}
                        <a
                          href="https://www.csgb.gov.tr/Media/trddpibj/y%C4%B1ll%C4%B1k-%C3%BCcretli-izin-y%C3%B6netmeli%C4%9Fi.pdf"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Mevzuat: Yıllık Ücretli İzin Yönetmeliği Madde 9
                        </a>
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => profileAnnualLeaveExportTable && downloadProfileSectionExcel(profileAnnualLeaveExportTable)}
                        disabled={!profileAnnualLeaveBalances.length}
                      >
                        <FileSpreadsheet size={18} aria-hidden="true" />
                        Excel
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => profileAnnualLeaveExportTable && void downloadProfileSectionPdf(profileAnnualLeaveExportTable)}
                        disabled={!profileAnnualLeaveBalances.length}
                      >
                        <FileDown size={18} aria-hidden="true" />
                        PDF
                      </button>
                    </div>
                  </div>
                  <div className="entitlement-note">
                    <TriangleAlert size={18} aria-hidden="true" />
                    <span>
                      <strong>İşe giriş yılında yıllık izin hakkı oluşmaz.</strong>{" "}
                      İlk hak, bir yıllık çalışma tamamlandığında kazanılır.
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Yıl</th>
                          <th>Hak Ediş Tarihi</th>
                          <th>Yıllık Hak</th>
                          <th>Hak Edecek</th>
                          <th>Önceki Yıldan Devir</th>
                          <th>Kullanılan</th>
                          <th>Planlanan</th>
                          <th>Kalan / Sonraki Yıla Devir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileAnnualLeaveBalanceRows.map((balance) => (
                          <tr key={balance.year}>
                            <td><strong>{balance.year}</strong></td>
                            <td>{balance.entitlementDate ?? "-"}</td>
                            <td>{balance.entitlement} gün</td>
                            <td>
                              {balance.isEntryYear
                                ? <strong>İşe giriş yılı - hak yok</strong>
                                : balance.pendingEntitlement > 0
                                ? <strong>{balance.pendingEntitlement} gün</strong>
                                : "-"}
                            </td>
                            <td>{balance.carryIn} gün</td>
                            <td>{balance.used} gün</td>
                            <td>{balance.planned} gün</td>
                            <td><strong>{balance.carryOut} gün</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="metric-row" aria-label="Seçili tarih devam özeti">
                  <Metric label="Kayıt" value={profileStats.total} />
                  <Metric label="Geldi" value={profileStats.present} tone="green" />
                  <Metric label="Geç" value={profileStats.late} tone="amber" />
                  <Metric label="Gelmedi" value={profileStats.absent} tone="red" />
                  <Metric label="İzinli" value={profileStats.excused} tone="blue" />
                  <Metric label="Gecikme Dk" value={profileStats.lateMinutes} tone="amber" />
                </section>

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Yıllık İzin Geçmişi"
                  subtitle={`Toplam kullanılan ${profileLeaveStats.annualUsedTotal} gün • devir dahil kalan ${profileLeaveStats.annualRemaining} gün`}
                  events={profileHistorySections.annual}
                  emptyText="Bu personel için yıllık izin kaydı bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Ücretsiz İzin Geçmişi"
                  subtitle={`Bugüne kadar toplam ${profileLeaveStats.unpaidUsedTotal} gün`}
                  events={profileHistorySections.unpaid}
                  emptyText="Bu personel için ücretsiz izin kaydı bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="İş Göremezlik Raporları"
                  subtitle={`Toplam ${profileLeaveStats.incapacityDays} raporlu gün`}
                  events={profileHistorySections.incapacity}
                  emptyText="Bu personel için iş göremezlik raporu bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Saatlik İzin Geçmişi"
                  subtitle={`Toplam ${formatLeaveDuration(profileLeaveStats.hourlyLeaveMinutes)} • ${getHourlyLeaveDays(profileLeaveStats.hourlyLeaveMinutes)} gün karşılığı`}
                  events={profileHistorySections.hourly}
                  emptyText="Bu personel için saatlik izin kaydı bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Resmi Tatil Çalışmaları"
                  subtitle={`Toplam ${profileLeaveStats.holidayWorkHours} saat`}
                  events={profileHistorySections.holiday}
                  emptyText="Bu personel için resmi tatil çalışma kaydı bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Silinen Kayıtlar"
                  subtitle="İzin, rapor, resmi tatil ve devam kayıtlarındaki silme veya geri yükleme işlemleri"
                  events={profileHistorySections.deleted}
                  emptyText="Bu personel için silinen veya geri yüklenen kayıt bulunmuyor."
                />

                <ProfileHistoryPanel
                  staff={profileStaff}
                  title="Diğer Personel İşlemleri"
                  subtitle="Yalnızca personel kartı ve personel verisi değişiklikleri"
                  events={profileHistorySections.other}
                  emptyText="Bu personelin kart bilgilerinde henüz değişiklik yapılmamış."
                />

                <section className="data-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Devam Geçmişi</h2>
                      <span>{reportStart} - {reportEnd}</span>
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => profileAttendanceExportTable && downloadProfileSectionExcel(profileAttendanceExportTable)}
                        disabled={!profileRows.length}
                      >
                        <FileSpreadsheet size={18} aria-hidden="true" />
                        Excel
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => profileAttendanceExportTable && void downloadProfileSectionPdf(profileAttendanceExportTable)}
                        disabled={!profileRows.length}
                      >
                        <FileDown size={18} aria-hidden="true" />
                        PDF
                      </button>
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
                  {!profileRows.length && <div className="empty-state">Bu tarih aralığında devam kaydı yok. Getir veya Bu Ay butonunu kullanın.</div>}
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
                  Doğum Tarihi
                  <input
                    type="date"
                    value={newStaff.birthDate}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, birthDate: event.target.value }))}
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
                <label>
                  İşten Çıkış Türü
                  <select
                    value={newStaff.departureType}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, departureType: event.target.value }))}
                  >
                    <option value="">Belirtilmedi</option>
                    {Object.entries(departureTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  İşten Çıkış Nedeni
                  <input
                    value={newStaff.departureReason}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, departureReason: event.target.value }))}
                    placeholder="Kısa açıklama"
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

              <div className="import-box">
                <label>
                  Toplu Personel
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    rows={9}
                    placeholder="Ad Soyad;Departman;Unvan;Ise Giris;Isten Cikis;Imza Foyunde Goster;Sabit Personel;TC Kimlik;Telefon;SGK Gorev Kodu;Vardiya;Dogum Tarihi"
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
              {renderStaffTable(activeRegularStaffList, "Aktif Personel", "Bu filtrede aktif personel bulunamadı.")}
              {renderStaffTable(activeFixedStaffList, "Sabit Personel", "Bu filtrede aktif sabit personel bulunamadı.")}
              {renderStaffTable(inactiveStaffList, "Pasif Personel", "Bu filtrede pasif personel bulunamadı.")}
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
                <label className="secondary-action file-action">
                  <ArchiveRestore size={18} aria-hidden="true" />
                  Yedekten Geri Yükle
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    disabled={busy}
                    onChange={(event) => {
                      void handleRestoreBackupFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
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
                    {auditLogs.slice(0, 80).map((log) => (
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
          {activeTab === "profiles" && profileStaff && (
            <button
              className="profile-quick-edit"
              type="button"
              onClick={() => handleStartEditProfileStaff(profileStaff)}
              aria-label={`${profileStaff.name} bilgilerini düzenle`}
            >
              <Edit3 size={19} aria-hidden="true" />
              <span>Personeli Düzenle</span>
            </button>
          )}
        </div>
      </div>

      {editingStaff && (
        <StaffEditDialog
          staff={editingStaff}
          busy={busy}
          onChange={setEditingStaff}
          onSubmit={handleUpdateStaff}
          onClose={() => setEditingStaff(null)}
        />
      )}

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
          <GroupedLeavePrintReport
            groups={activeUnpaidLeaveGroupsForMonth}
            departedGroups={departedUnpaidLeaveGroupsForMonth}
            staffById={staffById}
            stats={unpaidLeaveReportStats}
            departedStats={departedUnpaidLeaveReportStats}
            reportMonth={unpaidLeaveReportMonth}
            title="Ücretsiz İzin Raporu"
          />
        ) : printMode === "hourlyLeave" ? (
          <HourlyLeavePrintReport
            groups={hourlyLeaveGroups}
            staffById={staffById}
            stats={hourlyLeaveStats}
            reportMonth={hourlyLeaveReportMonth}
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
              explanations={signatureExplanations}
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

function StaffEditDialog({
  staff,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  staff: StaffMember;
  busy: boolean;
  onChange: (staff: StaffMember) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<StaffMember>) => onChange({ ...staff, ...patch });

  return (
    <div
      className="staff-edit-backdrop screen-only"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="staff-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-edit-title">
        <header className="staff-edit-header">
          <div className="staff-edit-identity">
            <div className="staff-edit-avatar" aria-hidden="true">
              {staff.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
              <span><Plane size={18} /></span>
            </div>
            <div>
              <p>Personel kartı</p>
              <h2 id="staff-edit-title">{staff.name || "Personel Bilgilerini Düzenle"}</h2>
              <span>{[staff.department, staff.title].filter(Boolean).join(" • ") || "Temel bilgileri hızlıca güncelleyin"}</span>
            </div>
          </div>
          <button className="staff-edit-close" type="button" onClick={onClose} disabled={busy} aria-label="Düzenleme ekranını kapat">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form className="staff-edit-form" onSubmit={onSubmit}>
          <div className="staff-edit-section">
            <div className="staff-edit-section-title">
              <UserRound size={17} aria-hidden="true" />
              <div>
                <h3>Kişisel ve görev bilgileri</h3>
                <p>Personel kartında ve raporlarda görünen temel alanlar</p>
              </div>
            </div>
            <div className="staff-edit-grid">
              <label className="staff-edit-wide">
                Ad Soyad
                <input value={staff.name} onChange={(event) => update({ name: event.target.value })} required autoFocus />
              </label>
              <label>
                Departman
                <input value={staff.department} onChange={(event) => update({ department: event.target.value })} />
              </label>
              <label>
                Ünvan
                <input value={staff.title} onChange={(event) => update({ title: event.target.value })} />
              </label>
              <label>
                Doğum Tarihi
                <input
                  type="date"
                  value={staff.birthDate ?? ""}
                  onChange={(event) => update({ birthDate: event.target.value })}
                />
              </label>
              <label>
                Telefon
                <input value={staff.phone ?? ""} onChange={(event) => update({ phone: event.target.value })} inputMode="tel" />
              </label>
              <label>
                T.C. Kimlik No
                <input value={staff.nationalId ?? ""} onChange={(event) => update({ nationalId: event.target.value })} inputMode="numeric" />
              </label>
              <label>
                SGK Görev Kodu
                <input value={staff.socialSecurityCode ?? ""} onChange={(event) => update({ socialSecurityCode: event.target.value })} />
              </label>
              <label>
                Çalışma Takvimi / Vardiya
                <input
                  value={staff.shiftType ?? ""}
                  onChange={(event) => update({ shiftType: event.target.value })}
                  placeholder="Örn. 09:00 - 18:00"
                />
              </label>
            </div>
          </div>

          <div className="staff-edit-section">
            <div className="staff-edit-section-title">
              <CalendarDays size={17} aria-hidden="true" />
              <div>
                <h3>Çalışma durumu</h3>
                <p>İşe giriş, ayrılış ve imza föyü tercihleri</p>
              </div>
            </div>
            <div className="staff-edit-grid staff-edit-employment">
              <label>
                İşe Giriş
                <input type="date" value={staff.startDate ?? ""} onChange={(event) => update({ startDate: event.target.value })} />
              </label>
              <label>
                İşten Çıkış
                <input type="date" value={staff.endDate ?? ""} onChange={(event) => update({ endDate: event.target.value })} />
              </label>
              <label>
                İşten Çıkış Türü
                <select value={staff.departureType ?? ""} onChange={(event) => update({ departureType: event.target.value })}>
                  <option value="">Belirtilmedi</option>
                  {Object.entries(departureTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="staff-edit-wide">
                İşten Çıkış Nedeni
                <input value={staff.departureReason ?? ""} onChange={(event) => update({ departureReason: event.target.value })} placeholder="Kısa açıklama" />
              </label>
              <div className="staff-edit-switches">
                <label className="staff-edit-switch">
                  <input type="checkbox" checked={staff.active} onChange={(event) => update({ active: event.target.checked })} />
                  <span>
                    <strong>Aktif personel</strong>
                    <small>Günlük kayıt ve listelerde göster</small>
                  </span>
                </label>
                <label className="staff-edit-switch">
                  <input
                    type="checkbox"
                    checked={staff.showOnSignatureSheet !== false}
                    onChange={(event) => update({ showOnSignatureSheet: event.target.checked })}
                  />
                  <span>
                    <strong>İmza föyünde göster</strong>
                    <small>Yazdırılan günlük imza listesine dahil et</small>
                  </span>
                </label>
                <label className="staff-edit-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(staff.fixedStaff)}
                    onChange={(event) => update({ fixedStaff: event.target.checked })}
                  />
                  <span>
                    <strong>Sabit personel</strong>
                    <small>Resmi tatil toplu işlemlerine dahil et</small>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <footer className="staff-edit-actions">
            <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>
              Vazgeç
            </button>
            <button className="primary-action" type="submit" disabled={busy || !staff.name.trim()}>
              <Save size={18} aria-hidden="true" />
              {busy ? "Kaydediliyor" : "Değişiklikleri Kaydet"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

const homeChartColors = ["#5471cf", "#91cd76", "#ffca58", "#ef6267", "#65bed2", "#32a57d", "#ff814a", "#9a54bd"];

function HomeDashboard({
  settings,
  adminEmail,
  activeStaff,
  annualLeaveRecords,
  auditLogs,
  dailyStats,
  onNavigate,
  onOpenProfile,
}: {
  settings: AppSettings;
  adminEmail: string | null;
  activeStaff: StaffMember[];
  annualLeaveRecords: AnnualLeaveRecord[];
  auditLogs: AuditLogRecord[];
  dailyStats: { processed: number; present: number; late: number; absent: number; excused: number };
  onNavigate: (tab: TabKey) => void;
  onOpenProfile: (staffId: string) => void;
}) {
  const today = todayIso();
  const [showAnnualLeaveEligibleList, setShowAnnualLeaveEligibleList] = useState(false);
  const [showUpcomingBirthdaysList, setShowUpcomingBirthdaysList] = useState(false);
  const [annualLeaveEligibleSearch, setAnnualLeaveEligibleSearch] = useState("");
  const upcomingBirthdays = getUpcomingBirthdays(activeStaff, today, activeStaff.length)
    .filter(({ daysUntil }) => daysUntil <= 60);
  const annualLeaveEligibleStaff = getAnnualLeaveEligibleStaff(activeStaff, today);
  const normalizedAnnualLeaveEligibleSearch = annualLeaveEligibleSearch.trim().toLocaleLowerCase("tr-TR");
  const filteredAnnualLeaveEligibleStaff = annualLeaveEligibleStaff.filter(({ staff: member }) => {
    if (!normalizedAnnualLeaveEligibleSearch) return true;
    return [member.name, member.department, member.title]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedAnnualLeaveEligibleSearch));
  });
  const upcomingLeaves = annualLeaveRecords
    .filter((record) => record.status !== "cancelled" && record.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);
  const plannedLeaveDays = annualLeaveRecords
    .filter((record) => record.status === "planned" && record.endDate >= today)
    .reduce((total, record) => total + record.usedDays, 0);
  const usedLeaveDays = annualLeaveRecords
    .filter((record) => record.status === "used" || record.status === "completed")
    .reduce((total, record) => total + record.usedDays, 0);
  const leaveTotal = Math.max(1, plannedLeaveDays + usedLeaveDays);
  const plannedPercent = Math.min(100, Math.round((plannedLeaveDays / leaveTotal) * 100));
  const departmentCounts = Array.from(
    activeStaff.reduce((counts, member) => {
      const name = member.department.trim() || "Departman Yok";
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, homeChartColors.length);
  let chartCursor = 0;
  const chartSegments = departmentCounts.map(([name, count], index) => {
    const start = chartCursor;
    chartCursor += activeStaff.length ? (count / activeStaff.length) * 100 : 0;
    return {
      name,
      count,
      color: homeChartColors[index],
      segment: `${homeChartColors[index]} ${start}% ${chartCursor}%`,
    };
  });
  const chartBackground = chartSegments.length
    ? `conic-gradient(${chartSegments.map((item) => item.segment).join(", ")})`
    : "conic-gradient(#e8edf5 0 100%)";
  const recentStaff = [...activeStaff]
    .filter((member) => member.startDate)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
    .slice(0, 3);
  const currentYear = Number(today.slice(0, 4));
  const upcomingHolidays = [
    ...getTurkiyePublicHolidays(currentYear),
    ...getTurkiyePublicHolidays(currentYear + 1),
  ]
    .filter((holiday) => holiday.date >= today)
    .slice(0, 3);
  const userLabel = adminEmail?.split("@")[0] || "Yönetici";
  const activeDepartmentCount = new Set(activeStaff.map((member) => member.department.trim()).filter(Boolean)).size;

  if (showUpcomingBirthdaysList) {
    return (
      <main className="workspace home-workspace">
        <section
          className="home-entitlement-view home-birthday-view"
          aria-labelledby="upcoming-birthdays-title"
        >
          <header className="home-entitlement-view-head">
            <button
              className="home-entitlement-back"
              type="button"
              onClick={() => setShowUpcomingBirthdaysList(false)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Ana sayfaya dön
            </button>
            <div>
              <span className="home-entitlement-view-icon" aria-hidden="true">
                <Cake size={22} />
              </span>
              <div>
                <p>Doğum günü takvimi</p>
                <h2 id="upcoming-birthdays-title">Gelecek 2 Ayın Doğum Günleri</h2>
                <span>Önümüzdeki 60 gün içinde doğum günü olan aktif personeller</span>
              </div>
            </div>
          </header>

          <div className="home-entitlement-toolbar home-birthday-toolbar">
            <div>
              <strong>{upcomingBirthdays.length}</strong>
              <span>Yaklaşan doğum günü</span>
            </div>
          </div>

          <div className="home-entitlement-table-wrap">
            <div className="home-entitlement-table-head" aria-hidden="true">
              <span>Personel</span>
              <span>Departman / Unvan</span>
              <span>Kalan süre</span>
              <span>Doğum günü</span>
              <span />
            </div>
            <div className="home-entitlement-table">
              {upcomingBirthdays.map(({ staff: member, nextBirthday, daysUntil }) => (
                <article key={member.id}>
                  <div className="home-entitlement-person">
                    <span className="home-person-avatar is-birthday">
                      {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                    </span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.phone || "Telefon bilgisi yok"}</small>
                    </div>
                  </div>
                  <div className="home-entitlement-role">
                    <strong>{member.department || "Departman belirtilmemiş"}</strong>
                    <small>{member.title || "Unvan belirtilmemiş"}</small>
                  </div>
                  <strong className="home-birthday-timing">{getBirthdayTimingLabel(daysUntil)}</strong>
                  <time dateTime={nextBirthday}>{formatDateTr(nextBirthday)}</time>
                  <button type="button" onClick={() => onOpenProfile(member.id)}>
                    Profili aç <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!upcomingBirthdays.length && (
                <div className="home-entitlement-empty">
                  <Cake size={28} aria-hidden="true" />
                  <strong>Önümüzdeki 60 gün içinde doğum günü bulunan personel yok.</strong>
                  <span>Yeni yaklaşan doğum günleri bu listede otomatik olarak gösterilecek.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (showAnnualLeaveEligibleList) {
    return (
      <main className="workspace home-workspace">
        <section className="home-entitlement-view" aria-labelledby="annual-leave-entitlement-title">
          <header className="home-entitlement-view-head">
            <button
              className="home-entitlement-back"
              type="button"
              onClick={() => {
                setShowAnnualLeaveEligibleList(false);
                setAnnualLeaveEligibleSearch("");
              }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Ana sayfaya dön
            </button>
            <div>
              <span className="home-entitlement-view-icon" aria-hidden="true">
                <CheckCircle2 size={22} />
              </span>
              <div>
                <p>Yıllık izin takibi</p>
                <h2 id="annual-leave-entitlement-title">Yıllık İzni Hak Edenler</h2>
                <span>Giriş tarihine göre bu yıl yıllık izin hakkı kazanan aktif personeller</span>
              </div>
            </div>
          </header>

          <div className="home-entitlement-toolbar">
            <div>
              <strong>{annualLeaveEligibleStaff.length}</strong>
              <span>Hak kazanan personel</span>
            </div>
            <label>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={annualLeaveEligibleSearch}
                onChange={(event) => setAnnualLeaveEligibleSearch(event.target.value)}
                placeholder="İsim, departman veya unvan ara"
                aria-label="Yıllık izin hakkı kazanan personellerde ara"
              />
            </label>
          </div>

          <div className="home-entitlement-table-wrap">
            <div className="home-entitlement-table-head" aria-hidden="true">
              <span>Personel</span>
              <span>Departman / Unvan</span>
              <span>Hak ediş tarihi</span>
              <span>İzin hakkı</span>
              <span />
            </div>
            <div className="home-entitlement-table">
              {filteredAnnualLeaveEligibleStaff.map(({ staff: member, entitlementDate, entitlementDays }) => (
                <article key={member.id}>
                  <div className="home-entitlement-person">
                    <span className="home-person-avatar is-entitled">
                      {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                    </span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.phone || "Telefon bilgisi yok"}</small>
                    </div>
                  </div>
                  <div className="home-entitlement-role">
                    <strong>{member.department || "Departman belirtilmemiş"}</strong>
                    <small>{member.title || "Unvan belirtilmemiş"}</small>
                  </div>
                  <time dateTime={entitlementDate}>{formatDateTr(entitlementDate)}</time>
                  <strong className="home-entitlement-days">{entitlementDays} gün</strong>
                  <button type="button" onClick={() => onOpenProfile(member.id)}>
                    Profili aç <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!filteredAnnualLeaveEligibleStaff.length && (
                <div className="home-entitlement-empty">
                  <CheckCircle2 size={28} aria-hidden="true" />
                  <strong>
                    {annualLeaveEligibleStaff.length
                      ? "Aramanızla eşleşen personel bulunamadı."
                      : "Bu yıl henüz yıllık izin hakkı kazanan personel yok."}
                  </strong>
                  <span>
                    {annualLeaveEligibleStaff.length
                      ? "Farklı bir isim, departman veya unvan arayabilirsiniz."
                      : "Personeller hak ediş tarihine ulaştığında burada otomatik olarak listelenecek."}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace home-workspace">
      <section className="home-grid" aria-label="Ana sayfa özeti">
        <div className="home-column">
          <article className="home-card home-profile-card">
            <div className="home-profile-head">
              <div>
                <p>Hoş geldiniz</p>
                <h2>{userLabel}</h2>
                <span>{settings.companyName}</span>
              </div>
              <div className="home-avatar" aria-hidden="true">
                <img src={BRAND_LOGO_SRC} alt="" />
              </div>
            </div>
            <dl className="home-profile-details">
              <div>
                <dt>Aktif Personel</dt>
                <dd>{activeStaff.length}</dd>
              </div>
              <div>
                <dt>Departman</dt>
                <dd>{activeDepartmentCount}</dd>
              </div>
            </dl>
            <button className="home-link" type="button" onClick={() => onNavigate("profiles")}>
              Profilleri görüntüle <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className="home-card home-distribution-card">
            <HomeCardHeader icon={PieChart} title="Çalışan Dağılımı" />
            <div className="home-donut-wrap">
              <div className="home-donut" style={{ background: chartBackground }}>
                <div>
                  <span>Toplam</span>
                  <strong>{activeStaff.length}</strong>
                </div>
              </div>
            </div>
            <div className="home-chart-legend">
              {chartSegments.slice(0, 4).map((item) => (
                <span key={item.name}>
                  <i style={{ background: item.color }} />
                  {item.name} <strong>{item.count}</strong>
                </span>
              ))}
              {!chartSegments.length && <p>Personel verisi eklendiğinde dağılım burada görünür.</p>}
            </div>
            <div className="home-card-foot">
              <Users size={16} aria-hidden="true" />
              {activeStaff.length} aktif çalışan
            </div>
          </article>
        </div>

        <div className="home-column">
          <article className="home-card home-leave-card">
            <HomeCardHeader icon={Plane} title="İzin Bilgileri" actionLabel="İzinleri yenile" />
            <div className="home-leave-summary">
              <p>{formatDateTr(today)} tarihi itibarıyla</p>
              <strong>{plannedLeaveDays} gün</strong>
              <div className="home-progress" aria-label={`Planlanan izin oranı yüzde ${plannedPercent}`}>
                <span style={{ width: `${plannedPercent}%` }} />
              </div>
              <div className="home-progress-key">
                <span><i className="is-planned" /> Planlanan {plannedLeaveDays}</span>
                <span><i className="is-used" /> Kullanılan {usedLeaveDays}</span>
              </div>
            </div>
            <div className="home-list">
              {annualLeaveRecords
                .filter((record) => record.status !== "cancelled")
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .slice(0, 4)
                .map((record) => (
                  <div className="home-list-row" key={record.id}>
                    <span className={`home-status-dot is-${record.status}`} />
                    <strong>{annualLeaveTypeLabels[record.leaveType]}</strong>
                    <small>{record.usedDays}g</small>
                    <time>{formatShortDate(record.startDate)}</time>
                  </div>
                ))}
              {!annualLeaveRecords.length && <div className="home-empty">Henüz izin kaydı bulunmuyor.</div>}
            </div>
            <button className="home-link home-card-link" type="button" onClick={() => onNavigate("annualLeave")}>
              Tümünü gör <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className="home-card">
            <HomeCardHeader icon={Users} title="Son Personel Katılımları" />
            <div className="home-people-list">
              {recentStaff.map((member) => (
                <button key={member.id} type="button" onClick={() => onNavigate("profiles")}>
                  <span className="home-person-avatar">{member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.department || member.title || "Personel"}</small>
                  </span>
                  <time>{member.startDate ? formatShortDate(member.startDate) : "-"}</time>
                </button>
              ))}
              {!recentStaff.length && <div className="home-empty">İşe giriş tarihi bulunan personel yok.</div>}
            </div>
          </article>

          <article className="home-card home-birthday-card">
            <HomeCardHeader icon={Cake} title="Yaklaşan Doğum Günleri" />
            <div className="home-people-list">
              {upcomingBirthdays.slice(0, 3).map(({ staff: member, nextBirthday, daysUntil }) => (
                <button key={member.id} type="button" onClick={() => onOpenProfile(member.id)}>
                  <span className="home-person-avatar is-birthday">
                    {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                  </span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{getBirthdayTimingLabel(daysUntil)}</small>
                  </span>
                  <time dateTime={nextBirthday}>{formatShortDate(nextBirthday)}</time>
                </button>
              ))}
              {!upcomingBirthdays.length && (
                <div className="home-empty">
                  Önümüzdeki 60 gün içinde doğum günü bulunan personel yok.
                </div>
              )}
            </div>
            <button
              className="home-link home-card-link home-birthday-link"
              type="button"
              onClick={() => setShowUpcomingBirthdaysList(true)}
            >
              Gelecek 2 ay <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>
        </div>

        <div className="home-column">
          <article className="home-card">
            <HomeCardHeader icon={CalendarCheck} title="Yaklaşan İzinler" />
            <div className="home-people-list">
              {upcomingLeaves.map((record) => {
                const member = activeStaff.find((item) => item.id === record.staffId);
                return (
                  <button key={record.id} type="button" onClick={() => onNavigate("annualLeave")}>
                    <span className="home-person-avatar is-blue">
                      {(member?.name || "?").slice(0, 1).toLocaleUpperCase("tr-TR")}
                    </span>
                    <span>
                      <strong>{member?.name || "Personel"}</strong>
                      <small>{annualLeaveTypeLabels[record.leaveType]}</small>
                    </span>
                    <time>{formatShortDate(record.startDate)}</time>
                  </button>
                );
              })}
              {!upcomingLeaves.length && <div className="home-empty">Yaklaşan izin bulunmuyor.</div>}
            </div>
          </article>

          <article className="home-card home-entitlement-card">
            <HomeCardHeader icon={CheckCircle2} title="Yıllık İzni Hak Edenler" />
            <div className="home-people-list">
              {annualLeaveEligibleStaff.slice(0, 4).map(({ staff: member, entitlementDate, entitlementDays }) => (
                <button key={member.id} type="button" onClick={() => onOpenProfile(member.id)}>
                  <span className="home-person-avatar is-entitled">
                    {member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                  </span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{entitlementDays} gün yıllık izin hakkı</small>
                  </span>
                  <time dateTime={entitlementDate}>{formatShortDate(entitlementDate)}</time>
                </button>
              ))}
              {!annualLeaveEligibleStaff.length && (
                <div className="home-empty">
                  Bu yıl henüz yıllık izin hakkı kazanan personel yok.
                </div>
              )}
            </div>
            <button
              className="home-link home-card-link"
              type="button"
              onClick={() => setShowAnnualLeaveEligibleList(true)}
            >
              Tümünü gör ({annualLeaveEligibleStaff.length}) <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className="home-card">
            <HomeCardHeader icon={CalendarDays} title="Resmi Tatiller" />
            <div className="home-holiday-list">
              {upcomingHolidays.map((holiday) => (
                <div key={`${holiday.date}-${holiday.name}`}>
                  <strong>{holiday.name}</strong>
                  <span>{holiday.duration === "half" ? "0,5g" : "1g"}</span>
                  <time>{formatShortDate(holiday.date)}</time>
                </div>
              ))}
            </div>
            <button className="home-link home-card-link" type="button" onClick={() => onNavigate("holidayWork")}>
              Takvimi aç <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className="home-card">
            <HomeCardHeader icon={Activity} title="Bugünün Özeti" />
            <div className="home-today-grid">
              <div><span>Geldi</span><strong>{dailyStats.present}</strong></div>
              <div><span>Geç</span><strong>{dailyStats.late}</strong></div>
              <div><span>Gelmedi</span><strong>{dailyStats.absent}</strong></div>
              <div><span>İzinli</span><strong>{dailyStats.excused}</strong></div>
            </div>
            {auditLogs[0] && (
              <p className="home-last-action">
                Son işlem: <strong>{auditLogs[0].action}</strong>
              </p>
            )}
            <button className="home-link home-card-link" type="button" onClick={() => onNavigate("daily")}>
              Günlük kayda git <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>
        </div>
      </section>
    </main>
  );
}

function HomeCardHeader({
  icon: Icon,
  title,
  actionLabel,
}: {
  icon: typeof CalendarCheck;
  title: string;
  actionLabel?: string;
}) {
  return (
    <header className="home-card-head">
      <span><Icon size={17} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <button type="button" title={actionLabel || "Diğer seçenekler"} aria-label={actionLabel || `${title} seçenekleri`}>
        {actionLabel ? <RefreshCw size={16} aria-hidden="true" /> : <MoreVertical size={17} aria-hidden="true" />}
      </button>
    </header>
  );
}

function Metric({
  label,
  value,
  suffix = "",
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "green" | "amber" | "red" | "blue";
}) {
  return (
    <div className={`metric ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}{suffix}</strong>
    </div>
  );
}

function ProfileHistoryPanel({
  staff,
  title,
  subtitle,
  events,
  emptyText,
}: {
  staff: StaffMember;
  title: string;
  subtitle: string;
  events: ProfileHistoryEvent[];
  emptyText: string;
}) {
  const exportTable: ProfileExportTable = {
    staffName: staff.name,
    staffDetails: getProfileExportStaffDetails(staff),
    title,
    subtitle,
    columns: ["Tarih", "İşlem / Durum", "Detay"],
    rows: events.map((event) => [event.date, event.action, event.detail]),
  };

  return (
    <section className="data-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <div className="button-row">
          <button
            className="secondary-action"
            type="button"
            onClick={() => downloadProfileSectionExcel(exportTable)}
            disabled={!events.length}
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
            Excel
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void downloadProfileSectionPdf(exportTable)}
            disabled={!events.length}
          >
            <FileDown size={18} aria-hidden="true" />
            PDF
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>İşlem / Durum</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.date}</td>
                <td><strong>{event.action}</strong></td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!events.length && <div className="empty-state">{emptyText}</div>}
    </section>
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

function WorkforceTrendChart({ rows }: { rows: MonthlyWorkforceTrend[] }) {
  const maxMovement = Math.max(1, ...rows.flatMap((row) => [row.hires, row.exits]));
  const shortMonthFormatter = new Intl.DateTimeFormat("tr-TR", { month: "short" });

  return (
    <section className="data-panel workforce-trend-panel">
      <div className="panel-heading">
        <div>
          <h2>Son 12 Ay Personel Hareketi</h2>
          <span>İşe alınan, işten çıkan ve ay sonu personel sayısı</span>
        </div>
        <div className="workforce-chart-legend">
          <span className="is-hire">İşe alınan</span>
          <span className="is-exit">İşten çıkan</span>
        </div>
      </div>
      <div className="workforce-trend-chart">
        {rows.map((row) => (
          <div className="workforce-month" key={row.month} title={`${formatMonthTr(row.month)}: ${row.hires} giriş, ${row.exits} çıkış, ${row.closing} dönem sonu`}>
            <div className="workforce-bar-area">
              <span className="workforce-bar is-hire" style={{ height: `${Math.max(row.hires ? 12 : 3, (row.hires / maxMovement) * 100)}%` }}><b>{row.hires || ""}</b></span>
              <span className="workforce-bar is-exit" style={{ height: `${Math.max(row.exits ? 12 : 3, (row.exits / maxMovement) * 100)}%` }}><b>{row.exits || ""}</b></span>
            </div>
            <strong>{row.closing}</strong>
            <small>{shortMonthFormatter.format(new Date(`${row.month}-01T12:00:00`))}</small>
          </div>
        ))}
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
          <span>Kullanıldı</span>
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
            <th>Kullanıldı</th>
            <th>Planlanan</th>
            <th>Durum</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {sortedRecords.map((record, index) => {
            const member = staffById.get(record.staffId);
            const annualBreakdown = getAnnualLeaveUsageBreakdown(record);
            return (
              <tr key={record.id}>
                <td>{index + 1}</td>
                <td>{member?.name ?? ""}</td>
                <td>{member?.department ?? ""}</td>
                <td>{member?.title ?? ""}</td>
                <td>{annualLeaveTypeLabels[record.leaveType]}</td>
                <td>{record.startDate} - {record.endDate}</td>
                <td>{record.usedDays}</td>
                <td>{annualBreakdown.used}</td>
                <td>{annualBreakdown.planned}</td>
                <td>{getAnnualLeaveDisplayStatus(record)}</td>
                <td>{record.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function UnpaidLeaveGroupsTable({
  groups,
  staffById,
  emptyText,
  onEdit,
  onDelete,
}: {
  groups: LeaveGroup[];
  staffById: Map<string, StaffMember>;
  emptyText: string;
  onEdit: (record: AnnualLeaveRecord) => void;
  onDelete: (record: AnnualLeaveRecord) => void;
}) {
  return (
    <>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Personel</th>
              <th>Personel Durumu</th>
              <th>Kayıt</th>
              <th>Yıl</th>
              <th>Tür</th>
              <th>Tarih Aralıkları</th>
              <th>Toplam Gün</th>
              <th>Durum Özeti</th>
              <th>Notlar</th>
              <th aria-label="İşlem" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const member = staffById.get(group.staffId);
              return (
                <tr key={group.id}>
                  <td>
                    <strong>{member?.name ?? ""}</strong>
                    <span>{member?.department ?? ""}</span>
                  </td>
                  <td>
                    <span className={member?.active ? "status-toggle" : "status-pill status-empty"}>
                      {getStaffDepartureLabel(member)}
                    </span>
                  </td>
                  <td>{group.records.length}</td>
                  <td>{group.year}</td>
                  <td>{annualLeaveTypeLabels[group.leaveType]}</td>
                  <td>{group.dateRanges.join(", ")}</td>
                  <td>{group.usedDays}</td>
                  <td><span className="status-toggle">{group.statusSummary}</span></td>
                  <td>{group.notes.join(" / ") || "-"}</td>
                  <td>
                    <div className="row-actions">
                      {group.records.map((record) => (
                        <span className="record-action-pair" key={record.id}>
                          <small>{record.startDate}</small>
                          <button className="icon-button" onClick={() => onEdit(record)} title={`${record.startDate} düzenle`} aria-label={`${record.startDate} ücretsiz izin kaydını düzenle`}>
                            <Edit3 size={17} />
                          </button>
                          <button className="icon-button danger" onClick={() => onDelete(record)} title={`${record.startDate} sil`} aria-label={`${record.startDate} ücretsiz izin kaydını sil`}>
                            <Trash2 size={17} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!groups.length && <div className="empty-state">{emptyText}</div>}
    </>
  );
}

function GroupedLeavePrintReport({
  groups,
  departedGroups,
  staffById,
  stats,
  departedStats,
  reportMonth,
  title,
}: {
  groups: LeaveGroup[];
  departedGroups: LeaveGroup[];
  staffById: Map<string, StaffMember>;
  stats: { records: number; planned: number; completed: number; cancelled: number };
  departedStats: { records: number; planned: number; completed: number; cancelled: number };
  reportMonth: string;
  title: string;
}) {
  const sortedGroups = [...groups].sort(
    (a, b) =>
      (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr", { sensitivity: "base" }) ||
      a.staffId.localeCompare(b.staffId),
  );
  const sortedDepartedGroups = [...departedGroups].sort(
    (a, b) =>
      (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr", { sensitivity: "base" }) ||
      a.staffId.localeCompare(b.staffId),
  );
  const totalStats = {
    records: stats.records + departedStats.records,
    planned: stats.planned + departedStats.planned,
    completed: stats.completed + departedStats.completed,
    cancelled: stats.cancelled + departedStats.cancelled,
  };

  const renderGroupTable = (sectionGroups: LeaveGroup[]) => (
    <table className="holiday-report-table">
      <thead>
        <tr>
          <th>No</th>
          <th>Personel</th>
          <th>Personel Durumu</th>
          <th>Departman</th>
          <th>Ünvan</th>
          <th>Kayıt</th>
          <th>Tarih Aralıkları</th>
          <th>Toplam Gün</th>
          <th>Durum Özeti</th>
          <th>Notlar</th>
        </tr>
      </thead>
      <tbody>
        {sectionGroups.map((group, index) => {
          const member = staffById.get(group.staffId);
          return (
            <tr key={group.id}>
              <td>{index + 1}</td>
              <td>{member?.name ?? ""}</td>
              <td>{getStaffDepartureLabel(member)}</td>
              <td>{member?.department ?? ""}</td>
              <td>{member?.title ?? ""}</td>
              <td>{group.records.length}</td>
              <td>{group.dateRanges.join(", ")}</td>
              <td>{group.usedDays}</td>
              <td>{group.statusSummary}</td>
              <td>{group.notes.join(" / ")}</td>
            </tr>
          );
        })}
        {!sectionGroups.length && (
          <tr>
            <td colSpan={10}>Bu bölümde ücretsiz izin kaydı bulunmuyor.</td>
          </tr>
        )}
      </tbody>
    </table>
  );

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
          <strong>{totalStats.records}</strong>
        </div>
        <div>
          <span>Planlanan</span>
          <strong>{totalStats.planned}</strong>
        </div>
        <div>
          <span>Bitti</span>
          <strong>{totalStats.completed}</strong>
        </div>
        <div>
          <span>İptal</span>
          <strong>{totalStats.cancelled}</strong>
        </div>
      </section>
      <section className="grouped-leave-report-section">
        <h2>Aktif Personel <span>{stats.records} kayıt</span></h2>
        {renderGroupTable(sortedGroups)}
      </section>
      {sortedDepartedGroups.length > 0 && (
        <section className="grouped-leave-report-section is-departed">
          <h2>İşten Ayrılmış Personel <span>{departedStats.records} kayıt</span></h2>
          {renderGroupTable(sortedDepartedGroups)}
        </section>
      )}
    </article>
  );
}

function HourlyLeavePrintReport({
  groups,
  staffById,
  stats,
  reportMonth,
}: {
  groups: HourlyLeaveGroup[];
  staffById: Map<string, StaffMember>;
  stats: { records: number; minutes: number; used: number; planned: number; cancelled: number };
  reportMonth: string;
}) {
  const sortedGroups = [...groups].sort(
    (a, b) =>
      (staffById.get(a.staffId)?.name ?? "").localeCompare(staffById.get(b.staffId)?.name ?? "", "tr", { sensitivity: "base" }) ||
      a.staffId.localeCompare(b.staffId),
  );

  return (
    <article className="holiday-report-page">
      <header className="holiday-report-header">
        <div>
          <strong>{formatMonthTr(reportMonth)} Saatlik İzin Raporu</strong>
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
          <span>Toplam Süre</span>
          <strong>{formatLeaveDuration(stats.minutes)}</strong>
        </div>
        <div>
          <span>Toplam Gün</span>
          <strong>{formatLeaveDayValue(stats.minutes)}</strong>
        </div>
        <div>
          <span>Kullanılan</span>
          <strong>{stats.used}</strong>
        </div>
        <div>
          <span>Planlanan</span>
          <strong>{stats.planned}</strong>
        </div>
      </section>
      <table className="holiday-report-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Personel</th>
            <th>Departman</th>
            <th>Ünvan</th>
            <th>Kayıt</th>
            <th>Tarihler</th>
            <th>Saat Detayları</th>
            <th>Toplam Süre</th>
            <th>Gün</th>
            <th>Durum Özeti</th>
            <th>Sebep / Not</th>
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
                <td>{member?.title ?? ""}</td>
                <td>{group.records.length}</td>
                <td>{group.dates.join(", ")}</td>
                <td>{group.timeRanges.join(", ")}</td>
                <td>{formatLeaveDuration(group.minutes)}</td>
                <td>{formatLeaveDayValue(group.minutes)}</td>
                <td>{group.statusSummary}</td>
                <td>{[group.reasons.join(" / "), group.notes.join(" / ")].filter(Boolean).join(" - ")}</td>
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
  explanations,
  preview = false,
}: {
  staff: StaffMember[];
  startNumber: number;
  pageIndex: number;
  pageCount: number;
  selectedDate: string;
  settings: AppSettings;
  explanations: Map<string, string>;
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
              <td>{explanations.get(member.id)}</td>
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
