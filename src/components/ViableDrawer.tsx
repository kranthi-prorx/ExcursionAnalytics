import { X, FlaskConical } from 'lucide-react';
import type { ViableRecord } from '../lib/api';

interface Props {
  lot: string | null;
  records: ViableRecord[];
  onClose: () => void;
}

function fmtDate(d: string) {
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${m}-${day}-${y}`;
}

export default function ViableDrawer({ lot, records, onClose }: Props) {
  const isOpen = !!lot;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`
        fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col
        bg-white dark:bg-surface-900
        shadow-2xl border-l border-surface-100 dark:border-surface-800
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
              <FlaskConical size={15} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest">Viable Records</p>
              <h2 className="text-sm font-bold text-surface-900 dark:text-white font-mono">{lot}</h2>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200">
            <X size={16} />
          </button>
        </div>

        {/* Summary row */}
        {records.length > 0 && (
          <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30">
            {[
              { label: 'Samples', value: records.length },
              { label: 'ISO 5 CFU', value: records.reduce((s, r) => s + (r.iso5_cfu ?? 0), 0) },
              { label: 'ISO 7 CFU', value: records.reduce((s, r) => s + (r.iso7_cfu ?? 0), 0) },
              { label: 'Avg 0.5μm', value: records.length ? (records.reduce((s, r) => s + Number(r.particle_05um ?? 0), 0) / records.length).toFixed(0) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-base font-bold text-surface-900 dark:text-white">{value}</p>
                <p className="text-[9px] text-surface-400 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Records list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {records.length === 0 ? (
            <p className="text-center text-surface-400 text-sm py-12">No records for this lot</p>
          ) : (
            records.map((r) => (
              <div key={r.id} className="rounded-xl border border-surface-100 dark:border-surface-800 p-4 space-y-3 bg-surface-50/40 dark:bg-surface-800/30">
                {/* Date + ISO + Room */}
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">{fmtDate(r.sample_date)}</span>
                  <div className="flex items-center gap-1.5">
                    {r.room_number && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                        🏠 {r.room_number}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.iso_class === 'ISO 5'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : r.iso_class === 'ISO 7'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    }`}>{r.iso_class}</span>
                  </div>
                </div>

                {/* CFU counts */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{r.iso5_cfu}</p>
                    <p className="text-[9px] text-indigo-500 uppercase tracking-wide">ISO 5 CFU</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 dark:bg-cyan-900/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">{r.iso7_cfu}</p>
                    <p className="text-[9px] text-cyan-500 uppercase tracking-wide">ISO 7 CFU</p>
                  </div>
                </div>

                {/* Particle counts */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2.5 text-center">
                    <p className="text-base font-bold text-amber-700 dark:text-amber-300">{Number(r.particle_05um).toLocaleString()}</p>
                    <p className="text-[9px] text-amber-500 uppercase tracking-wide">0.5 μm (p/m³)</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-center">
                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{Number(r.particle_50um).toLocaleString()}</p>
                    <p className="text-[9px] text-emerald-500 uppercase tracking-wide">5.0 μm (p/m³)</p>
                  </div>
                </div>

                {/* Footer */}
                {(r.deviation_number || r.notes || r.created_by_name) && (
                  <div className="pt-1 space-y-1 border-t border-surface-100 dark:border-surface-800">
                    {r.deviation_number && (
                      <p className="text-xs text-surface-600 dark:text-surface-400">
                        <span className="font-semibold">Deviation:</span> {r.deviation_number}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-xs text-surface-500 dark:text-surface-500 italic">{r.notes}</p>
                    )}
                    {r.created_by_name && (
                      <p className="text-[10px] text-surface-400">Entered by {r.created_by_name}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
