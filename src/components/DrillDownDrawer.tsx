import { X, User, Package, Briefcase, MapPin, Shield, Clock, Activity, Calendar, AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { DrillDownData, ExcursionRecord } from '../types';
import { LOCATIONS } from '../types';
import { formatDate, alertColor, clsx } from '../lib/utils';
import { useEffect, useRef, useState } from 'react';
import { getLocationDisplayLabel, getCombinedFingertipStatus, isFingertipLocation } from '../lib/locationHelpers';

const DRAWER_PAGE_SIZE = 20;

interface Props {
  data: DrillDownData | null;
  onClose: () => void;
}

// ─── Personnel Summary (shown at top for date drill-downs) ────────────────────
function PersonnelSummary({ records }: { records: ExcursionRecord[] }) {
  // Group by person
  const byPerson = records.reduce<Record<string, { hits: number; iso: string; records: number }>>((acc, r) => {
    const hits = r.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0;
    if (!acc[r.name]) acc[r.name] = { hits: 0, iso: r.iso_class, records: 0 };
    acc[r.name].hits    += hits;
    acc[r.name].records += 1;
    return acc;
  }, {});

  const sorted = Object.entries(byPerson).sort((a, b) => b[1].hits - a[1].hits);
  const maxHits = Math.max(...sorted.map(([, v]) => v.hits), 1);

  if (sorted.length === 0) return null;

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-surface-100 dark:border-surface-700 overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-2.5 bg-surface-50 dark:bg-surface-800 border-b border-surface-100 dark:border-surface-700 flex items-center gap-2">
        <User size={13} className="text-brand-500" />
        <span className="text-xs font-bold text-surface-600 dark:text-surface-300 uppercase tracking-widest">
          Personnel Hit Breakdown
        </span>
      </div>

      {/* Person rows */}
      <div className="divide-y divide-surface-50 dark:divide-surface-800">
        {sorted.map(([name, stats]) => (
          <div key={name} className="px-4 py-3 bg-white dark:bg-surface-900">
            {/* Name + badges row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{name[0].toUpperCase()}</span>
                </div>
                <span className="font-semibold text-sm text-surface-800 dark:text-surface-100 truncate">{name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={stats.iso === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{stats.iso}</span>
                <span className={clsx('badge', stats.hits > 0 ? 'badge-hit' : 'badge-no-hit')}>
                  {stats.hits} hit{stats.hits !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            {/* Hit bar */}
            <div className="w-full h-1.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-500',
                  stats.hits > 0 ? 'bg-red-400' : 'bg-green-400'
                )}
                style={{ width: `${(stats.hits / maxHits) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-surface-400 mt-1">{stats.records} record{stats.records !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Combined Fingertip Status Banner ─────────────────────────────────────────
function FingertipBanner({ hitDetails }: { hitDetails: Array<{ location: string; hit_value: number; iso_class: string }> }) {
  const results = getCombinedFingertipStatus(hitDetails);
  if (results.length === 0) return null;

  return (
    <>
      {results.map(result => (
        <div key={result.isoClass} className={clsx(
          'rounded-xl p-3 border text-xs',
          result.status === 'exceeded'
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
        )}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">Fingertips — {result.isoClass} (Combined)</span>
            <span className={clsx('badge', result.status === 'exceeded' ? 'badge-hit' : 'badge-no-hit')}>
              {result.status === 'exceeded' ? `⚠ ${result.thresholdLabel}` : 'OK'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>L: {result.leftHits}</span>
            <span>R: {result.rightHits}</span>
            <span className="font-bold">Combined: {result.combinedHits}</span>
            <span className="text-surface-400">({result.thresholdLabel} &gt; {result.actionThreshold})</span>
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Individual Record Card ───────────────────────────────────────────────────
function RecordCard({ rec }: { rec: ExcursionRecord }) {
  const totalHits = rec.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0;
  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{rec.name[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-surface-900 dark:text-white text-sm truncate">{rec.name}</p>
            <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5">
              <Clock size={11} />
              {formatDate(rec.timestamp)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={clsx('badge', rec.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7')}>
            {rec.iso_class}
          </span>
          <span className={clsx('badge', totalHits > 0 ? 'badge-hit' : 'badge-no-hit')}>
            {totalHits} hit{totalHits !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-surface-600 dark:text-surface-400">
          <Package size={12} className="text-brand-500" />
          <span className="font-medium">Lot:</span>
          <span className="font-mono">{rec.lot_number}</span>
        </div>
        <div className="flex items-center gap-1.5 text-surface-600 dark:text-surface-400">
          <Briefcase size={12} className="text-brand-500" />
          <span className="font-medium">Type:</span>
          <span>{rec.personnel_type}</span>
        </div>
        <div className="flex items-center gap-1.5 text-surface-600 dark:text-surface-400">
          <Activity size={12} className="text-amber-500" />
          <span className="font-medium">Alert ≥</span>
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{rec.alert_level}</span>
        </div>
        <div className="flex items-center gap-1.5 text-surface-600 dark:text-surface-400">
          <Shield size={12} className="text-red-500" />
          <span className="font-medium">Action ≥</span>
          <span className="font-mono font-bold text-red-600 dark:text-red-400">{rec.action_level}</span>
        </div>
      </div>

      {/* Job function */}
      <div className="flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400">
        <Briefcase size={12} className="text-brand-500" />
        <span className="font-medium">Job:</span>
        <span>{rec.job_function}</span>
      </div>

      {/* Combined fingertip status (if applicable) */}
      {rec.hit_details && rec.hit_details.length > 0 && (
        <FingertipBanner hitDetails={rec.hit_details} />
      )}

      {/* Hit locations grid — with ISO class labels */}
      {rec.hit_details && rec.hit_details.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 mb-2 flex items-center gap-1">
            <MapPin size={11} />
            LOCATION HITS
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {rec.hit_details.map(h => {
              const hit = (h.hit_value ?? 0) > 0;
              const label = getLocationDisplayLabel(h.location, h.iso_class);
              return (
                <div key={h.location} className={hit ? 'location-hit' : 'location-no-hit'}>
                  <div className="text-[10px] leading-tight font-semibold">{label}</div>
                  <div className="text-base font-bold mt-0.5">{h.hit_value ?? 0}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Drawer Shell ─────────────────────────────────────────────────────────────
export default function DrillDownDrawer({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isDateDrill = data?.label?.startsWith('📅');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Reset pagination when data changes
  useEffect(() => {
    setPage(1);
    setSearch('');
  }, [data]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!data) return null;

  // Filter records by search
  const filteredRecords = data.records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) ||
           r.lot_number.toLowerCase().includes(q) ||
           (r.job_function ?? '').toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filteredRecords.length / DRAWER_PAGE_SIZE);
  const pagedRecords = filteredRecords.slice((page - 1) * DRAWER_PAGE_SIZE, page * DRAWER_PAGE_SIZE);

  const totalHits = data.records.reduce(
    (sum, r) => sum + (r.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0), 0
  );

  return (
    <>
      {/* Overlay */}
      <div className="drawer-overlay animate-fade-in" onClick={onClose} />

      {/* Drawer */}
      <div ref={ref} className="drawer">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-widest mb-0.5">
              Drill-Down Details
            </p>
            <h2 className="text-base font-bold text-surface-900 dark:text-white flex items-center gap-2">
              {data.type === 'person'   && <User     size={16} className="text-brand-500 shrink-0" />}
              {data.type === 'lot'      && <Package  size={16} className="text-brand-500 shrink-0" />}
              {data.type === 'location' && <MapPin   size={16} className="text-brand-500 shrink-0" />}
              {data.type === 'iso'      && <Shield   size={16} className="text-brand-500 shrink-0" />}
              {isDateDrill              && <Calendar size={16} className="text-brand-500 shrink-0" />}
              <span className="truncate">{data.label}</span>
            </h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} &bull; {totalHits} total hit{totalHits !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-xl ml-2 shrink-0" title="Close (Esc)">
            <X size={20} />
          </button>
        </div>

        {/* Search bar (shown when more than 10 records) */}
        {data.records.length > 10 && (
          <div className="px-5 py-2 border-b border-surface-100 dark:border-surface-800">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="search"
                placeholder="Search records…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="input pl-8 !py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* ── Personnel summary for date drill-downs ── */}
          {isDateDrill && data.records.length > 0 && (
            <PersonnelSummary records={data.records} />
          )}

          {/* ── Individual records ── */}
          <div className="p-4 space-y-3">
            {pagedRecords.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <div className="text-4xl">📭</div>
                <p className="text-surface-400 dark:text-surface-600 text-sm">No records for this selection</p>
              </div>
            ) : (
              <>
                {isDateDrill && (
                  <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-widest pb-1">
                    All Records
                  </p>
                )}
                {pagedRecords.map(rec => <RecordCard key={rec.id} rec={rec} />)}
              </>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-surface-100 dark:border-surface-800">
              <p className="text-xs text-surface-500">
                {((page - 1) * DRAWER_PAGE_SIZE) + 1}–{Math.min(page * DRAWER_PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-ghost p-1.5">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-semibold text-surface-600 dark:text-surface-300 px-2">
                  {page} / {totalPages}
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="btn-ghost p-1.5">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
