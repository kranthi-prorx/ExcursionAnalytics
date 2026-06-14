import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Sector
} from 'recharts';
import { useState } from 'react';
import type { TrendData, PersonHits, LocationHits } from '../types';
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

// ─── Trends Line Chart ────────────────────────────────────────────────────────
export function TrendsChart({ data, onBarClick }: { data: TrendData[]; onBarClick?: (d: TrendData) => void }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload)}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="hits" stroke={CHART_COLORS.primary} strokeWidth={2.5}
          dot={{ r: 3, fill: CHART_COLORS.primary }} activeDot={{ r: 6, strokeWidth: 0 }} name="Total Hits" />
        <Line type="monotone" dataKey="iso5" stroke={CHART_COLORS.iso5} strokeWidth={2}
          dot={{ r: 2 }} name="ISO 5" strokeDasharray="4 2" />
        <Line type="monotone" dataKey="iso7" stroke={CHART_COLORS.iso7} strokeWidth={2}
          dot={{ r: 2 }} name="ISO 7" strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}


// ─── Person Bar Chart ─────────────────────────────────────────────────────────
export function PersonChart({ data, onBarClick }: { data: PersonHits[]; onBarClick?: (d: PersonHits) => void }) {
  // Each row 28px; container caps at 280px and scrolls beyond
  const chartHeight = Math.max(200, data.length * 28);

  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }} className="scrollbar-thin pr-1">
      <div style={{ height: chartHeight }}>
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


// ─── Location Bar Chart ───────────────────────────────────────────────────────
export function LocationChart({ data, onBarClick }: { data: LocationHits[]; onBarClick?: (d: LocationHits) => void }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}
        onClick={d => d?.activePayload?.[0] && onBarClick?.(d.activePayload[0].payload)}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="location" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="hits" name="Hits" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS.gradient[i % CHART_COLORS.gradient.length]} />
          ))}
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
    <ResponsiveContainer width="100%" height={240}>
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

// ─── Heatmap ──────────────────────────────────────────────────────────────────
export function HeatmapChart({ data }: { data: LocationHits[] }) {
  const max = Math.max(...data.map(d => d.hits), 1);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-2">
      {data.map(d => {
        const intensity = d.hits / max;
        const bg = `rgba(99,102,241,${0.1 + intensity * 0.9})`;
        return (
          <div
            key={d.location}
            className="rounded-xl p-3 flex flex-col items-center gap-1 transition-all duration-300 hover:scale-105 cursor-default"
            style={{ background: bg }}
          >
            <span className="text-[11px] font-semibold text-center leading-tight text-surface-700 dark:text-surface-200">
              {d.location}
            </span>
            <span className="text-xl font-bold text-white">{d.hits}</span>
            <span className="text-[10px] text-white/70">{d.percentage.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lot Bar Chart ────────────────────────────────────────────────────────────
export function LotChart({ data, onBarClick }: { data: { lot_number: string; hits: number }[]; onBarClick?: (lot: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
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
    <ResponsiveContainer width="100%" height={260}>
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

// ─── Viable CFU by Lot (line: ISO5 + ISO7) ───────────────────────────────────
export interface ViableByLotData {
  lot_number: string; iso5_total: number; iso7_total: number;
  avg_05um: number; avg_50um: number;
}

export function ViableCFUChart({ data, onBarClick }: { data: ViableByLotData[]; onBarClick?: (lot: string) => void }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-surface-400 text-sm">No data yet</div>
  );
  return (
    <ResponsiveContainer width="100%" height={260}>
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
    <ResponsiveContainer width="100%" height={260}>
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
