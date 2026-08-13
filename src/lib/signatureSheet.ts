import type { AnnualLeaveRecord, AnnualLeaveType, IncapacityReportRecord } from "../types";

const leaveLabels: Record<AnnualLeaveType, string> = {
  annual: "Yıllık izin",
  excuse: "Mazeret izni",
  unpaid: "Ücretsiz izin",
  other: "Diğer izin",
};

export function getSignatureSheetExplanation(
  staffId: string,
  date: string,
  leaveRecords: AnnualLeaveRecord[],
  incapacityReports: IncapacityReportRecord[],
) {
  const explanations = leaveRecords
    .filter(
      (record) =>
        record.staffId === staffId &&
        record.status !== "cancelled" &&
        record.startDate <= date &&
        record.endDate >= date,
    )
    .map((record) => leaveLabels[record.leaveType]);

  const hasIncapacityReport = incapacityReports.some(
    (record) =>
      record.staffId === staffId &&
      record.status !== "cancelled" &&
      record.startDate <= date &&
      record.endDate >= date,
  );

  if (hasIncapacityReport) explanations.push("İş göremezlik raporu");

  return [...new Set(explanations)].join(", ");
}
