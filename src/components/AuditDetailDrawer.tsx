import { X, Shield, Clock, User, Package, Calendar, FileText, RotateCcw, Plus, Pencil, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuditLog, AuditActionType } from '../types';
import { clsx } from '../lib/utils';

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

const ACTION_CONFIG: Record<AuditActionType, { label: string; color: string; Icon: LucideIcon }> = {
  CREATE:  { label: 'Created',  color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',   Icon: Plus },
  UPDATE:  { label: 'Updated',  color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700',         Icon: Pencil },
  DELETE:  { label: 'Deleted',  color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700',               Icon: Trash2 },
  RESTORE: { label: 'Restored', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',   Icon: RotateCcw },
};

const ENTITY_LABELS: Record<string, string> = {
  pm_record:        'PM Monitoring',
  viable_record:    'Environmental/Viable',
  surface_record:   'Surface Sampling',
  processed_batch:  'Processed Batch',
};

function fmt(d: string | null) {
  if (!d) return '\u2014';
  try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return d; }
}

function fmtDate(d: string | null) {
  if (!d) return '\u2014';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${m}-${day}-${y}`;
}

function KeyVal({ k, v, highlight = false }: { k: string; v: unknown; highlight?: boolean }) {
  const str = v == null ? '\u2014' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
  return (
    <div className={clsx('rounded-lg px-3 py-2 text-xs', highlight ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700' : 'bg-surface-50 dark:bg-surface-800')}>
      <span className="text-surface-500 dark:text-surface-400 font-medium">{k}: </span>
      <span className={clsx('font-mono', highlight ? 'text-amber-700 dark:text-amber-300' : 'text-surface-800 dark:text-surface-200')}>{str}</span>
    </div>
  );
}

function ValuesBlock({ title, values, changedFields }: { title: string; values: Record<string, unknown> | null; changedFields?: string[] | null }) {
  if (!values) return null;
  const SKIP = ['password_hash', 'password', 'token', 'secret'];
  const entries = Object.entries(values).filter(([k]) => !SKIP.includes(k));
  return (
    <section>
      <p className="text-[10px] uppercase font-bold tracking-widest text-surface-500 dark:text-surface-400 mb-2">{title}</p>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <KeyVal key={k} k={k} v={v} highlight={changedFields?.includes(k)} />
        ))}
      </div>
    </section>
  );
}

export default function AuditDetailDrawer({ log, onClose }: Props) {
  if (!log) return null;

  const cfg = ACTION_CONFIG[log.action_type] ?? ACTION_CONFIG.CREATE;
  const Icon = cfg.Icon;
  const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-surface-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <div className="relative w-full max-w-lg h-full bg-white dark:bg-surface-900 border-l border-surface-100 dark:border-surface-800 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center border shrink-0', cfg.color)}>
            <Icon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-surface-900 dark:text-white">
              {cfg.label} — {entityLabel}
            </h2>
            <p className="text-[11px] text-surface-500 dark:text-surface-400 font-mono">ID: {log.entity_id}</p>
          </div>
          <button onClick={onClose} aria-label="Close details" className="btn-ghost p-1.5 rounded-lg shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Read-only notice */}
        <div className="px-5 py-2.5 bg-surface-50 dark:bg-surface-800/60 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <p className="text-[10px] text-surface-400 uppercase tracking-widest font-medium flex items-center gap-1.5">
            <Shield size={10} className="text-brand-500" />
            Read-only audit record — cannot be edited or deleted
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-5">
          {/* Meta */}
          <section className="grid grid-cols-2 gap-3">
            <InfoCard icon={Clock} label="Occurred At" value={fmt(log.occurred_at)} />
            <InfoCard icon={User} label="Actor" value={log.actor_name} sub={log.actor_email} />
            <InfoCard icon={Shield} label="Role" value={log.actor_role} />
            <InfoCard icon={FileText} label="Action" value={cfg.label} />
            {log.personnel_name && <InfoCard icon={User} label="Personnel" value={log.personnel_name} />}
            {log.batch_number && <InfoCard icon={Package} label="Batch / Lot" value={log.batch_number} />}
            {log.date_of_batch && <InfoCard icon={Calendar} label="Date of Batch" value={fmtDate(log.date_of_batch)} />}
          </section>

          {/* Deletion reason */}
          {log.deletion_reason && (
            <section>
              <p className="text-[10px] uppercase font-bold tracking-widest text-surface-500 dark:text-surface-400 mb-2">Reason</p>
              <blockquote className="border-l-2 border-red-400 pl-3 text-sm text-surface-700 dark:text-surface-300 italic">
                "{log.deletion_reason}"
              </blockquote>
            </section>
          )}

          {/* Changed fields callout for UPDATE */}
          {log.action_type === 'UPDATE' && log.changed_fields && log.changed_fields.length > 0 && (
            <section>
              <p className="text-[10px] uppercase font-bold tracking-widest text-surface-500 dark:text-surface-400 mb-2">Changed Fields</p>
              <div className="flex flex-wrap gap-1.5">
                {log.changed_fields.map(f => (
                  <span key={f} className="px-2 py-0.5 text-[11px] rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono font-medium border border-amber-200 dark:border-amber-700">
                    {f}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Values */}
          {log.action_type === 'CREATE' && (
            <ValuesBlock title="Created Values" values={log.after_values as Record<string, unknown>} />
          )}
          {log.action_type === 'UPDATE' && (
            <>
              <ValuesBlock title="Before" values={log.before_values as Record<string, unknown>} />
              <ValuesBlock title="After (changed fields highlighted)" values={log.after_values as Record<string, unknown>} changedFields={log.changed_fields} />
            </>
          )}
          {log.action_type === 'DELETE' && (
            <ValuesBlock title="Record Snapshot Before Deletion" values={log.before_values as Record<string, unknown>} />
          )}
          {log.action_type === 'RESTORE' && (
            <>
              <ValuesBlock title="Deleted State" values={log.before_values as Record<string, unknown>} />
              <ValuesBlock title="Restored State" values={log.after_values as Record<string, unknown>} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-50 dark:bg-surface-800 px-3 py-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className="text-brand-500" />
        <p className="text-[10px] uppercase tracking-widest font-medium text-surface-400">{label}</p>
      </div>
      <p className="text-xs font-semibold text-surface-800 dark:text-surface-100 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-surface-400">{sub}</p>}
    </div>
  );
}