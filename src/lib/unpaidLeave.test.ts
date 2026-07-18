import { describe, expect, it } from "vitest";
import { getUnpaidLeaveAutomaticStatus } from "./unpaidLeave";

describe("ücretsiz izin otomatik durumu", () => {
  it("dünde kalan izni bitti yapar", () => {
    expect(getUnpaidLeaveAutomaticStatus("2026-07-17", "2026-07-18")).toBe("completed");
  });

  it("bugün biten izni planlandı tutar", () => {
    expect(getUnpaidLeaveAutomaticStatus("2026-07-18", "2026-07-18")).toBe("planned");
  });

  it("ileriki tarihli izni planlandı tutar", () => {
    expect(getUnpaidLeaveAutomaticStatus("2026-07-19", "2026-07-18")).toBe("planned");
  });
});
