import type {
  AnnualLeaveRecord,
  AttendanceRecord,
  HourlyLeaveRecord,
  IncapacityReportRecord,
  StaffMember,
} from "../types";

export type ReportStaffFilter = { department?: string; staffId?: string };

export type WorkforceMovement = {
  id: string;
  staff: StaffMember;
  date: string;
  kind: "hire" | "exit";
};

export type WorkforceSummary = {
  opening: number;
  hires: number;
  exits: number;
  closing: number;
  net: number;
  average: number;
  turnoverRate: number;
  missingDates: number;
  movements: WorkforceMovement[];
};

export type AttendanceSummary = {
  records: number;
  uniqueCheckIns: number;
  attendedDays: number;
  latePeople: number;
  lateDays: number;
  absentPeople: number;
  absentDays: number;
  excusedDays: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
  punctualStaffIds: string[];
};

export type LeaveCategorySummary = {
  key: "annual" | "unpaid" | "excuse" | "other" | "incapacity" | "hourly";
  label: string;
  people: number;
  records: number;
  days: number;
  minutes: number;
};

export type StaffLeaveSummary = {
  staffId: string;
  days: number;
  minutes: number;
};

export type LeaveReportSummary = {
  categories: LeaveCategorySummary[];
  totalPeople: number;
  totalDays: number;
  totalHourlyMinutes: number;
  topStaff: StaffLeaveSummary[];
};

export type MonthlyWorkforceTrend = WorkforceSummary & { month: string };

export type DepartmentComparisonRow = {
  department: string;
  opening: number;
  hires: number;
  exits: number;
  closing: number;
  net: number;
  turnoverRate: number;
  uniqueCheckIns: number;
  attendedDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
};

export type ConsecutiveAbsenceRow = {
  staffId: string;
  maxConsecutiveDays: number;
  latestAbsenceDate: string;
};

export type LeaveDensityRow = {
  date: string;
  staffIds: string[];
};

export type EarlyExitRow = {
  staff: StaffMember;
  employmentDays: number;
};

function matchesStaff(member: StaffMember, filter: ReportStaffFilter) {
  return (
    (!filter.department || filter.department === "all" || member.department === filter.department) &&
    (!filter.staffId || filter.staffId === "all" || member.id === filter.staffId)
  );
}

function previousIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function isWithin(date: string | undefined, startDate: string, endDate: string) {
  return Boolean(date && date >= startDate && date <= endDate);
}

function overlaps(start: string, end: string, reportStart: string, reportEnd: string) {
  return start <= reportEnd && end >= reportStart;
}

function countWorkdays(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  let days = 0;
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function nextWorkday(value: string) {
  const cursor = new Date(`${value}T12:00:00Z`);
  do cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getUTCDay() === 0);
  return cursor.toISOString().slice(0, 10);
}

function calendarDayDifference(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
}

function countOverlapWorkdays(start: string, end: string, reportStart: string, reportEnd: string) {
  if (!overlaps(start, end, reportStart, reportEnd)) return 0;
  return countWorkdays(start < reportStart ? reportStart : start, end > reportEnd ? reportEnd : end);
}

function getLateMinutes(checkInTime: string, shiftStart: string) {
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
  };
  return checkInTime ? Math.max(0, toMinutes(checkInTime) - toMinutes(shiftStart)) : 0;
}

