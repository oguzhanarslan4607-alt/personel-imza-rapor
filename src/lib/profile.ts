import type { AnnualLeaveRecord } from "../types";

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
