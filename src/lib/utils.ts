import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns';
import type { FilterState } from '../types';

export function getDefaultFilters(period: FilterState['period'] = 'monthly'): FilterState {
  const now = new Date();
  let dateFrom = '';
  if (period === 'daily')   dateFrom = format(startOfDay(now), 'yyyy-MM-dd');
  if (period === 'weekly')  dateFrom = format(subWeeks(now, 1), 'yyyy-MM-dd');
  if (period === 'monthly') dateFrom = format(subMonths(now, 1), 'yyyy-MM-dd');
  return {
    dateFrom,
    dateTo: format(endOfDay(now), 'yyyy-MM-dd'),
    period,
    person: '',
    lotNumber: '',
    isoClass: '',
    location: '',
    personnelType: '',
  };
}

export function formatDate(ts: string) {
  return format(new Date(ts), 'MMM dd, yyyy HH:mm');
}

export function formatDateShort(ts: string) {
  return format(new Date(ts), 'MMM dd, yyyy');
}

export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function hitColor(value: 0 | 1) {
  return value === 1
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

export function isoColor(iso: string) {
  return iso === 'ISO 5' ? '#22d3ee' : '#f59e0b';
}

export function alertColor(level: string) {
  if (level === 'Action') return 'text-red-600 dark:text-red-400 font-bold';
  if (level === 'Alert')  return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-green-600 dark:text-green-400';
}

export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function truncate(str: string, max = 24) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function roleBadgeClass(role: string) {
  if (role === 'admin')   return 'badge-admin';
  if (role === 'manager') return 'badge-manager';
  return 'badge-user';
}

export const CHART_COLORS = {
  primary:  '#6366f1',
  iso5:     '#22d3ee',
  iso7:     '#f59e0b',
  success:  '#10b981',
  danger:   '#ef4444',
  warning:  '#f59e0b',
  purple:   '#a855f7',
  pink:     '#ec4899',
  gradient: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'],
};
