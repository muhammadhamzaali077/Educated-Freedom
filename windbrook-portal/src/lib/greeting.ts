export type Period = 'morning' | 'afternoon' | 'evening';

export function periodOfDay(date: Date = new Date()): Period {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export function greetingFor(name: string, date: Date = new Date()): string {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  const period = periodOfDay(date);
  const phrase = period === 'morning' ? 'Good morning' : period === 'afternoon' ? 'Good afternoon' : 'Good evening';
  return `${phrase}, ${firstName}.`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return (parts[0]?.[0] ?? '·').toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
}
