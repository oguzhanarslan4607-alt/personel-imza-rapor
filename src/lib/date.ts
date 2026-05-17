export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
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
