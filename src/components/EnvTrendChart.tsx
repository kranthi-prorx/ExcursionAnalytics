// ─── Environmental monitoring trend charts ────────────────────────────────────
// <EnvTrendChart>   one Recharts line chart (multi-series, threshold lines)
// <RoomTrendCharts> one section per room (config rooms always shown, even with
//                   no data), each holding one or more <EnvTrendChart>s.
import { Fragment } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import type { EnvAnalyticsTrendPoint, EnvISOClass } from '../types';
import {
  normalizeRoom, orderRooms, configuredIsoClasses,
} from '../lib/roomConfig';
import {
  ISO_CLASSES, thresholdsFor, type ThresholdSet,
} from '../lib/envThresholds';

// Status colors for chart dots
const STATUS_DOT: Record<string, string> = {
  ACTION: '#ef4444',
  ALERT:  '#f59e0b',
  NORMAL: '#22c55e',
};

// Series line colors (one per location / location+ISO pair)
const SERIES_COLORS = [
  '#6366f1', '#0ea5e9', '#8b5cf6', '#06b6d4', '#3b82f6', '#a855f7', '#14b8a6',
];

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function isoClassesIn(points: EnvAnalyticsTrendPoint[]): EnvISOClass[] {
  const present = new Set(points.map(p => p.iso_class));
  return ISO_CLASSES.filter(c => present.has(c));
}

// pg returns NUMERIC columns (particle counts) as strings — coerce for Recharts
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Single chart ─────────────────────────────────────────────────────────────
interface EnvTrendChartProps {
  title: string;
  points: EnvAnalyticsTrendPoint[];
  yKey: keyof EnvAnalyticsTrendPoint;
  thresholds: ThresholdSet[];
  unit: string;
  onDotClick: (p: EnvAnalyticsTrendPoint) => void;
}

export function EnvTrendChart({ title, points, yKey, thresholds, unit, onDotClick }: EnvTrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-surface-100 dark:border-surface-700 p-4">
        <p className="text-xs font-semibold text-surface-500 mb-2">{title}</p>
        <p className="text-sm text-surface-400 italic">No samples recorded yet</p>
      </div>
    );
  }

  // One series per location; when a room mixes ISO classes (e.g. 105A: ISO 5 + ISO 7)
  // each location/ISO-class pair becomes its own line.
  const multiIsoData = isoClassesIn(points).length > 1;
  const seriesOf = (p: EnvAnalyticsTrendPoint) => {
    const loc = (p as any).location_code || (p as any).sample_location || 'sample';
    return multiIsoData ? `${loc} (${p.iso_class})` : loc;
  };
  const series  = Array.from(new Set(points.map(seriesOf))).sort(naturalCompare);
  const allDates = Array.from(new Set(points.map(p => p.date))).sort();
  const labelThresholds = thresholds.length > 1;

  // One row per date, one key per series
  const chartData = allDates.map(date => {
    const row: Record<string, unknown> = { date };
    series.forEach(name => {
      const match = points.find(p => p.date === date && seriesOf(p) === name);
      row[name] = match ? toNumber((match as any)[yKey]) : null;
      row[`${name}_status`] = match?.status ?? null;
      row[`${name}_pt`] = match ?? null;
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
          {thresholds.map(t => (
            <Fragment key={t.iso}>
              {t.alert !== null && (
                <ReferenceLine y={t.alert} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: labelThresholds ? `${t.iso} Alert` : 'Alert', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
              )}
              <ReferenceLine y={t.action} stroke="#ef4444" strokeDasharray="4 4"
                label={{ value: labelThresholds ? `${t.iso} Action` : 'Action', position: 'right', fontSize: 10, fill: '#ef4444' }} />
            </Fragment>
          ))}
          {series.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              connectNulls={false}
              dot={(props: any) => {
                if (props.payload[name] === null || props.payload[name] === undefined) return <g key={props.key} />;
                const color = STATUS_DOT[props.payload[`${name}_status`]] ?? SERIES_COLORS[i % SERIES_COLORS.length];
                return (
                  <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill={color}
                    stroke="white" strokeWidth={1.5} style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const pt = props.payload[`${name}_pt`] as EnvAnalyticsTrendPoint | null;
                      if (pt) onDotClick(pt);
                    }} />
                );
              }}
              activeDot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Per-room sections ────────────────────────────────────────────────────────
export interface RoomChartSpec {
  /** Chart title shown inside the card, e.g. "Viable Air (CFU)" */
  title: string;
  yKey: keyof EnvAnalyticsTrendPoint;
  unit: string;
  /** Threshold table for this measurement (viable / surface / particle) */
  table: Parameters<typeof thresholdsFor>[0];
  /** Keep only points that have a value for this chart (e.g. 0.5 µm present) */
  filterPoint?: (p: EnvAnalyticsTrendPoint) => boolean;
  /** Re-map a point before plotting (e.g. pick the 0.5 µm status) */
  mapPoint?: (p: EnvAnalyticsTrendPoint) => EnvAnalyticsTrendPoint;
}

interface RoomTrendChartsProps {
  /** All trend points for the active tab */
  points: EnvAnalyticsTrendPoint[];
  /** One spec = one chart per room; two specs = side-by-side charts per room */
  charts: RoomChartSpec[];
  onDotClick: (p: EnvAnalyticsTrendPoint) => void;
}

export function RoomTrendCharts({ points, charts, onDotClick }: RoomTrendChartsProps) {
  const byRoom = new Map<string, EnvAnalyticsTrendPoint[]>();
  points.forEach(p => {
    const room = normalizeRoom((p as any).room_or_area);
    byRoom.set(room, [...(byRoom.get(room) ?? []), p]);
  });
  const rooms = orderRooms(Array.from(byRoom.keys()));

  return (
    <div className="space-y-6">
      {rooms.map(room => {
        const roomPoints = byRoom.get(room) ?? [];
        // Threshold lines cover the room's configured ISO classes plus any seen in data
        const isos = ISO_CLASSES.filter(
          c => configuredIsoClasses(room).includes(c) || roomPoints.some(p => p.iso_class === c),
        );
        return (
          <section key={room} className="space-y-3" aria-label={`Room ${room}`}>
            <h3 className="text-sm font-bold text-surface-700 dark:text-surface-300 pb-1 border-b border-surface-100 dark:border-surface-800">
              {room === 'Unassigned Room' ? room : `Room ${room}`}
              {isos.length > 0 && <span className="ml-2 font-medium text-surface-400">{isos.join(' / ')}</span>}
            </h3>
            <div className={charts.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
              {charts.map(spec => {
                const pts = roomPoints
                  .filter(spec.filterPoint ?? (() => true))
                  .map(spec.mapPoint ?? (p => p));
                return (
                  <EnvTrendChart
                    key={spec.title}
                    title={spec.title}
                    points={pts}
                    yKey={spec.yKey}
                    unit={spec.unit}
                    thresholds={thresholdsFor(spec.table, isos)}
                    onDotClick={onDotClick}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
