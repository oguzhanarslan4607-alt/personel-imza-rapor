import { describe, expect, it } from "vitest";
import type { AnnualLeaveRecord } from "../types";
import {
  calculateAnnualEntitlementForServiceYear,
  calculateAnnualEntitlementFromStartDate,
  calculateAnnualLeaveYearBalances,
  calculateProfileLeaveStats,
  getAnnualLeaveEligibleStaff,
  getAnnualLeaveEntitlementDate,
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

describe("yıllık izin hak ediş tarihi", () => {
  it("işe giriş yılında izin hakkı oluşturmaz", () => {
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2022,
      "2026-07-24",
    )).toBe(0);
  });

  it("ilk 14 günlük hakkı işe girişten bir yıl sonraki aynı tarihte verir", () => {
    expect(getAnnualLeaveEntitlementDate("2022-08-15", 2023)).toBe("2023-08-15");
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2023,
      "2023-08-14",
    )).toBe(0);
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2023,
      "2023-08-15",
    )).toBe(14);
  });

  it("beş yıl dahil 14 gün, beş yıldan fazla hizmette 20 gün verir", () => {
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2027,
      "2027-08-15",
    )).toBe(14);
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2028,
      "2028-08-15",
    )).toBe(20);
  });

  it("işten çıkıştan sonraki hak edişi bakiyeye eklemez", () => {
    expect(calculateAnnualEntitlementFromStartDate(
      "2022-08-15",
      2023,
      "2023-08-15",
      "2023-08-01",
    )).toBe(0);
  });

  it("yıldönümü gelmeden hak edilecek gün sayısını hesaplar", () => {
    expect(calculateAnnualEntitlementFromStartDate(
      "2023-08-26",
      2026,
      "2026-07-24",
    )).toBe(0);
    expect(calculateAnnualEntitlementForServiceYear(
      "2023-08-26",
      2026,
    )).toBe(14);
  });
});

describe("ana sayfa yıllık izin hak edenler", () => {
  const staffMember = (
    id: string,
    name: string,
    startDate: string,
    active = true,
  ) => ({
    id,
    order: 1,
    name,
    department: "",
    title: "",
    active,
    startDate,
  });

  it("yalnızca yıldönümü gelmiş aktif personelleri en yeni hak edişten başlayarak sıralar", () => {
    const rows = getAnnualLeaveEligibleStaff([
      staffMember("1", "Bugün Hak Etti", "2025-07-30"),
      staffMember("2", "Dün Hak Etti", "2020-07-29"),
      staffMember("3", "Önce Hak Etti", "2011-07-28"),
      staffMember("4", "Henüz Hak Etmedi", "2025-08-01"),
      staffMember("5", "Pasif Personel", "2020-01-01", false),
    ], "2026-07-30");

    expect(rows.map((row) => ({
      name: row.staff.name,
      entitlementDate: row.entitlementDate,
      entitlementDays: row.entitlementDays,
    }))).toEqual([
      { name: "Bugün Hak Etti", entitlementDate: "2026-07-30", entitlementDays: 14 },
      { name: "Dün Hak Etti", entitlementDate: "2026-07-29", entitlementDays: 20 },
      { name: "Önce Hak Etti", entitlementDate: "2026-07-28", entitlementDays: 26 },
    ]);
  });
});
