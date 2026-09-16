import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Wind, FlaskConical, MapPin, RefreshCw, Download,
  Filter, AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { clsx } from '../lib/utils';
import { envAnalyticsAPI } from '../lib/api';
import type {
  EnvKPISummary, EnvAnalyticsTrendPoint, EnvFilterState,
  EnvISOClass, MonitoringContext, EnvSampleType,
  MONITORING_CONTEXT_LABELS,
} from '../types';
import { MONITORING_CONTEXT_LABELS as CTX_LABELS } from '../types';
import EnvDrillDownDrawer from '../components/EnvDrillDownDrawer';

// Threshold values for chart reference lines (mirrors cfuConfig/thresholds)
const VIABLE_THRESHOLDS: Record<EnvISOClass, { alert: number | null; action: number }> = {
  'ISO 5': { alert: null, action: 1   },
  'ISO 7': { alert: 5,    action: 10  },
  'ISO 8': { alert: 50,   action: 100 },
};
const SURFACE_THRESHOLDS: Record<EnvISOClass, { alert: number | null; action: number }> = {
  'ISO 5': { alert: null, action: 1  },
  'ISO 7': { alert: 3,    action: 5  },
  'ISO 8': { alert: 25,   action: 50 },
};
const PARTICLE_0_5: Record<EnvISOClass, { alert: number; action: number }> = {
  'ISO 5': { alert: 3_000,       action: 3_520       },
  'ISO 7': { alert: 300_000,     action: 352_000     },
  'ISO 8': { alert: 3_000_000,   action: 3_520_000   },
};
const PARTICLE_5_0: Record<EnvISOClass, { alert: number; action: number }> = {
  'ISO 5': { alert: 20,    action: 29    },
  'ISO 7': { alert: 2_000, action: 2_930 },
  'ISO 8': { alert: 20_000, action: 29_300 },
};

const ISO_CLASSES: EnvISOClass[] = ['ISO 5', 'ISO 7', 'ISO 8'];

// Status colors for chart dots
const STATUS_DOT: Record<string, string> = {
  ACTION: '#ef4444',
  ALERT:  '#f59e0b',
  NORMAL: '#22c55e',
};

// Multi-color series for location tracking
const SERIES_COLORS = [
  '#6366f1','#0ea5e9','#8b5cf6','#06b6d4','#3b82f6','#a855f7','#14b8a6',
];

type TabId = 'viable' | 'nonviable' | 'surface';
const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'viable',    label: 'Viable Air',     icon: FlaskConical },
  { id: 'nonviable', label: 'Non-Viable Air', icon: Wind },
  { id: 'surface',   label: 'Surface',        icon: MapPin },
];

const EMPTY_FILTERS: EnvFilterState = {
  dateFrom: '', dateTo: '', context: '', isoClass: '',
  sampleType: '', locationProfileId: '', roomOrArea: '',
  batchId: '', completionStatus: '', resultStatus: '', createdBy: '', lotNumber: '',
};

