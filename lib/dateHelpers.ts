export type CalendarCell = {
  date: Date | null;
  key: string;
};

export function toYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isTodayOrFuture(dateStr: string) {
  if (!dateStr) return false;

  const shiftDate = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return shiftDate >= today;
}

export function isPastDate(dateStr: string) {
  if (!dateStr) return false;

  const shiftDate = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return shiftDate < today;
}

export function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = parseLocalDate(dateStr);
  target.setHours(0, 0, 0, 0);

  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function monthName(date: Date) {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatLongDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function buildCalendarDays(viewDate: Date): CalendarCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];

  for (let i = 0; i < startDay; i++) {
    cells.push({ date: null, key: `blank-start-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(year, month, day),
      key: `day-${year}-${month + 1}-${day}`,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `blank-end-${cells.length}` });
  }

  return cells;
}
