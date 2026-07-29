import { describe, expect, it } from "vitest";
import { formatHourlyLeaveFormDuration, getHourlyLeaveEndDate } from "./hourlyLeaveForm";

describe("mazeret izin formu saat bilgileri", () => {
  it("150 dakikayı kaynak formdaki biçimde 2,5 saat gösterir", () => {
    expect(formatHourlyLeaveFormDuration(150)).toBe("2,5 Saat");
  });

  it("gece yarısını geçen izinde bitiş tarihini sonraki güne taşır", () => {
    expect(getHourlyLeaveEndDate("2026-07-29", "23:00", "01:00")).toBe("2026-07-30");
  });

  it("aynı gün içindeki izinde tarihi değiştirmez", () => {
    expect(getHourlyLeaveEndDate("2026-07-29", "09:00", "11:30")).toBe("2026-07-29");
  });
});
