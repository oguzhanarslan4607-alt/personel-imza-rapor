function addOneDayIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    nextDate.getUTCFullYear(),
    String(nextDate.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getHourlyLeaveEndDate(date: string, startTime: string, endTime: string) {
  return timeToMinutes(endTime) <= timeToMinutes(startTime) ? addOneDayIso(date) : date;
}

export function formatHourlyLeaveFormDuration(minutes: number) {
  const hours = minutes / 60;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(hours)} Saat`;
}
