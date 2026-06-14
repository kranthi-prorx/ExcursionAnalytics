import { useNavigate } from 'react-router-dom';
import { Activity, Microscope, FlaskConical, ChevronRight } from 'lucide-react';

const OPTIONS = [
  {
    id: 'pm-excursion',
    title: 'PM Excursion',
    subtitle: 'Data Entry',
    description:
      'Record personnel monitoring excursion hits by location. Tracks finger, gown, and sleeve counts per ISO class with alert and action level thresholds.',
    icon: Activity,
    color: 'from-violet-500 to-purple-700',
    bg: 'hover:border-violet-300 dark:hover:border-violet-700',
    accent: 'text-violet-600 dark:text-violet-400',
    badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
    path: '/data-entry/pm-excursion',
  },
  {
    id: 'viable',
    title: 'Viable & Non-Viable',
    subtitle: 'Data Entry',
    description:
      'Enter environmental monitoring results including ISO 5/7 CFU counts and 0.5 μm / 5.0 μm airborne particle concentrations per lot.',
    icon: Microscope,
    color: 'from-emerald-500 to-teal-700',
    bg: 'hover:border-emerald-300 dark:hover:border-emerald-700',
    accent: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    path: '/data-entry/viable',
  },
  {
    id: 'surface',
    title: 'Surface Sampling',
    subtitle: 'Data Entry',
    description:
      'Log surface swab / contact plate results by sample point, ISO class, CFU count, and organism identification for environmental monitoring.',
    icon: FlaskConical,
    color: 'from-sky-500 to-blue-700',
    bg: 'hover:border-sky-300 dark:hover:border-sky-700',
    accent: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
    path: '/data-entry/surface',
  },
];

export default function DataEntryHubPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Data Entry</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Select the type of data you want to enter
        </p>
      </div>

      {/* Option Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => navigate(opt.path)}
              className={`
                group text-left card p-6 border-2 border-surface-100 dark:border-surface-800
                transition-all duration-300 cursor-pointer
                hover:shadow-xl hover:-translate-y-1 ${opt.bg}
              `}
            >
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${opt.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={26} className="text-white" />
              </div>

              {/* Title */}
              <div className="mb-3">
                <p className={`text-xs font-semibold uppercase tracking-widest mb-0.5 ${opt.accent}`}>
                  {opt.subtitle}
                </p>
                <h2 className="text-lg font-bold text-surface-900 dark:text-white leading-tight">
                  {opt.title}
                </h2>
              </div>

              {/* Description */}
              <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed mb-5">
                {opt.description}
              </p>

              {/* CTA */}
              <div className={`flex items-center gap-1 text-sm font-semibold ${opt.accent} group-hover:gap-2 transition-all duration-200`}>
                Open form
                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
