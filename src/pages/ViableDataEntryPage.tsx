import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Save, CheckCircle, ChevronRight, ChevronLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';
import api from '../lib/api';

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  lot_number:       z.string().min(1, 'Lot number is required'),
  sample_date:      z.string().min(1, 'Sample date is required'),
  iso_class:        z.enum(['ISO 5', 'ISO 7', 'ISO 8']),
  room_number:      z.string().optional(),
  iso5_cfu:         z.coerce.number().int().min(0, 'Must be ≥ 0'),
  iso7_cfu:         z.coerce.number().int().min(0, 'Must be ≥ 0'),
  particle_05um:    z.coerce.number().min(0, 'Must be ≥ 0'),
  particle_50um:    z.coerce.number().min(0, 'Must be ≥ 0'),
  deviation_number: z.string().optional(),
  notes:            z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const STEPS = ['Basic Info', 'CFU Counts', 'Particle Counts', 'Review & Save'];

// Alert / Action thresholds for Non-Viable Air Particle Count
const PARTICLE_THRESHOLDS = {
  'ISO 5': { um05: { alert: 3_000,       action: 3_520       }, um50: { alert: 20,     action: 29      } },
  'ISO 7': { um05: { alert: 300_000,     action: 352_000     }, um50: { alert: 2_000,  action: 2_930   } },
  'ISO 8': { um05: { alert: 3_000_000,   action: 3_520_000   }, um50: { alert: 20_000, action: 29_300  } },
} as const;

// Alert / Action thresholds for Viable (CFU) counts
// ISO 5: Alert = N/A (any count = action immediately), Action = 1
// ISO 7: Alert = 5, Action = 10
const CFU_THRESHOLDS = {
  iso5: { alert: Infinity, action: 1  },   // N/A alert — any CFU triggers action
  iso7: { alert: 5,        action: 10 },
} as const;

type IsoClass = keyof typeof PARTICLE_THRESHOLDS;

function statusColor(val: number, alert: number, action: number) {
  if (val >= action) return 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15';
  if (val >= alert)  return 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/15';
  return 'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50';
}

function StatusBadge({ val, alert, action }: { val: number; alert: number; action: number }) {
  if (val >= action) return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">⚠ Action</span>;
  if (val >= alert)  return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">⚠ Alert</span>;
  return null;
}

const defaultValues: FormData = {
  lot_number:       '',
  sample_date:      new Date().toISOString().slice(0, 10),
  iso_class:        'ISO 7',
  room_number:      '',
  iso5_cfu:         0,
  iso7_cfu:         0,
  particle_05um:    0,
  particle_50um:    0,
  deviation_number: '',
  notes:            '',
};

