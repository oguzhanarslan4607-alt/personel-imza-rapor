import { describe, expect, it } from "vitest";
import { getStaffDepartureLabel, shouldIncludeUnpaidLeaveInMonth } from "./staffDeparture";

const leave = { startDate: "2026-07-01", endDate: "2026-10-31" };

describe("ücretsiz izin raporunda işten ayrılma", () => {
  it("personeli ayrıldığı ay raporda gösterir", () => {
    expect(shouldIncludeUnpaidLeaveInMonth(leave, { active: false, endDate: "2026-07-15" }, "2026-07")).toBe(true);
  });

  it("ayrıldığı aydan sonraki raporlarda tekrar göstermez", () => {
    expect(shouldIncludeUnpaidLeaveInMonth(leave, { active: false, endDate: "2026-07-15" }, "2026-08")).toBe(false);
  });

  it("ayrılan personeli açıklayıcı metinle işaretler", () => {
    expect(getStaffDepartureLabel({ active: false, endDate: "2026-07-15" })).toBe("İşten ayrıldı (15.07.2026)");
  });
});
