import { describe, expect, it } from "vitest";
import type { AnnualLeaveRecord, AttendanceRecord, StaffMember } from "../types";
import { getAttendanceSummary, getLeaveReportSummary, getMonthlyWorkforceTrend, getWorkforceSummary } from "./hrReports";

const staff: StaffMember[] = [
  { id: "existing", order: 1, name: "Mevcut", department: "Ofis", title: "Uzman", active: true, startDate: "2025-01-01" },
  { id: "hire", order: 2, name: "Yeni", department: "Ofis", title: "Uzman", active: true, startDate: "2026-08-05" },
  { id: "exit", order: 3, name: "Ayrılan", department: "Ofis", title: "Uzman", active: false, startDate: "2025-01-01", endDate: "2026-08-18" },
];

describe("İK rapor hesapları", () => {
  it("dönem başı, işe giriş, çıkış ve dönem sonunu tarihlerden hesaplar", () => {
    const result = getWorkforceSummary(staff, "2026-08-01", "2026-08-31", { department: "Ofis" });
    expect(result).toMatchObject({ opening: 2, hires: 1, exits: 1, closing: 2, net: 0, turnoverRate: 50 });
    expect(result.movements.map((row) => row.kind)).toEqual(["exit", "hire"]);
  });

  it("giriş kaydı olan benzersiz personeli ve devam günlerini ayırır", () => {
    const records: AttendanceRecord[] = [
      { id: "1", staffId: "existing", date: "2026-08-01", checkInTime: "08:00", status: "present", lateReason: "" },
      { id: "2", staffId: "existing", date: "2026-08-02", checkInTime: "08:20", status: "late", lateReason: "" },
      { id: "3", staffId: "hire", date: "2026-08-02", checkInTime: "", status: "absent", lateReason: "" },
    ];
    expect(getAttendanceSummary(records, "08:00")).toMatchObject({
      uniqueCheckIns: 1,
      attendedDays: 2,
      latePeople: 1,
      lateDays: 1,
      absentPeople: 1,
      totalLateMinutes: 20,
    });
  });

  it("izin günlerini rapor aralığıyla kesiştirir ve pazarı çıkarır", () => {
    const annual: AnnualLeaveRecord[] = [{
      id: "leave",
      staffId: "existing",
      year: 2026,
      leaveType: "annual",
      startDate: "2026-07-30",
      endDate: "2026-08-03",
      usedDays: 4,
      entitlementDays: 14,
      status: "used",
      notes: "",
      createdAt: "2026-07-01",
    }];
    const result = getLeaveReportSummary(annual, [], [], "2026-08-01", "2026-08-31", new Set(["existing"]));
    expect(result.categories.find((row) => row.key === "annual")).toMatchObject({ people: 1, records: 1, days: 2 });
  });

  it("son 12 ayı seçilen dönemin bitiş ayına göre üretir", () => {
    const trend = getMonthlyWorkforceTrend(staff, "2026-08-20", {}, 12);
    expect(trend[0].month).toBe("2025-09");
    expect(trend[11].month).toBe("2026-08");
  });
});