export default function ViableDataEntryPage() {
  const navigate  = useNavigate();
  const [step, setStep]           = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]  = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  const values = watch();

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      await api.post('/viable', data);
      setSubmitted(prev => [...prev, data.lot_number]);
      toast.success('Entry saved successfully!');
      reset({ ...defaultValues, sample_date: data.sample_date });
      setStep(0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

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
            Viable &amp; Non-Viable Entry
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Record CFU counts and particle concentrations per lot
          </p>
        </div>
      </div>

      {/* Recent submissions */}
      {submitted.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs animate-fade-in">
          <CheckCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Saved {submitted.length} entr{submitted.length > 1 ? 'ies' : 'y'} this session
            </p>
            {submitted.map((s, i) => <p key={i}>{s}</p>)}
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="card p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={clsx('flex items-center gap-2', i < step ? 'cursor-pointer' : 'cursor-default')}
              >
                <span className={clsx(
                  i === step ? 'step-active' : i < step ? 'step-complete' : 'step-inactive'
                )}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className={clsx(
                  'text-xs font-semibold hidden sm:block',
                  i === step ? 'text-brand-700 dark:text-brand-300' :
                  i < step ? 'text-success' : 'text-surface-400 dark:text-surface-500'
                )}>{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={clsx('w-8 h-0.5 rounded-full', i < step ? 'bg-success' : 'bg-surface-200 dark:bg-surface-700')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={e => e.preventDefault()}>
        <div className="card p-6 space-y-6 animate-fade-in">

          {/* ─── Step 0: Basic Info ─── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Basic Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label" htmlFor="lot_number">Lot Number *</label>
                  <input
                    id="lot_number"
                    {...register('lot_number')}
                    placeholder="e.g. PRORX01062026@2"
                    className={`input ${errors.lot_number ? 'input-error' : ''}`}
                  />
                  {errors.lot_number && <p className="mt-1 text-xs text-red-500">{errors.lot_number.message}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="sample_date">Sample Date *</label>
                  <input
                    id="sample_date"
                    type="date"
                    {...register('sample_date')}
                    className={`input ${errors.sample_date ? 'input-error' : ''}`}
                  />
                  {errors.sample_date && <p className="mt-1 text-xs text-red-500">{errors.sample_date.message}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="iso_class">ISO Class of Sampling Area *</label>
                  <select id="iso_class" {...register('iso_class')} className="select max-w-xs">
                    <option value="ISO 5">ISO Class 5</option>
                    <option value="ISO 7">ISO Class 7</option>
                    <option value="ISO 8">ISO Class 8</option>
                  </select>
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    Determines the alert &amp; action thresholds for particle counts.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="room_number">Room Number <span className="font-normal text-surface-400">(optional)</span></label>
                  <input
                    id="room_number"
                    {...register('room_number')}
                    placeholder="e.g. Room 101, Suite A"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    Room or area where the sample was collected.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 1: CFU Counts ─── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">CFU Counts</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                Enter the number of Colony Forming Units found in each ISO class zone.
              </p>

              {/* CFU threshold reference table */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden text-xs">
                <div className="grid grid-cols-3 bg-surface-50 dark:bg-surface-800 px-3 py-2 font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                  <span>Sample Type</span>
                  <span className="text-amber-600 dark:text-amber-400">Alert Level</span>
                  <span className="text-red-600 dark:text-red-400">Action Level</span>
                </div>
                <div className="grid grid-cols-3 px-3 py-2 border-t border-surface-100 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                  <span className="font-medium">ISO 5 CFU</span>
                  <span className="text-surface-400 italic">N/A</span>
                  <span>1</span>
                </div>
                <div className="grid grid-cols-3 px-3 py-2 border-t border-surface-100 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                  <span className="font-medium">ISO 7 CFU</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* ISO 5 CFU */}
                <div className={clsx(
                  'p-4 rounded-xl border-2 transition-all',
                  statusColor(Number(values.iso5_cfu), CFU_THRESHOLDS.iso5.alert, CFU_THRESHOLDS.iso5.action)
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0" htmlFor="iso5_cfu">ISO 5 CFUs Found</label>
                    <StatusBadge val={Number(values.iso5_cfu)} alert={CFU_THRESHOLDS.iso5.alert} action={CFU_THRESHOLDS.iso5.action} />
                  </div>
                  <input
                    id="iso5_cfu" type="number" min={0} step={1}
                    {...register('iso5_cfu')}
                    className={`input mt-1 ${errors.iso5_cfu ? 'input-error' : ''}`}
                  />
                  <p className="mt-1.5 text-[11px] text-surface-400">Alert: N/A &nbsp;|&nbsp; Action ≥ 1</p>
                  {errors.iso5_cfu && <p className="mt-1 text-xs text-red-500">{errors.iso5_cfu.message}</p>}
                </div>

                {/* ISO 7 CFU */}
                <div className={clsx(
                  'p-4 rounded-xl border-2 transition-all',
                  statusColor(Number(values.iso7_cfu), CFU_THRESHOLDS.iso7.alert, CFU_THRESHOLDS.iso7.action)
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0" htmlFor="iso7_cfu">ISO 7 CFUs Found</label>
                    <StatusBadge val={Number(values.iso7_cfu)} alert={CFU_THRESHOLDS.iso7.alert} action={CFU_THRESHOLDS.iso7.action} />
                  </div>
                  <input
                    id="iso7_cfu" type="number" min={0} step={1}
                    {...register('iso7_cfu')}
                    className={`input mt-1 ${errors.iso7_cfu ? 'input-error' : ''}`}
                  />
                  <p className="mt-1.5 text-[11px] text-surface-400">Alert ≥ 5 &nbsp;|&nbsp; Action ≥ 10</p>
                  {errors.iso7_cfu && <p className="mt-1 text-xs text-red-500">{errors.iso7_cfu.message}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: Particle Counts + Deviation/Notes ─── */}
          {step === 2 && (() => {
            const iso = (values.iso_class || 'ISO 7') as IsoClass;
            const t = PARTICLE_THRESHOLDS[iso];
            const v05 = Number(values.particle_05um) || 0;
            const v50 = Number(values.particle_50um) || 0;
            return (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Particle Counts &amp; Notes</h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">{iso}</span>
                </div>

                {/* Threshold reference */}
                <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-surface-50 dark:bg-surface-800 px-3 py-2 font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                    <span>Particle</span>
                    <span className="text-amber-600 dark:text-amber-400">Alert</span>
                    <span className="text-red-600 dark:text-red-400">Action</span>
                  </div>
                  <div className="grid grid-cols-3 px-3 py-2 border-t border-surface-100 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                    <span className="font-medium">0.5 μm</span>
                    <span>{t.um05.alert.toLocaleString()}</span>
                    <span>{t.um05.action.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 px-3 py-2 border-t border-surface-100 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                    <span className="font-medium">5.0 μm</span>
                    <span>{t.um50.alert.toLocaleString()}</span>
                    <span>{t.um50.action.toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className={clsx('p-4 rounded-xl border-2 transition-all', statusColor(v05, t.um05.alert, t.um05.action))}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0" htmlFor="particle_05um">0.5 μm Particle Count (p/m³)</label>
                      <StatusBadge val={v05} alert={t.um05.alert} action={t.um05.action} />
                    </div>
                    <input id="particle_05um" type="number" min={0} step={1} {...register('particle_05um')}
                      className={`input mt-1 ${errors.particle_05um ? 'input-error' : ''}`} />
                    <p className="mt-1.5 text-[11px] text-surface-400">Alert ≥ {t.um05.alert.toLocaleString()} &nbsp;|&nbsp; Action ≥ {t.um05.action.toLocaleString()}</p>
                    {errors.particle_05um && <p className="mt-1 text-xs text-red-500">{errors.particle_05um.message}</p>}
                  </div>
                  <div className={clsx('p-4 rounded-xl border-2 transition-all', statusColor(v50, t.um50.alert, t.um50.action))}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0" htmlFor="particle_50um">5.0 μm Particle Count (p/m³)</label>
                      <StatusBadge val={v50} alert={t.um50.alert} action={t.um50.action} />
                    </div>
                    <input id="particle_50um" type="number" min={0} step={1} {...register('particle_50um')}
                      className={`input mt-1 ${errors.particle_50um ? 'input-error' : ''}`} />
                    <p className="mt-1.5 text-[11px] text-surface-400">Alert ≥ {t.um50.alert.toLocaleString()} &nbsp;|&nbsp; Action ≥ {t.um50.action.toLocaleString()}</p>
                    {errors.particle_50um && <p className="mt-1 text-xs text-red-500">{errors.particle_50um.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                  <div>
                    <label className="label" htmlFor="deviation_number">Deviation Number <span className="font-normal text-surface-400">(if applicable)</span></label>
                    <input id="deviation_number" {...register('deviation_number')} placeholder="e.g. DEV-2026-17" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="notes">Notes</label>
                    <input id="notes" {...register('notes')} placeholder="Optional notes…" className="input" />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── Step 3: Review ─── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Review &amp; Confirm</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  ['Lot Number',    values.lot_number],
                  ['Sample Date',   values.sample_date ? (() => { const [y,m,d] = values.sample_date.split('-'); return `${m}-${d}-${y}`; })() : ''],
                  ['ISO Class',     values.iso_class],
                  ['Room Number',   values.room_number || '—'],
                  ['ISO 5 CFUs',    String(values.iso5_cfu)],
                  ['ISO 7 CFUs',    String(values.iso7_cfu)],
                  ['0.5 μm (p/m³)', String(values.particle_05um)],
                  ['5.0 μm (p/m³)', String(values.particle_50um)],
                  ['Deviation #',   values.deviation_number || '—'],
                  ['Notes',         values.notes || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-3 bg-surface-50 dark:bg-surface-800">
                    <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="font-semibold text-surface-800 dark:text-surface-100">{v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-surface-100 dark:border-surface-800">
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="btn-secondary"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep(s => s + 1)} className="btn-primary">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                className="btn-success"
                onClick={handleSubmit(onSubmit)}
              >
                {submitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : <Save size={16} />}
                {submitting ? 'Saving…' : 'Save Entry'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