export function getWorkforceSummary(
  staff: StaffMember[],
  startDate: string,
  endDate: string,
  filter: ReportStaffFilter = {},
): WorkforceSummary {
  const scopedStaff = staff.filter((member) => matchesStaff(member, filter));
  const openingReference = previousIsoDate(startDate);
  const opening = scopedStaff.filter(
    (member) =>
      (!member.startDate || member.startDate <= openingReference) &&
      (member.endDate ? member.endDate >= startDate : member.active !== false),
  ).length;
  const closing = scopedStaff.filter(
    (member) =>
      (!member.startDate || member.startDate <= endDate) &&
      (member.endDate ? member.endDate > endDate : member.active !== false),
  ).length;
  const movements = scopedStaff
    .flatMap<WorkforceMovement>((member) => {
      const rows: WorkforceMovement[] = [];
      if (isWithin(member.startDate, startDate, endDate)) {
        rows.push({ id: `${member.id}-hire-${member.startDate}`, staff: member, date: member.startDate!, kind: "hire" });
      }
      if (isWithin(member.endDate, startDate, endDate)) {
        rows.push({ id: `${member.id}-exit-${member.endDate}`, staff: member, date: member.endDate!, kind: "exit" });
      }
      return rows;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.staff.name.localeCompare(b.staff.name, "tr"));
  const hires = movements.filter((row) => row.kind === "hire").length;
  const exits = movements.filter((row) => row.kind === "exit").length;
  const average = (opening + closing) / 2;

  return {
    opening,
    hires,
    exits,
    closing,
    net: hires - exits,
    average,
    turnoverRate: average ? Number(((exits / average) * 100).toFixed(1)) : 0,
    missingDates: scopedStaff.filter((member) => !member.startDate || (!member.active && !member.endDate)).length,
    movements,
  };
}

export function getAttendanceSummary(records: AttendanceRecord[], shiftStart: string): AttendanceSummary {
  const checkIns = records.filter((record) => record.status === "present" || record.status === "late");
  const lateRecords = records.filter((record) => record.status === "late");
  const absentRecords = records.filter((record) => record.status === "absent");
  const staffWithAttendance = new Set(checkIns.map((record) => record.staffId));
  const lateStaff = new Set(lateRecords.map((record) => record.staffId));
  const totalLateMinutes = lateRecords.reduce((sum, record) => sum + getLateMinutes(record.checkInTime, shiftStart), 0);

  return {
    records: records.length,
    uniqueCheckIns: staffWithAttendance.size,
    attendedDays: checkIns.length,
    latePeople: lateStaff.size,
    lateDays: lateRecords.length,
    absentPeople: new Set(absentRecords.map((record) => record.staffId)).size,
    absentDays: absentRecords.length,
    excusedDays: records.filter((record) => record.status === "excused").length,
    totalLateMinutes,
    averageLateMinutes: lateRecords.length ? Math.round(totalLateMinutes / lateRecords.length) : 0,
    punctualStaffIds: [...staffWithAttendance].filter((staffId) => !lateStaff.has(staffId)),
  };
}

export function getExpectedWorkdays(
  staff: StaffMember[],
  startDate: string,
  endDate: string,
  filter: ReportStaffFilter = {},
) {
  return staff
    .filter((member) => matchesStaff(member, filter))
    .reduce((total, member) => {
      const employmentStart = member.startDate && member.startDate > startDate ? member.startDate : startDate;
      const employmentEnd = member.endDate && member.endDate < endDate ? member.endDate : endDate;
      if (employmentEnd < employmentStart || (!member.startDate && !member.active && !member.endDate)) return total;
      return total + countWorkdays(employmentStart, employmentEnd);
    }, 0);
}

export function getConsecutiveAbsenceRows(records: AttendanceRecord[], minimumDays = 2): ConsecutiveAbsenceRow[] {
  const absencesByStaff = new Map<string, string[]>();
  records
    .filter((record) => record.status === "absent")
    .forEach((record) => {
      const dates = absencesByStaff.get(record.staffId) ?? [];
      dates.push(record.date);
      absencesByStaff.set(record.staffId, dates);
    });

  return [...absencesByStaff.entries()]
    .map(([staffId, rawDates]) => {
      const dates = [...new Set(rawDates)].sort();
      let current = 0;
      let maximum = 0;
      let latestAbsenceDate = "";
      dates.forEach((date, index) => {
        current = index > 0 && nextWorkday(dates[index - 1]) === date ? current + 1 : 1;
        if (current >= maximum) {
          maximum = current;
          latestAbsenceDate = date;
        }
      });
      return { staffId, maxConsecutiveDays: maximum, latestAbsenceDate };
    })
    .filter((row) => row.maxConsecutiveDays >= minimumDays)
    .sort((a, b) => b.maxConsecutiveDays - a.maxConsecutiveDays || b.latestAbsenceDate.localeCompare(a.latestAbsenceDate));
}

export function getLeaveDensityRows(
  annualLeaveRecords: AnnualLeaveRecord[],
  incapacityReports: IncapacityReportRecord[],
  startDate: string,
  endDate: string,
  allowedStaffIds: Set<string>,
): LeaveDensityRow[] {
  const staffByDate = new Map<string, Set<string>>();
  const addRange = (staffId: string, rangeStart: string, rangeEnd: string) => {
    if (!allowedStaffIds.has(staffId) || !overlaps(rangeStart, rangeEnd, startDate, endDate)) return;
    const cursor = new Date(`${rangeStart < startDate ? startDate : rangeStart}T12:00:00Z`);
    const last = new Date(`${rangeEnd > endDate ? endDate : rangeEnd}T12:00:00Z`);
    while (cursor <= last) {
      if (cursor.getUTCDay() !== 0) {
        const date = cursor.toISOString().slice(0, 10);
        const ids = staffByDate.get(date) ?? new Set<string>();
        ids.add(staffId);
        staffByDate.set(date, ids);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  };

  annualLeaveRecords
    .filter((record) => record.status !== "cancelled")
    .forEach((record) => addRange(record.staffId, record.startDate, record.endDate));
  incapacityReports
    .filter((record) => record.status !== "cancelled")
    .forEach((record) => addRange(record.staffId, record.startDate, record.endDate));

  return [...staffByDate.entries()]
    .map(([date, staffIds]) => ({ date, staffIds: [...staffIds] }))
    .sort((a, b) => b.staffIds.length - a.staffIds.length || a.date.localeCompare(b.date));
}

export function getEarlyExitRows(
  staff: StaffMember[],
  startDate: string,
  endDate: string,
  filter: ReportStaffFilter = {},
  maximumEmploymentDays = 90,
): EarlyExitRow[] {
  return staff
    .filter(
      (member) =>
        matchesStaff(member, filter) &&
        Boolean(member.startDate && member.endDate) &&
        isWithin(member.endDate, startDate, endDate),
    )
    .map((member) => ({ staff: member, employmentDays: calendarDayDifference(member.startDate!, member.endDate!) }))
    .filter((row) => row.employmentDays <= maximumEmploymentDays)
    .sort((a, b) => a.employmentDays - b.employmentDays || b.staff.endDate!.localeCompare(a.staff.endDate!));
}

export function getLeaveReportSummary(
  annualLeaveRecords: AnnualLeaveRecord[],
  incapacityReports: IncapacityReportRecord[],
  hourlyLeaveRecords: HourlyLeaveRecord[],
  startDate: string,
  endDate: string,
  allowedStaffIds: Set<string>,
): LeaveReportSummary {
  const categoryMap = new Map<LeaveCategorySummary["key"], LeaveCategorySummary>([
    ["annual", { key: "annual", label: "Yıllık izin", people: 0, records: 0, days: 0, minutes: 0 }],
    ["unpaid", { key: "unpaid", label: "Ücretsiz izin", people: 0, records: 0, days: 0, minutes: 0 }],
    ["excuse", { key: "excuse", label: "Mazeret izni", people: 0, records: 0, days: 0, minutes: 0 }],
    ["other", { key: "other", label: "Diğer izin", people: 0, records: 0, days: 0, minutes: 0 }],
    ["incapacity", { key: "incapacity", label: "İş göremezlik", people: 0, records: 0, days: 0, minutes: 0 }],
    ["hourly", { key: "hourly", label: "Saatlik izin", people: 0, records: 0, days: 0, minutes: 0 }],
  ]);
  const peopleByCategory = new Map<LeaveCategorySummary["key"], Set<string>>();
  const staffTotals = new Map<string, StaffLeaveSummary>();
  const allPeople = new Set<string>();

  const addStaffTotal = (staffId: string, days: number, minutes: number) => {
    const current = staffTotals.get(staffId) ?? { staffId, days: 0, minutes: 0 };
    current.days += days;
    current.minutes += minutes;
    staffTotals.set(staffId, current);
    allPeople.add(staffId);
  };

  annualLeaveRecords
    .filter(
      (record) =>
        allowedStaffIds.has(record.staffId) &&
        record.status !== "cancelled" &&
        overlaps(record.startDate, record.endDate, startDate, endDate),
    )
    .forEach((record) => {
      const category = categoryMap.get(record.leaveType)!;
      const days = countOverlapWorkdays(record.startDate, record.endDate, startDate, endDate);
      category.records += 1;
      category.days += days;
      const people = peopleByCategory.get(record.leaveType) ?? new Set<string>();
      people.add(record.staffId);
      peopleByCategory.set(record.leaveType, people);
      addStaffTotal(record.staffId, days, 0);
    });

  incapacityReports
    .filter(
      (record) =>
        allowedStaffIds.has(record.staffId) &&
        record.status !== "cancelled" &&
        overlaps(record.startDate, record.endDate, startDate, endDate),
    )
    .forEach((record) => {
      const category = categoryMap.get("incapacity")!;
      const days = countOverlapWorkdays(record.startDate, record.endDate, startDate, endDate);
      category.records += 1;
      category.days += days;
      const people = peopleByCategory.get("incapacity") ?? new Set<string>();
      people.add(record.staffId);
      peopleByCategory.set("incapacity", people);
      addStaffTotal(record.staffId, days, 0);
    });

  hourlyLeaveRecords
    .filter(
      (record) =>
        allowedStaffIds.has(record.staffId) &&
        record.status !== "cancelled" &&
        record.date >= startDate &&
        record.date <= endDate,
    )
    .forEach((record) => {
      const category = categoryMap.get("hourly")!;
      category.records += 1;
      category.minutes += record.minutes;
      const people = peopleByCategory.get("hourly") ?? new Set<string>();
      people.add(record.staffId);
      peopleByCategory.set("hourly", people);
      addStaffTotal(record.staffId, 0, record.minutes);
    });

  const categories = [...categoryMap.values()].map((category) => ({
    ...category,
    people: peopleByCategory.get(category.key)?.size ?? 0,
  }));

  return {
    categories,
    totalPeople: allPeople.size,
    totalDays: categories.reduce((sum, category) => sum + category.days, 0),
    totalHourlyMinutes: categoryMap.get("hourly")!.minutes,
    topStaff: [...staffTotals.values()].sort((a, b) => b.days - a.days || b.minutes - a.minutes).slice(0, 10),
  };
}

export function getMonthlyWorkforceTrend(
  staff: StaffMember[],
  endDate: string,
  filter: ReportStaffFilter = {},
  monthCount = 12,
): MonthlyWorkforceTrend[] {
  const [anchorYear, anchorMonth] = endDate.slice(0, 7).split("-").map(Number);
  return Array.from({ length: monthCount }, (_, index) => {
    const offset = index - monthCount + 1;
    const date = new Date(Date.UTC(anchorYear, anchorMonth - 1 + offset, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month, ...getWorkforceSummary(staff, `${month}-01`, getMonthEnd(month), filter) };
  });
}

export function getDepartmentComparisonRows(
  staff: StaffMember[],
  attendanceRecords: AttendanceRecord[],
  annualLeaveRecords: AnnualLeaveRecord[],
  incapacityReports: IncapacityReportRecord[],
  hourlyLeaveRecords: HourlyLeaveRecord[],
  startDate: string,
  endDate: string,
  shiftStart: string,
  filter: ReportStaffFilter = {},
): DepartmentComparisonRow[] {
  const departments = [...new Set(staff.map((member) => member.department.trim() || "Departmansız"))]
    .filter((department) => !filter.department || filter.department === "all" || department === filter.department)
    .sort((a, b) => a.localeCompare(b, "tr"));

  return departments.map((department) => {
    const departmentStaff = staff.filter(
      (member) =>
        (member.department.trim() || "Departmansız") === department &&
        (!filter.staffId || filter.staffId === "all" || member.id === filter.staffId),
    );
    const staffIds = new Set(departmentStaff.map((member) => member.id));
    const workforce = getWorkforceSummary(departmentStaff, startDate, endDate);
    const attendance = getAttendanceSummary(attendanceRecords.filter((record) => staffIds.has(record.staffId)), shiftStart);
    const leave = getLeaveReportSummary(
      annualLeaveRecords,
      incapacityReports,
      hourlyLeaveRecords,
      startDate,
      endDate,
      staffIds,
    );
    return {
      department,
      opening: workforce.opening,
      hires: workforce.hires,
      exits: workforce.exits,
      closing: workforce.closing,
      net: workforce.net,
      turnoverRate: workforce.turnoverRate,
      uniqueCheckIns: attendance.uniqueCheckIns,
      attendedDays: attendance.attendedDays,
      lateDays: attendance.lateDays,
      absentDays: attendance.absentDays,
      leaveDays: leave.totalDays,
    };
  });
}
