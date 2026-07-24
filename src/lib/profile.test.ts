import { describe, expect, it } from "vitest";
import type { AnnualLeaveRecord } from "../types";
import {
  calculateAnnualLeaveYearBalances,
  calculateProfileLeaveStats,
  sortProfileHistoryNewestFirst,
} from "./profile";

function leave(overrides: Partial<AnnualLeaveRecord>): AnnualLeaveRecord {
  return {
    id: crypto.randomUUID(),
    staffId: "staff-1",
    year: 2026,
    leaveType: "annual",
    startDate: "2026-07-01",
    endDate: "2026-07-03",
    usedDays: 3,
    entitlementDays: 14,
    status: "completed",
    notes: "",
    createdAt: "2026-07-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("personel profil izin özeti", () => {
  it("tüm yıllardaki yıllık izin kullanımını toplar", () => {
    const stats = calculateProfileLeaveStats("staff-1", 2026, 14, [
      leave({ year: 2025, usedDays: 5 }),
      leave({ year: 2026, usedDays: 3 }),
    ], "2026-07-24");

    expect(stats.annualUsedTotal).toBe(8);
    expect(stats.annualRemaining).toBe(11);
  });

  it("gelecekteki yıllık izni kalan bakiyeden düşer", () => {
    const stats = calculateProfileLeaveStats("staff-1", 2026, 14, [
      leave({
        startDate: "2026-08-03",
        endDate: "2026-08-07",
        usedDays: 5,
        status: "planned",
      }),
    ], "2026-07-24");

    expect(stats.annualPlannedCurrentYear).toBe(5);
    expect(stats.annualRemaining).toBe(9);
  });

  it("ücretsiz izinde yalnızca bugüne kadar geçen günleri toplar", () => {
    const stats = calculateProfileLeaveStats("staff-1", 2026, 14, [
      leave({
        leaveType: "unpaid",
        startDate: "2026-07-20",
        endDate: "2026-07-31",
        usedDays: 10,
        status: "planned",
      }),
    ], "2026-07-24");

    expect(stats.unpaidUsedTotal).toBe(5);
  });
});

describe("personel profil geçmişi sıralaması", () => {
  it("güncellenme zamanından bağımsız olarak işlem tarihini en yeniden eskiye sıralar", () => {
    const rows = sortProfileHistoryNewestFirst([
      { id: "older-updated-last", date: "2024-11-01", sortDate: "2026-07-24T09:00:00.000Z" },
      { id: "newest", date: "2026-07-23", sortDate: "2026-07-23T09:00:00.000Z" },
      { id: "middle", date: "2025-12-08", sortDate: "2025-12-08T09:00:00.000Z" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["newest", "middle", "older-updated-last"]);
  });
});

describe("yıllık izin hak ve devir hesabı", () => {
  it("kullanılmayan izinleri sonraki yıllara ayrı olarak devreder", () => {
    const balances = calculateAnnualLeaveYearBalances(
      "staff-1",
      2024,
      2026,
      { 2024: 14, 2025: 14, 2026: 14 },
      [
        leave({ year: 2024, usedDays: 6, status: "used" }),
        leave({ year: 2025, usedDays: 10, status: "used" }),
        leave({ year: 2026, usedDays: 5, status: "used" }),
      ],
      "2026-07-24",
    );

    expect(balances).toEqual([
      { year: 2024, entitlement: 14, carryIn: 0, used: 6, planned: 0, carryOut: 8 },
      { year: 2025, entitlement: 14, carryIn: 8, used: 10, planned: 0, carryOut: 12 },
      { year: 2026, entitlement: 14, carryIn: 12, used: 5, planned: 0, carryOut: 21 },
    ]);
  });

  it("gelecek tarihli planlanan izni kullanılabilir bakiyeden ayırır", () => {
    const balances = calculateAnnualLeaveYearBalances(
      "staff-1",
      2026,
      2026,
      { 2026: 14 },
      [
        leave({
          year: 2026,
          startDate: "2026-08-03",
          endDate: "2026-08-07",
          usedDays: 5,
          status: "planned",
        }),
      ],
      "2026-07-24",
    );

    expect(balances[0]).toEqual({
      year: 2026,
      entitlement: 14,
      carryIn: 0,
      used: 0,
      planned: 5,
      carryOut: 9,
    });
  });
});
