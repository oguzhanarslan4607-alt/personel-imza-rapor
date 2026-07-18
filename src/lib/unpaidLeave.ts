import type { LeaveStatus } from "../types";

export function getUnpaidLeaveAutomaticStatus(endDate: string, referenceDate: string): LeaveStatus {
  return endDate < referenceDate ? "completed" : "planned";
}
