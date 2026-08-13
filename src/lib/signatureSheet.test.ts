import { describe, expect, it } from "vitest";
import type { AnnualLeaveRecord, IncapacityReportRecord } from "../types";
import { getSignatureSheetExplanation } from "./signatureSheet";

function leave(overrides: Partial<AnnualLeaveRecord> = {}): AnnualLeaveRecord {
  return {
    id: "leave-1",
    staffId: "staff-1",
    year: 2026,
    leaveType: "annual",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    usedDays: 5,
    entitlementDays: 14,
    status: "used",
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function incapacity(overrides: Partial<IncapacityReportRecord> = {}): IncapacityReportRecord {
  return {
    id: "report-1",
    staffId: "staff-1",
    startDate: "2026-08-12",
    endDate: "2026-08-13",
    dayCount: 2,
    reason: "",
    status: "active",
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("imza föyü açıklaması", () => {
  it("seçili tarihteki izin ve iş göremezlik kalemlerini birleştirir", () => {
    expect(
      getSignatureSheetExplanation(
        "staff-1",
        "2026-08-13",
        [leave(), leave({ id: "leave-2", leaveType: "unpaid" })],
        [incapacity()],
      ),
    ).toBe("Yıllık izin, Ücretsiz izin, İş göremezlik raporu");
  });

  it("başka personele, tarih dışına veya iptal edilmiş kayda açıklama yazmaz", () => {
    expect(
      getSignatureSheetExplanation(
        "staff-1",
        "2026-08-13",
        [leave({ staffId: "staff-2" }), leave({ id: "leave-2", status: "cancelled" })],
        [incapacity({ status: "cancelled" })],
      ),
    ).toBe("");
  });
});
