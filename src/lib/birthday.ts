import type { StaffMember } from "../types";

export type UpcomingBirthday = {
  staff: StaffMember;
  nextBirthday: string;
  daysUntil: number;
};

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function birthdayInYear(birthDate: string, year: number) {
  const [, monthText, dayText] = birthDate.split("-");
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const normalizedDay = Math.min(day, daysInMonth(year, month));
  return {
    iso: `${year}-${String(month).padStart(2, "0")}-${String(normalizedDay).padStart(2, "0")}`,
    timestamp: Date.UTC(year, month - 1, normalizedDay),
  };
}

export function getUpcomingBirthdays(
  staff: StaffMember[],
  referenceDate: string,
  limit = 3,
): UpcomingBirthday[] {
  const [yearText, monthText, dayText] = referenceDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const referenceTimestamp = Date.UTC(year, month - 1, day);

  if (!Number.isFinite(referenceTimestamp)) return [];

  return staff
    .filter((member) => member.active && Boolean(member.birthDate))
    .flatMap((member) => {
      const thisYear = birthdayInYear(member.birthDate ?? "", year);
      if (!thisYear) return [];
      const nextBirthday = thisYear.timestamp >= referenceTimestamp
        ? thisYear
        : birthdayInYear(member.birthDate ?? "", year + 1);
      if (!nextBirthday) return [];

      return [{
        staff: member,
        nextBirthday: nextBirthday.iso,
        daysUntil: Math.round((nextBirthday.timestamp - referenceTimestamp) / 86_400_000),
      }];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.staff.name.localeCompare(b.staff.name, "tr"))
    .slice(0, Math.max(0, limit));
}

export function getBirthdayTimingLabel(daysUntil: number) {
  if (daysUntil === 0) return "Bugün";
  if (daysUntil === 1) return "Yarın";
  return `${daysUntil} gün sonra`;
}
