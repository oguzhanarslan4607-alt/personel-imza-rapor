import { describe, expect, it } from "vitest";
import type { IncapacityReportRecord } from "../types";
import {
  findIncapacityReportForDate,
  getIncapacityReminderTone,
  getIncapacityWorkDates,
} from "./incapacity";

function report(overrides: Partial<IncapacityReportRecord> = {}): IncapacityReportRecord {
  return {
    id: "report-1",
    staffId: "staff-1",
    startDate: "2026-07-10",
    endDate: "2026-07-14",
    dayCount: 5,
    reason: "Test",
    status: "active",
    notes: "",
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("iş göremezlik puantaj yardımcıları", () => {
  it("rapor aralığını dahil eder ve pazarı puantajdan çıkarır", () => {
    expect(getIncapacityWorkDates("2026-07-10", "2026-07-14")).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-13",
      "2026-07-14",
    ]);
  });

  it("geçersiz tarih aralığında gün üretmez", () => {
    expect(getIncapacityWorkDates("2026-07-14", "2026-07-10")).toEqual([]);
  });

  it("tamamlanmış raporu geçmiş tarihinde bulur, iptal edileni dikkate almaz", () => {
    expect(findIncapacityReportForDate([report({ status: "completed" })], "staff-1", "2026-07-12")?.id).toBe("report-1");
    expect(findIncapacityReportForDate([report({ status: "cancelled" })], "staff-1", "2026-07-12")).toBeUndefined();
  });

  it("SGK bildirim hatırlatmasının gecikme ve yaklaşma durumunu hesaplar", () => {
    expect(
      getIncapacityReminderTone(
        report({ notificationDeadline: "2026-07-14", reminderEnabled: true }),
        "2026-07-15",
        "2026-07-22",
      ),
    ).toBe("overdue");
    expect(
      getIncapacityReminderTone(
        report({ notificationDeadline: "2026-07-20", reminderEnabled: true }),
        "2026-07-15",
        "2026-07-22",
      ),
    ).toBe("dueSoon");
    expect(
      getIncapacityReminderTone(
        report({ notificationDeadline: "2026-07-14", reminderEnabled: true, sgkNotified: true }),
        "2026-07-15",
        "2026-07-22",
      ),
    ).toBe("complete");
  });
});
