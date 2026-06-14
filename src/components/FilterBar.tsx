import { Calendar, Filter, X, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { FilterState } from '../types';
import { ISO_CLASSES, LOCATIONS, PERSONNEL_TYPES, PERSONNEL_TYPE_LABELS } from '../types';
import { getDefaultFilters, clsx } from '../lib/utils';
import { analyticsAPI } from '../lib/api';

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  className?: string;
}

const PERIODS = [
  { value: 'daily',   label: 'Today' },
  { value: 'weekly',  label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'custom',  label: 'Custom Range' },
] as const;

export default function FilterBar({ filters, onChange, className }: Props) {
  const [persons, setPersons] = useState<string[]>([]);
  const [lots, setLots] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    analyticsAPI.persons().then(r => setPersons(r.data)).catch(() => {});
    analyticsAPI.lots().then(r => setLots(r.data)).catch(() => {});
  }, []);

  const setPeriod = (p: FilterState['period']) => {
    const defaults = getDefaultFilters(p);
    onChange({ ...defaults, person: filters.person, lotNumber: filters.lotNumber, isoClass: filters.isoClass, location: filters.location, personnelType: filters.personnelType });
  };

  const reset = () => onChange(getDefaultFilters('monthly'));

  const hasActiveFilters = filters.person || filters.lotNumber || filters.isoClass || filters.location || filters.personnelType;

  return (
    <div className={clsx('card p-4 space-y-3', className)}>
      {/* Period tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={15} className="text-surface-400 shrink-0" />
        <div className="flex gap-1 bg-surface-100 dark:bg-surface-800 p-0.5 rounded-xl">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={clsx(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200',
                filters.period === p.value
                  ? 'bg-white dark:bg-surface-700 text-brand-700 dark:text-brand-300 shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400 ml-2">
          <Calendar size={13} />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => onChange({ ...filters, dateFrom: e.target.value, period: 'custom' })}
            className="input !py-1 !px-2 text-xs w-36"
          />
          <span>→</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => onChange({ ...filters, dateTo: e.target.value, period: 'custom' })}
            className="input !py-1 !px-2 text-xs w-36"
          />
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className={clsx('btn-secondary btn-sm ml-auto flex items-center gap-1', hasActiveFilters && '!bg-brand-50 !text-brand-700 dark:!bg-brand-900/30 dark:!text-brand-300')}
        >
          <ChevronDown size={13} className={clsx('transition-transform duration-200', showAdvanced && 'rotate-180')} />
          Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
        </button>

        {/* Reset */}
        <button onClick={reset} className="btn-ghost btn-sm" title="Reset filters">
          <X size={14} />
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-surface-100 dark:border-surface-800 animate-fade-in">
          {/* Person */}
          <div>
            <label className="label">Person</label>
            <select
              value={filters.person}
              onChange={e => onChange({ ...filters, person: e.target.value })}
              className="select"
            >
              <option value="">All People</option>
              {persons.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Lot */}
          <div>
            <label className="label">Lot Number</label>
            <select
              value={filters.lotNumber}
              onChange={e => onChange({ ...filters, lotNumber: e.target.value })}
              className="select"
            >
              <option value="">All Lots</option>
              {lots.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* ISO */}
          <div>
            <label className="label">ISO Class</label>
            <select
              value={filters.isoClass}
              onChange={e => onChange({ ...filters, isoClass: e.target.value })}
              className="select"
            >
              <option value="">All Classes</option>
              {ISO_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Personnel Type */}
          <div>
            <label className="label">Personnel Type</label>
            <select
              value={filters.personnelType}
              onChange={e => onChange({ ...filters, personnelType: e.target.value })}
              className="select"
            >
              <option value="">All Types</option>
              {PERSONNEL_TYPES.map(t => <option key={t} value={t}>{PERSONNEL_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="label">Location</label>
            <select
              value={filters.location}
              onChange={e => onChange({ ...filters, location: e.target.value })}
              className="select"
            >
              <option value="">All Locations</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
