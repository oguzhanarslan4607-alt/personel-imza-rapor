import type { AnnualLeaveRecord } from "../types";

export type AnnualLeaveYearBalance = {
  year: number;
  entitlement: number;
  carryIn: number;
  used: number;
  planned: number;
  carryOut: number;
};

export function getAnnualLeaveEntitlementDate(startDate: string | undefined, year: number) {
  if (!startDate) return null;
  const [startYear, month, day] = startDate.split("-").map(Number);
  if (!startYear || !month || !day || year <= startYear) return null;

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const entitlementDay = Math.min(day, lastDayOfMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(entitlementDay).padStart(2, "0")}`;
}

export function calculateAnnualEntitlementFromStartDate(
  startDate: string | undefined,
  year: number,
  referenceDate: string,
  employmentEndDate?: string,
) {
  if (!startDate) return 14;
  const startYear = Number(startDate.slice(0, 4));
  const entitlementDate = getAnnualLeaveEntitlementDate(startDate, year);
  if (!startYear || !entitlementDate) return 0;

  const eligibilityCutoff =
    employmentEndDate && employmentEndDate < referenceDate ? employmentEndDate : referenceDate;
  if (entitlementDate > eligibilityCutoff) return 0;

  const completedServiceYears = year - startYear;
  if (completedServiceYears >= 15) return 26;
  if (completedServiceYears >= 5) return 20;
  return 14;
}

export function sortProfileHistoryNewestFirst<T extends { date: string; sortDate: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => b.date.localeCompare(a.date) || b.sortDate.localeCompare(a.sortDate),
  );
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function countLeaveDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getAnnualBreakdown(record: AnnualLeaveRecord, today: string) {
  if (record.status === "cancelled") return { used: 0, planned: 0 };
  if (record.status === "used" || record.status === "completed") {
    return { used: record.usedDays, planned: 0 };
  }
  if (today < record.startDate) return { used: 0, planned: record.usedDays };

  const usedUntil = today < record.endDate ? today : record.endDate;
  const used = Math.min(record.usedDays, countLeaveDays(record.startDate, usedUntil));
  return { used, planned: Math.max(0, record.usedDays - used) };
}

export function calculateAnnualLeaveYearBalances(
  staffId: string,
  startYear: number,
  endYear: number,
  entitlements: Record<number, number>,
  records: AnnualLeaveRecord[],
  today: string,
) {
  if (endYear < startYear) return [] as AnnualLeaveYearBalance[];

  const annualRecords = records.filter(
    (record) => record.staffId === staffId && record.leaveType === "annual",
  );
  const balances: AnnualLeaveYearBalance[] = [];
  let carryIn = 0;

  for (let year = startYear; year <= endYear; year += 1) {
    const breakdown = annualRecords
      .filter((record) => record.year === year)
      .reduce(
        (total, record) => {
          const current = getAnnualBreakdown(record, today);
          return {
            used: total.used + current.used,
            planned: total.planned + current.planned,
          };
        },
        { used: 0, planned: 0 },
      );
    const entitlement = Math.max(0, entitlements[year] ?? 14);
    const carryOut = Math.max(0, carryIn + entitlement - breakdown.used - breakdown.planned);

    balances.push({
      year,
      entitlement,
      carryIn,
      used: breakdown.used,
      planned: breakdown.planned,
      carryOut,
    });
    carryIn = carryOut;
  }

  return balances;
}

export function calculateProfileLeaveStats(
  staffId: string,
  currentYear: number,
  annualEntitlement: number,
  records: AnnualLeaveRecord[],
  today: string,
) {
  const staffRecords = records.filter((record) => record.staffId === staffId);
  const annualRecords = staffRecords.filter((record) => record.leaveType === "annual");
  const currentYearAnnualRecords = annualRecords.filter((record) => record.year === currentYear);

  const annualUsedTotal = annualRecords.reduce(
    (sum, record) => sum + getAnnualBreakdown(record, today).used,
    0,
  );
  const currentYearBreakdown = currentYearAnnualRecords.reduce(
    (total, record) => {
      const breakdown = getAnnualBreakdown(record, today);
      return {
        used: total.used + breakdown.used,
        planned: total.planned + breakdown.planned,
      };
    },
    { used: 0, planned: 0 },
  );
  const unpaidUsedTotal = staffRecords
    .filter((record) => record.leaveType === "unpaid" && record.status !== "cancelled" && record.startDate <= today)
    .reduce((sum, record) => {
      const usedUntil = today < record.endDate ? today : record.endDate;
      return sum + Math.min(record.usedDays, countLeaveDays(record.startDate, usedUntil));
    }, 0);

  return {
    annualUsedTotal,
    annualEntitlement,
    annualPlannedCurrentYear: currentYearBreakdown.planned,
    annualRemaining: Math.max(
      0,
      annualEntitlement - currentYearBreakdown.used - currentYearBreakdown.planned,
    ),
    unpaidUsedTotal,
  };
}