function KPICard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">{label}</p>
      <p className={clsx('text-2xl font-bold mt-1', color ?? 'text-surface-900 dark:text-white')}>{value}</p>
      {sub && <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// Custom dot renderer for Recharts — colors by status
function StatusDot(props: any) {
  const { cx, cy, payload } = props;
  const color = STATUS_DOT[payload.status] ?? '#94a3b8';
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />;
}

function TrendChart({
  title, points, yKey, thresholds, unit, onDotClick, colorKey = 'location_code',
}: {
  title: string;
  points: EnvAnalyticsTrendPoint[];
  yKey: keyof EnvAnalyticsTrendPoint;
  thresholds: { alert: number | null; action: number };
  unit: string;
  onDotClick: (p: EnvAnalyticsTrendPoint) => void;
  colorKey?: string;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-surface-100 dark:border-surface-700 p-4">
        <p className="text-xs font-semibold text-surface-500 mb-2">{title}</p>
        <p className="text-sm text-surface-400 italic">No data</p>
      </div>
    );
  }

  // Group by location for multi-series
  const locations = Array.from(new Set(points.map(p => (p as any)[colorKey] || (p as any).sample_location || 'sample')));
  const allDates  = Array.from(new Set(points.map(p => p.date))).sort();

  // Build chart data: one row per date, one key per location
  const chartData = allDates.map(date => {
    const row: any = { date };
    locations.forEach(loc => {
      const match = points.find(p => p.date === date && ((p as any)[colorKey] || (p as any).sample_location || 'sample') === loc);
      row[loc] = match ? (match as any)[yKey] : null;
      row[`${loc}_status`] = match?.status ?? null;
      row[`${loc}_pt`] = match ?? null;
    });
    return row;
  });

  return (
    <div className="rounded-xl border border-surface-100 dark:border-surface-700 p-4 space-y-3">
      <p className="text-xs font-semibold text-surface-700 dark:text-surface-300">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit={unit.length <= 3 ? unit : ''} width={50} />
          <Tooltip
            formatter={(v, name) => [v === null ? 'Not collected' : `${Number(v).toLocaleString()} ${unit}`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {thresholds.alert !== null && (
            <ReferenceLine y={thresholds.alert} stroke="#f59e0b" strokeDasharray="4 4"
              label={{ value: 'Alert', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
          )}
          <ReferenceLine y={thresholds.action} stroke="#ef4444" strokeDasharray="4 4"
            label={{ value: 'Action', position: 'right', fontSize: 10, fill: '#ef4444' }} />
          {locations.map((loc, i) => (
            <Line
              key={loc}
              type="monotone"
              dataKey={loc}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              connectNulls={false}
              dot={(props: any) => {
                if (props.payload[loc] === null || props.payload[loc] === undefined) return <g key={props.key} />;
                const status = props.payload[`${loc}_status`];
                const color = STATUS_DOT[status] ?? SERIES_COLORS[i % SERIES_COLORS.length];
                return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill={color} stroke="white" strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const pt = props.payload[`${loc}_pt`];
                    if (pt) onDotClick(pt);
                  }} />;
              }}
              activeDot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Map active tab → backend tab_type param sent to KPI endpoint
const TAB_SAMPLE_TYPE: Record<TabId, string> = {
  viable:    'VIABLE_AIR',
  nonviable: 'NONVIABLE_AIR',
  surface:   'SURFACE',
};

export default function EnvAnalyticsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('viable');
  const [filters, setFilters]     = useState<EnvFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // KPI is separate from chart data so we can clear it immediately on tab switch
  const [kpi, setKpi]               = useState<EnvKPISummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [viableData, setViableData] = useState<EnvAnalyticsTrendPoint[]>([]);
  const [nonviableData, setNV]      = useState<EnvAnalyticsTrendPoint[]>([]);
  const [surfaceData, setSurface]   = useState<EnvAnalyticsTrendPoint[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [drillDownPoint, setDrillDownPoint] = useState<{ sampleId: string; sampleType: string } | null>(null);

  // Build flat params for filters, stripping empty strings
  const buildEnvParams = useCallback((extra: Record<string, string> = {}) => {
    const p: Record<string, string> = { ...extra };
    if (filters.dateFrom)          p.date_from            = filters.dateFrom;
    if (filters.dateTo)            p.date_to              = filters.dateTo;
    if (filters.context)           p.context              = filters.context;
    if (filters.isoClass)          p.iso_class            = filters.isoClass;
    if (filters.roomOrArea)        p.room_or_area         = filters.roomOrArea;
    if (filters.batchId)           p.batch_id             = filters.batchId;
    if (filters.lotNumber)         p.lot_number           = filters.lotNumber;
    if (filters.createdBy)         p.created_by           = filters.createdBy;
    if (filters.locationProfileId) p.location_profile_id  = filters.locationProfileId;
    if (filters.resultStatus)      p.status               = filters.resultStatus;
    return p;
  }, [filters]);

  // Load KPI for the active tab only
  const loadKpi = useCallback(async (tab: TabId) => {
    setKpiLoading(true);
    setKpi(null); // clear immediately — never show stale tab's values
    try {
      const res = await envAnalyticsAPI.kpi({ ...filters, tab_type: TAB_SAMPLE_TYPE[tab] });
      setKpi(res.data);
    } catch {
      setKpi({ total_sessions: 0, complete_sessions: 0, incomplete_sessions: 0,
               total_samples: 0, alert_count: 0, action_count: 0,
               viable_air_count: 0, nonviable_air_count: 0, surface_count: 0 });
    } finally {
      setKpiLoading(false);
    }
  }, [filters]);

  // Load trend data for the active tab only — other tabs lazy-load when clicked
  const loadTrends = useCallback(async (tab: TabId) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'viable') {
        const res = await envAnalyticsAPI.viableAirTrend(filters);
        setViableData(res.data);
      } else if (tab === 'nonviable') {
        const res = await envAnalyticsAPI.nonviableAirTrend(filters);
        setNV(res.data);
      } else if (tab === 'surface') {
        const res = await envAnalyticsAPI.surfaceTrend(filters);
        setSurface(res.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // On mount and whenever filters or activeTab change: re-fetch KPI + relevant trend
  useEffect(() => {
    loadKpi(activeTab);
    loadTrends(activeTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab]);

  const handleTabSwitch = (tab: TabId) => {
    setKpi(null); // instant clear — prevents stale KPI flash
    setActiveTab(tab);
  };

  const handleRefresh = () => {
    loadKpi(activeTab);
    loadTrends(activeTab);
  };

  const handleExport = () => {
    // Export respects the active tab — sends sample_type for current tab
    const tabSampleType = TAB_SAMPLE_TYPE[activeTab];
    const params = new URLSearchParams();
    const p = buildEnvParams({ sample_type: tabSampleType });
    Object.entries(p).forEach(([k, v]) => { if (v) params.set(k, v); });
    const token = localStorage.getItem('eha_token') || '';
    if (token) params.set('_token', token);
    const base = import.meta.env.VITE_API_URL || '';
    window.open(`${base}/api/env/analytics/export/csv?${params.toString()}`, '_blank');
  };

  const handleDotClick = (pt: EnvAnalyticsTrendPoint) => {
    // Use the real DB primary key (sample_id) — never the synthetic session_group_key
    setDrillDownPoint({ sampleId: pt.sample_id, sampleType: pt.sample_type ?? '' });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <Activity size={22} className="text-brand-500" />
            Environmental Monitoring Analytics
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Trend analysis for viable air, non-viable air, and surface monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={handleRefresh} className="btn-ghost p-2 rounded-xl" title="Refresh">
            <RefreshCw size={16} className={(loading || kpiLoading) ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards — scoped to active tab */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiLoading || !kpi ? (
          // Skeleton placeholders — never show stale tab values
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-3 bg-surface-200 dark:bg-surface-700 rounded w-3/4 mb-3" />
              <div className="h-7 bg-surface-200 dark:bg-surface-700 rounded w-1/2" />
            </div>
          ))
        ) : (
          <>
            <KPICard label="Total Sessions" value={kpi.total_sessions} />
            <KPICard label="Complete"       value={kpi.complete_sessions}   color="text-green-600 dark:text-green-400" />
            <KPICard label="Incomplete"     value={kpi.incomplete_sessions} color="text-amber-600 dark:text-amber-400" />
            <KPICard label="Alert Samples"  value={kpi.alert_count}   color="text-amber-600 dark:text-amber-400" />
            <KPICard label="Action Samples" value={kpi.action_count}  color="text-red-600 dark:text-red-400" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(f => !f)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
        >
          <span className="flex items-center gap-2"><Filter size={14} /> Filters</span>
          {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {filtersOpen && (
          <div className="border-t border-surface-100 dark:border-surface-800 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs" htmlFor="f_date_from">Date From</label>
              <input id="f_date_from" type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="f_date_to">Date To</label>
              <input id="f_date_to" type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label text-xs">Context</label>
              <select value={filters.context}
                onChange={e => setFilters(f => ({ ...f, context: e.target.value as any }))} className="select">
                <option value="">All Contexts</option>
                <option value="BATCH">Batch</option>
                <option value="ROUTINE_MONTHLY">Routine Monthly</option>
                <option value="ROUTINE_WEEKLY">Routine Weekly</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">ISO Class</label>
              <select value={filters.isoClass}
                onChange={e => setFilters(f => ({ ...f, isoClass: e.target.value as any }))} className="select">
                <option value="">All ISO Classes</option>
                <option value="ISO 5">ISO 5</option>
                <option value="ISO 7">ISO 7</option>
                <option value="ISO 8">ISO 8</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Completion</label>
              <select value={filters.completionStatus}
                onChange={e => setFilters(f => ({ ...f, completionStatus: e.target.value as any }))} className="select">
                <option value="">All</option>
                <option value="COMPLETE">Complete</option>
                <option value="INCOMPLETE">Incomplete</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Result Status</label>
              <select value={filters.resultStatus}
                onChange={e => setFilters(f => ({ ...f, resultStatus: e.target.value as any }))} className="select">
                <option value="">All</option>
                <option value="NORMAL">Normal</option>
                <option value="ALERT">Alert</option>
                <option value="ACTION">Action</option>
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="f_lot">Lot Number</label>
              <input id="f_lot" type="text" value={filters.lotNumber}
                onChange={e => setFilters(f => ({ ...f, lotNumber: e.target.value }))}
                placeholder="Search lot…" className="input" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="f_room">Room / Area</label>
              <input id="f_room" type="text" value={filters.roomOrArea}
                onChange={e => setFilters(f => ({ ...f, roomOrArea: e.target.value }))}
                placeholder="Search room/area…" className="input" />
            </div>
            <div className="sm:col-span-2 md:col-span-3 flex justify-end gap-2">
              <button type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="btn-ghost text-xs">
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-200 dark:border-surface-800">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
              )}>
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      )}

      {/* ── VIABLE AIR TAB ── */}
      {!loading && activeTab === 'viable' && (
        <div className="space-y-4">
          {ISO_CLASSES.map(iso => {
            const pts = viableData.filter(p => p.iso_class === iso);
            return (
              <TrendChart
                key={iso}
                title={`${iso} — Viable Air (CFU)`}
                points={pts}
                yKey="viable_cfu"
                thresholds={VIABLE_THRESHOLDS[iso]}
                unit="CFU"
                onDotClick={handleDotClick}
              />
            );
          })}
          {viableData.length === 0 && (
            <p className="text-center text-sm text-surface-400 dark:text-surface-500 py-8 italic">No viable air data for the selected filters.</p>
          )}
        </div>
      )}

      {/* ── NONVIABLE AIR TAB ── */}
      {!loading && activeTab === 'nonviable' && (
        <div className="space-y-6">
          {ISO_CLASSES.map(iso => {
            const pts = nonviableData.filter(p => p.iso_class === iso);
            const pts05 = pts.filter(p => p.particle_count_0_5 !== null && p.particle_count_0_5 !== undefined);
            const pts50 = pts.filter(p => p.particle_count_5_0 !== null && p.particle_count_5_0 !== undefined);
            return (
              <div key={iso} className="space-y-3">
                <h3 className="text-sm font-bold text-surface-700 dark:text-surface-300 pb-1 border-b border-surface-100 dark:border-surface-800">
                  {iso} — Non-Viable Air
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TrendChart
                    title="0.5 µm Particles (p/m³)"
                    points={pts05.map(p => ({ ...p, status: p.status_0_5 }))}
                    yKey="particle_count_0_5"
                    thresholds={PARTICLE_0_5[iso]}
                    unit="p/m³"
                    onDotClick={handleDotClick}
                  />
                  <TrendChart
                    title="5.0 µm Particles (p/m³)"
                    points={pts50.map(p => ({ ...p, status: p.status_5_0 }))}
                    yKey="particle_count_5_0"
                    thresholds={PARTICLE_5_0[iso]}
                    unit="p/m³"
                    onDotClick={handleDotClick}
                  />
                </div>
              </div>
            );
          })}
          {nonviableData.length === 0 && (
            <p className="text-center text-sm text-surface-400 dark:text-surface-500 py-8 italic">No non-viable air data for the selected filters.</p>
          )}
        </div>
      )}

      {/* ── SURFACE TAB ── */}
      {!loading && activeTab === 'surface' && (
        <div className="space-y-4">
          {ISO_CLASSES.map(iso => {
            const pts = surfaceData.filter(p => p.iso_class === iso);
            return (
              <TrendChart
                key={iso}
                title={`${iso} — Surface (CFU)`}
                points={pts}
                yKey="surface_cfu"
                thresholds={SURFACE_THRESHOLDS[iso]}
                unit="CFU"
                onDotClick={handleDotClick}
              />
            );
          })}
          {surfaceData.length === 0 && (
            <p className="text-center text-sm text-surface-400 dark:text-surface-500 py-8 italic">No surface data for the selected filters.</p>
          )}
        </div>
      )}

      {/* Drill-down drawer */}
      <EnvDrillDownDrawer
        sampleId={drillDownPoint?.sampleId ?? null}
        sampleType={drillDownPoint?.sampleType ?? null}
        onClose={() => setDrillDownPoint(null)}
      />
    </div>
  );
}
