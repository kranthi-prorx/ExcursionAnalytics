import type { KPISummary } from '../types';
import { Activity, AlertTriangle, Users, Package, Shield, TrendingUp, BarChart2, Zap } from 'lucide-react';
import { clsx } from '../lib/utils';

interface Props {
  data: KPISummary | null;
  loading?: boolean;
  onCardClick?: (type: string) => void;
}

function KPICard({
  label, value, sub, icon: Icon, color, onClick, loading
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; onClick?: () => void; loading?: boolean;
}) {
  return (
    <div className="kpi-card group" onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="flex items-center justify-between">
        <span className="kpi-label">{label}</span>
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110', color)}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 bg-surface-100 dark:bg-surface-700 rounded-lg animate-pulse w-20" />
      ) : (
        <div className="kpi-value">{value}</div>
      )}
      {sub && !loading && (
        <p className="text-xs text-surface-500 dark:text-surface-400">{sub}</p>
      )}
    </div>
  );
}

export default function KPICards({ data, loading, onCardClick }: Props) {
  const cards = [
    {
      key: 'total_hits',
      label: 'Total Hits',
      value: data?.total_hits ?? 0,
      sub: `${data?.total_records ?? 0} records`,
      icon: Activity,
      color: 'bg-brand-500',
    },
    {
      key: 'iso5',
      label: 'ISO 5 Hits',
      value: data?.iso5_hits ?? 0,
      sub: data ? `${Math.round((data.iso5_hits / Math.max(data.total_hits, 1)) * 100)}% of total` : '-',
      icon: Shield,
      color: 'bg-cyan-500',
    },
    {
      key: 'iso7',
      label: 'ISO 7 Hits',
      value: data?.iso7_hits ?? 0,
      sub: data ? `${Math.round((data.iso7_hits / Math.max(data.total_hits, 1)) * 100)}% of total` : '-',
      icon: BarChart2,
      color: 'bg-amber-500',
    },
    {
      key: 'persons',
      label: 'Unique Personnel',
      value: data?.unique_persons ?? 0,
      sub: 'individuals tracked',
      icon: Users,
      color: 'bg-emerald-500',
    },
    {
      key: 'lots',
      label: 'Unique Lots',
      value: data?.unique_lots ?? 0,
      sub: 'lot numbers',
      icon: Package,
      color: 'bg-purple-500',
    },
    {
      key: 'alerts',
      label: 'Alert Events',
      value: data?.alert_count ?? 0,
      sub: 'requires attention',
      icon: AlertTriangle,
      color: 'bg-orange-500',
    },
    {
      key: 'actions',
      label: 'Action Events',
      value: data?.action_count ?? 0,
      sub: 'critical level',
      icon: Zap,
      color: 'bg-red-500',
    },
    {
      key: 'avg',
      label: 'Avg Hits / Person',
      value: data && data.unique_persons > 0
        ? (data.total_hits / data.unique_persons).toFixed(1)
        : '0',
      sub: 'per individual',
      icon: TrendingUp,
      color: 'bg-indigo-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(c => (
        <KPICard
          key={c.key}
          label={c.label}
          value={c.value}
          sub={c.sub}
          icon={c.icon}
          color={c.color}
          onClick={onCardClick ? () => onCardClick(c.key) : undefined}
          loading={loading}
        />
      ))}
    </div>
  );
}
