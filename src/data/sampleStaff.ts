import type { StaffMember } from "../types";

export function createSampleStaff(count = 85, offset = 0): StaffMember[] {
  return Array.from({ length: count }, (_, index) => {
    const number = offset + index + 1;

    return {
      id: crypto.randomUUID(),
      order: number,
      name: `Personel ${String(number).padStart(3, "0")}`,
      department: "",
      title: "",
      active: true,
      showOnSignatureSheet: true,
    };
  });
}
