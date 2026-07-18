import type { AnnualLeaveRecord, StaffMember } from "../types";

type StaffEmploymentState = Pick<StaffMember, "active" | "endDate">;
type UnpaidLeavePeriod = Pick<AnnualLeaveRecord, "startDate" | "endDate">;

export function getStaffDepartureLabel(member?: StaffEmploymentState) {
  if (!member || member.active) return "Aktif";
  const formattedEndDate = member.endDate ? member.endDate.split("-").reverse().join(".") : "";
  return formattedEndDate ? `İşten ayrıldı (${formattedEndDate})` : "İşten ayrıldı";
}

export function shouldIncludeUnpaidLeaveInMonth(
  record: UnpaidLeavePeriod,
  member: StaffEmploymentState | undefined,
  reportMonth: string,
) {
  const monthStart = `${reportMonth}-01`;
  const year = Number(reportMonth.slice(0, 4));
  const month = Number(reportMonth.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${reportMonth}-${String(lastDay).padStart(2, "0")}`;

  if (record.startDate > monthEnd || record.endDate < monthStart) return false;
  if (member && !member.active && member.endDate && member.endDate < monthStart) return false;
  return true;
}
