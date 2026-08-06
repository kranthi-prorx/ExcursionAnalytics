import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Sector,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { useState, useMemo } from 'react';
import type { TrendData, PersonHits, LocationHits, BatchTotal } from '../types';
import { CHART_COLORS } from '../lib/utils';

// Palette for per-lot lines (cycles if there are more lots than colors)
const LOT_COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ec4899',
  '#f43f5e', '#a855f7', '#14b8a6', '#f97316', '#84cc16',
];


// ─── Shared Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl p-3 shadow-xl border border-surface-100 dark:border-surface-700 text-xs">
      {label && <p className="font-semibold text-surface-700 dark:text-surface-200 mb-1.5">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-surface-500 dark:text-surface-400 capitalize">{p.name}:</span>
          <span className="font-bold text-surface-800 dark:text-surface-100">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Trends Line Chart (Average Hits per Processed Batch) ─────────────────────
export function TrendsChart({ data, onBarClick }: { data: TrendData[]; onBarClick?: (d: TrendData) => void }) {
  // Show average_hits_per_batch as main line; fall back to total hits if no batch data
  const hasBatchData = data.some(d => (d.processed_batch_count ?? 0) > 0);

  // Determine if ISO series have data (when filtered, one series may be all zeros)
  const hasISO5 = data.some(d => (d.iso5 ?? 0) > 0);
  const hasISO7 = data.some(d => (d.iso7 ?? 0) > 0);

  // Enhanced tooltip with batch calculation breakdown
  const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-white dark:bg-surface-800 rounded-xl p-3 shadow-xl border border-surface-100 dark:border-surface-700 text-xs max-w-56">
        {label && <p className="font-semibold text-surface-700 dark:text-surface-200 mb-1.5">{label}</p>}
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-surface-500 dark:text-surface-400 capitalize">{p.name}:</span>
            <span className="font-bold text-surface-800 dark:text-surface-100">{p.value}</span>
          </div>
        ))}
        {d?.processed_batch_count > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-surface-100 dark:border-surface-700 text-surface-400 dark:text-surface-500">
            <span>{d.hits} hits ÷ {d.processed_batch_count} batches = <strong className="text-surface-600 dark:text-surface-300">{d.average_hits_per_batch}</strong> avg</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload)}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<TrendTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {hasBatchData && (
          <Line type="monotone" dataKey="average_hits_per_batch" stroke={CHART_COLORS.avgBatch} strokeWidth={2.5}
            dot={{ r: 3, fill: CHART_COLORS.avgBatch }} activeDot={{ r: 6, strokeWidth: 0 }} name="Avg Hits/Batch" />
        )}
        <Line type="monotone" dataKey="hits" stroke={CHART_COLORS.primary} strokeWidth={hasBatchData ? 1.5 : 2.5}
          dot={{ r: hasBatchData ? 2 : 3, fill: CHART_COLORS.primary }} activeDot={{ r: 6, strokeWidth: 0 }}
          name="Total Hits" strokeDasharray={hasBatchData ? '4 2' : undefined} />
        {hasISO5 && (
          <Line type="monotone" dataKey="iso5" stroke={CHART_COLORS.iso5} strokeWidth={1.5}
            dot={{ r: 2 }} name="ISO 5" strokeDasharray="4 2" />
        )}
        {hasISO7 && (
          <Line type="monotone" dataKey="iso7" stroke={CHART_COLORS.iso7} strokeWidth={1.5}
            dot={{ r: 2 }} name="ISO 7" strokeDasharray="4 2" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Batch Scatter Chart (Batch Hit Distribution) ─────────────────────────────
export function BatchScatterChart({ data, onPointClick }: { data: BatchTotal[]; onPointClick?: (d: BatchTotal) => void }) {
  // Generate deterministic jitter for overlapping points
  const scatterData = useMemo(() => {
    // Count occurrences of (date + hits) to apply jitter
    const pointCounts: Record<string, number> = {};
    return data.map(d => {
      const key = `${d.date_of_batch}_${d.batch_hits}`;
      pointCounts[key] = (pointCounts[key] || 0) + 1;
      
      // Simple deterministic pseudo-random based on string hash for jitter
      let hash = 0;
      for (let i = 0; i < d.batch_id.length; i++) hash = ((hash << 5) - hash) + d.batch_id.charCodeAt(i);
      
      // Apply slight jitter (max ±0.2 on a categorical date axis) if there are overlaps
      // But recharts categorical XAxis jitter requires careful handling. We will let Recharts handle standard categorical layout,
      // and use ZAxis for node sizing, or we add slight numerical jitter if we converted dates to timestamps.
      // Since it's categorical XAxis (date string), Recharts naturally centers them. 
      // We will map 'x' to date_of_batch, 'y' to batch_hits.
      return {
        ...d,
        x: d.date_of_batch,
        y: d.batch_hits,
        z: 1 // for dot sizing
      };
    });
  }, [data]);

  const ScatterTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as BatchTotal;
    return (
      <div className="bg-white dark:bg-surface-800 rounded-xl p-3 shadow-xl border border-surface-100 dark:border-surface-700 text-xs">
        <p className="font-semibold text-surface-700 dark:text-surface-200 mb-1.5">{d.batch_number}</p>
        <div className="space-y-1 text-surface-600 dark:text-surface-300">
          <p><span className="text-surface-400">Date of Batch:</span> {d.date_of_batch}</p>
          <p><span className="text-surface-400">ISO Class:</span> {d.iso_class || 'Mixed/None'}</p>
          <p><span className="text-surface-400">Batch Total Hits:</span> <strong className="text-surface-800 dark:text-white">{d.batch_hits}</strong></p>
          <div className="pt-1 mt-1 border-t border-surface-100 dark:border-surface-700">
            <p><span className="text-surface-400">Personnel Records:</span> {d.personnel_record_count}</p>
            <p><span className="text-surface-400">Distinct Personnel:</span> {d.distinct_personnel_count}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }} onClick={(e: any) => e?.activePayload?.[0] && onPointClick?.(e.activePayload[0].payload)}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="x" type="category" allowDuplicatedCategory={true} tick={{ fontSize: 11 }} name="Date of Batch" />
        <YAxis dataKey="y" type="number" tick={{ fontSize: 11 }} name="Batch Hits" />
        <ZAxis dataKey="z" range={[40, 100]} />
        <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter name="Batches" data={scatterData} fill={CHART_COLORS.primary} fillOpacity={0.6} stroke={CHART_COLORS.primary} style={{ cursor: 'pointer' }} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}


// ─── Person Bar Chart (scrollable, unlimited data) ────────────────────────────
export function PersonChart({ data, onBarClick }: { data: PersonHits[]; onBarClick?: (d: PersonHits) => void }) {
  // Fixed outer height; inner content scrolls when data exceeds the container
  const innerHeight = Math.max(240, data.length * 28);

  return (
    <div style={{ height: 280, overflowY: 'auto' }} className="scrollbar-thin pr-1">
      <div style={{ height: innerHeight, minHeight: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
            onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} interval={0} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="iso5" name="ISO 5" fill={CHART_COLORS.iso5} stackId="a" radius={[0, 0, 0, 0]}
              style={{ cursor: 'pointer' }} />
            <Bar dataKey="iso7" name="ISO 7" fill={CHART_COLORS.iso7} stackId="a" radius={[0, 4, 4, 0]}
              style={{ cursor: 'pointer' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


// ─── Location Bar Chart (ISO-labeled display names) ───────────────────────────
export function LocationChart({ data, onBarClick }: { data: LocationHits[]; onBarClick?: (d: LocationHits) => void }) {
  // Use display_label for X-axis if available, otherwise fall back to location
  const chartData = data.map(d => ({
    ...d,
    displayName: d.display_label || d.location,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}
        onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload)}
        margin={{ top: 4, right: 16, bottom: 40, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="displayName" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="hits" name="Hits" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}>
          {chartData.map((d, i) => {
            // Color by ISO class if available
            const fill = d.iso_class === 'ISO 5' ? CHART_COLORS.iso5
                       : d.iso_class === 'ISO 7' ? CHART_COLORS.iso7
                       : CHART_COLORS.gradient[i % CHART_COLORS.gradient.length];
            return <Cell key={i} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── ISO Pie Chart ────────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return percent > 0.05 ? (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  ) : null;
};

export function ISOPieChart({ data, onSliceClick }: {
  data: { iso_class: string; hits: number }[];
  onSliceClick?: (iso: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const colors = [CHART_COLORS.iso5, CHART_COLORS.iso7];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="hits"
          nameKey="iso_class"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          labelLine={false}
          label={renderCustomLabel}
          onMouseEnter={(_, i) => setActiveIdx(i)}
          onMouseLeave={() => setActiveIdx(null)}
          onClick={(d) => onSliceClick?.(d.iso_class)}
          style={{ cursor: 'pointer' }}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={colors[i % colors.length]}
              opacity={activeIdx === null || activeIdx === i ? 1 : 0.6}
              stroke="none"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Heatmap (ISO-labeled locations) ──────────────────────────────────────────
export function HeatmapChart({ data }: { data: LocationHits[] }) {
  const max = Math.max(...data.map(d => d.hits), 1);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-2">
      {data.map(d => {
        const intensity = d.hits / max;
        const bg = `rgba(99,102,241,${0.1 + intensity * 0.9})`;
        const displayName = d.display_label || d.location;
        return (
          <div
            key={displayName}
            className="rounded-xl p-3 flex flex-col items-center gap-1 transition-all duration-300 hover:scale-105 cursor-default"
            style={{ background: bg }}
          >
            <span className="text-[11px] font-semibold text-center leading-tight text-surface-700 dark:text-surface-200">
              {displayName}
            </span>
            <span className="text-xl font-bold text-white">{d.hits}</span>
            <span className="text-[10px] text-white/70">{d.percentage.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lot Bar Chart (scrollable, unlimited data) ───────────────────────────────
export function LotChart({ data, onBarClick }: { data: { lot_number: string; hits: number }[]; onBarClick?: (lot: string) => void }) {
  // Fixed outer height; inner content scrolls when there are many lots
  const innerHeight = Math.max(240, data.length > 10 ? data.length * 22 + 40 : 240);

  return (
    <div style={{ height: 280, overflowY: data.length > 10 ? 'auto' : undefined }} className="scrollbar-thin pr-1">
      <div style={{ height: innerHeight, minHeight: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}
            onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload.lot_number)}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="lot_number" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="hits" name="Hits" fill={CHART_COLORS.purple} radius={[6, 6, 0, 0]}
              style={{ cursor: 'pointer' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Hits per Lot Over Time ───────────────────────────────────────────────────
// Accepts raw rows of { date, lot_number, hits } and pivots them so each
// date becomes one object with a key per lot_number.
export function LotTrendsChart({
  data,
  onPointClick,
}: {
  data: { date: string; lot_number: string; hits: number }[];
  onPointClick?: (date: string, lot: string) => void;
}) {
  // Collect unique lots and dates
  const lots = [...new Set(data.map(d => d.lot_number))].sort();
  const dateMap = new Map<string, Record<string, string | number>>();
  for (const row of data) {
    if (!dateMap.has(row.date)) dateMap.set(row.date, { date: row.date });
    dateMap.get(row.date)![row.lot_number] = row.hits;
  }
  const chartData = [...dateMap.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  if (!chartData.length) {
    return <p className="text-center text-surface-400 py-12 text-sm">No data for selected range</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={chartData}
        onClick={d => {
          if (d?.activePayload?.[0] && onPointClick) {
            onPointClick(d.activePayload[0].payload.date, d.activePayload[0].dataKey as string);
          }
        }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lots.map((lot, i) => (
          <Line
            key={lot}
            type="monotone"
            dataKey={lot}
            name={lot}
            stroke={LOT_COLORS[i % LOT_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Shared: custom X-axis tick that truncates long lot numbers ───────────────
function LotTick({ x, y, payload }: any) {
  const raw: string = payload?.value ?? '';
  const label = raw.length > 13 ? '…' + raw.slice(-12) : raw;
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{raw}</title>
      <text
        x={0} y={0} dy={12}
        textAnchor="end"
        fill="currentColor"
        fontSize={9}
        transform="rotate(-45)"
        className="text-surface-600 dark:text-surface-400"
      >
        {label}
      </text>
    </g>
  );
}

// ─── Viable CFU by Lot (line: ISO5 + ISO7 + ISO8) ────────────────────────────
export interface ViableByLotData {
  lot_number: string; iso5_total: number; iso7_total: number; iso8_total?: number;
  avg_05um: number; avg_50um: number;
}

export function ViableCFUChart({ data, onBarClick }: { data: ViableByLotData[]; onBarClick?: (lot: string) => void }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-surface-400 text-sm">No data yet</div>
  );

  const hasIso8 = data.some(d => (d.iso8_total ?? 0) > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 80 }}
        style={onBarClick ? { cursor: 'pointer' } : undefined}
        onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload.lot_number)}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-surface-200 dark:text-surface-700 opacity-40" />
        <XAxis dataKey="lot_number" tick={<LotTick />} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="iso5_total" name="ISO 5 CFU"
          stroke="#6366f1" strokeWidth={2.5}
          dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
          activeDot={{ r: 7, strokeWidth: 0 }}
          connectNulls />
        <Line type="monotone" dataKey="iso7_total" name="ISO 7 CFU"
          stroke="#22d3ee" strokeWidth={2.5}
          dot={{ r: 4, fill: '#22d3ee', strokeWidth: 0 }}
          activeDot={{ r: 7, strokeWidth: 0 }}
          connectNulls />
        {hasIso8 && (
          <Line type="monotone" dataKey="iso8_total" name="ISO 8 CFU"
            stroke="#a855f7" strokeWidth={2.5}
            dot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }}
            activeDot={{ r: 7, strokeWidth: 0 }}
            connectNulls />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Particle Count by Lot (line: 0.5μm + 5.0μm) ─────────────────────────────
export function ParticleCountChart({ data, onBarClick }: { data: ViableByLotData[]; onBarClick?: (lot: string) => void }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-surface-400 text-sm">No data yet</div>
  );
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 80 }}
        style={onBarClick ? { cursor: 'pointer' } : undefined}
        onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload.lot_number)}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-surface-200 dark:text-surface-700 opacity-40" />
        <XAxis dataKey="lot_number" tick={<LotTick />} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="avg_05um" name="0.5 μm (avg p/m³)"
          stroke="#f59e0b" strokeWidth={2.5}
          dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
          activeDot={{ r: 7, strokeWidth: 0 }}
          connectNulls />
        <Line type="monotone" dataKey="avg_50um" name="5.0 μm (avg p/m³)"
          stroke="#10b981" strokeWidth={2.5}
          dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
          activeDot={{ r: 7, strokeWidth: 0 }}
          connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
