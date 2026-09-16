import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Wind, MapPin, Settings, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const cards = [
  {
    title: 'Viable & Non-Viable Air Monitoring',
    description: 'Record viable air (CFU) and non-viable air (particle counts 0.5 µm / 5.0 µm) for batch, routine monthly, or other monitoring activities.',
    icon: FlaskConical,
    href: '/data-entry/environmental/entry?type=air',
    color: 'bg-brand-500 dark:bg-brand-600',
    badgeColor: 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300',
    badge: 'ISO 5 · ISO 7 · ISO 8',
  },
  {
    title: 'Surface Sampling Entry',
    description: 'Log surface swab and contact plate results per sample point. Record CFU, organism identification, and any deviations.',
    icon: MapPin,
    href: '/data-entry/environmental/entry?type=surface',
    color: 'bg-emerald-500 dark:bg-emerald-600',
    badgeColor: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    badge: 'Batch · Weekly · Other',
  },
];

export default function EnvMonitoringHubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/data-entry')}
          className="btn-ghost p-2 rounded-xl"
          title="Back to Data Entry"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            Environmental Monitoring
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Record air and surface monitoring results for batch, routine, or other activities
          </p>
        </div>
      </div>

      {/* Entry cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.href}
              onClick={() => navigate(card.href)}
              className="card p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${card.color} text-white shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-sm font-bold text-surface-800 dark:text-surface-100 leading-snug">
                      {card.title}
                    </h2>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-2 leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <ChevronRight size={16} className="text-surface-300 dark:text-surface-600 shrink-0 group-hover:text-brand-500 transition-colors mt-1" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Admin: Location Profile Management */}
      {isAdminOrManager && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-500">
                <Settings size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                  Location Profile Management
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Create and manage reusable sample location profiles (admin/manager only)
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/env/location-profiles')}
              className="btn-secondary text-xs shrink-0"
            >
              Manage Profiles
            </button>
          </div>
        </div>
      )}

      {/* Info panel */}
      <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
        <div className="bg-surface-50 dark:bg-surface-800/80 px-4 py-3 text-xs font-bold text-surface-500 uppercase tracking-wide">
          Monitoring Contexts Explained
        </div>
        <div className="divide-y divide-surface-100 dark:divide-surface-800">
          {[
            {
              label: 'Batch Monitoring',
              desc: 'Tied to a production lot number. ISO 5 + ISO 7 air monitoring, batch-specific surface sampling.',
              color: 'text-brand-600 dark:text-brand-400',
            },
            {
              label: 'Routine Monthly Monitoring',
              desc: 'ISO 8 and routine location monitoring. Not tied to a specific production lot.',
              color: 'text-violet-600 dark:text-violet-400',
            },
            {
              label: 'Routine Weekly Monitoring (Surface)',
              desc: 'Regular scheduled surface sampling. Not tied to a production lot.',
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Other',
              desc: 'Any non-standard monitoring activity. Requires a reason. May or may not be associated with a lot.',
              color: 'text-surface-600 dark:text-surface-400',
            },
          ].map(item => (
            <div key={item.label} className="px-4 py-3 flex items-start gap-3">
              <span className={`text-xs font-semibold shrink-0 w-44 leading-snug ${item.color}`}>{item.label}</span>
              <span className="text-xs text-surface-500 dark:text-surface-400">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
