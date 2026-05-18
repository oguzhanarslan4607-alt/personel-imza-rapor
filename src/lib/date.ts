export function todayIso() {
  return toLocalIsoDate(new Date());
}

export function monthStartIso() {
  const now = new Date();
  return toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTr(value: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).format(new Date(`${value}T12:00:00`));
}

export function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function compareTimes(a: string, b: string) {
  return a.localeCompare(b);
}
