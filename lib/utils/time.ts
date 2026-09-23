export function validateInput(date: string, time: string): void {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date))
    throw new Error("날짜는 2000년부터 2099년 사이로 선택해 주세요.");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("올바른 날짜를 선택해 주세요.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("올바른 출발시간을 입력해 주세요.");
}

// UTC is used only for arithmetic on Korean wall-clock components, never as the departure timezone.
export function arrivalAt(date: string, time: string, minutes: number) {
  validateInput(date, time);
  const start = new Date(`${date}T${time}:00Z`);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    arrivalDate: end.toISOString().slice(0, 10),
    arrivalTime: end.toISOString().slice(11, 16),
    dayOffset: Math.floor(
      (Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes) / 1440,
    ),
  };
}
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours
    ? `${hours}시간${remainder ? ` ${remainder}분` : ""}`
    : `${remainder}분`;
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export function koreanToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
