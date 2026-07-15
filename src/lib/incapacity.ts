import type { IncapacityReportRecord } from "../types";

function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getIncapacityWorkDates(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) return [];

  const dates: string[] = [];
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  while (cursor <= end) {
    if (cursor.getDay() !== 0) dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function findIncapacityReportForDate(
  reports: IncapacityReportRecord[],
  staffId: string,
  date: string,
) {
  return reports.find(
    (record) =>
      record.staffId === staffId &&
      record.status !== "cancelled" &&
      record.startDate <= date &&
      record.endDate >= date,
  );
}

export type IncapacityReminderTone = "overdue" | "dueSoon" | "scheduled" | "complete" | "none";

export function getIncapacityReminderTone(
  report: IncapacityReportRecord,
  today: string,
  dueSoonDate: string,
): IncapacityReminderTone {
  if (report.sgkNotified) return "complete";
  if (!report.reminderEnabled || !report.notificationDeadline || report.status === "cancelled") return "none";
  if (report.notificationDeadline < today) return "overdue";
  if (report.notificationDeadline <= dueSoonDate) return "dueSoon";
  return "scheduled";
}
