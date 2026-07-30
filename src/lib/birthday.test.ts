import { describe, expect, it } from "vitest";
import { getBirthdayTimingLabel, getUpcomingBirthdays } from "./birthday";
import type { StaffMember } from "../types";

function member(id: string, name: string, birthDate: string, active = true): StaffMember {
  return {
    id,
    order: 1,
    name,
    department: "",
    title: "",
    birthDate,
    active,
  };
}

describe("getUpcomingBirthdays", () => {
  it("sorts birthdays across the year boundary", () => {
    const result = getUpcomingBirthdays([
      member("1", "Ocak", "1990-01-02"),
      member("2", "Aralık", "1988-12-31"),
    ], "2026-12-30");

    expect(result.map((item) => [item.staff.name, item.daysUntil])).toEqual([
      ["Aralık", 1],
      ["Ocak", 3],
    ]);
  });

  it("ignores inactive staff and records without a valid birth date", () => {
    const result = getUpcomingBirthdays([
      member("1", "Pasif", "1990-08-01", false),
      member("2", "Geçersiz", ""),
      member("3", "Aktif", "1992-08-02"),
    ], "2026-08-01");

    expect(result).toHaveLength(1);
    expect(result[0].staff.name).toBe("Aktif");
  });

  it("uses 28 February for leap-day birthdays in non-leap years", () => {
    const [result] = getUpcomingBirthdays([member("1", "Şubat", "1992-02-29")], "2026-02-27");

    expect(result.nextBirthday).toBe("2026-02-28");
    expect(result.daysUntil).toBe(1);
  });
});

describe("getBirthdayTimingLabel", () => {
  it("formats immediate and future birthday labels", () => {
    expect(getBirthdayTimingLabel(0)).toBe("Bugün");
    expect(getBirthdayTimingLabel(1)).toBe("Yarın");
    expect(getBirthdayTimingLabel(12)).toBe("12 gün sonra");
  });
});
