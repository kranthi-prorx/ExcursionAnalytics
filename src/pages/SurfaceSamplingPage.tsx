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
  sample_location:  z.string().min(1, 'Sample location is required'),
  lot_number:       z.string().min(1, 'Lot number is required'),
  sample_date:      z.string().min(1, 'Sample date is required'),
  iso_class:        z.enum(['ISO 5', 'ISO 7', 'ISO 8']),
  cfu_found:        z.coerce.number().int().min(0, 'Must be ≥ 0'),
  organism_id:      z.string().optional(),
  deviation_number: z.string().optional(),
  notes:            z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const STEPS = ['Sample Info', 'Results', 'Notes', 'Review & Save'];

const defaultValues: FormData = {
  sample_location:  '',
  lot_number:       '',
  sample_date:      new Date().toISOString().slice(0, 10),
  iso_class:        'ISO 7',
  cfu_found:        0,
  organism_id:      '',
  deviation_number: '',
  notes:            '',
};

export default function SurfaceSamplingPage() {
  const navigate   = useNavigate();
  const [step, setStep]             = useState(0);
  const [submitting, setSubmitting]  = useState(false);
  const [submitted, setSubmitted]    = useState<string[]>([]);

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
      await api.post('/surface', data);
      setSubmitted(prev => [...prev, `${data.sample_location} / ${data.lot_number}`]);
      toast.success('Entry saved successfully!');
      reset({ ...defaultValues, sample_date: data.sample_date, iso_class: data.iso_class });
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
            Surface Sampling Entry
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Log surface swab and contact plate results by sample point
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

          {/* ─── Step 0: Sample Info ─── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Sample Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label" htmlFor="sample_location">Sample Location *</label>
                  <input
                    id="sample_location"
                    {...register('sample_location')}
                    placeholder="e.g. Filling Room Floor"
                    className={`input ${errors.sample_location ? 'input-error' : ''}`}
                  />
                  {errors.sample_location && <p className="mt-1 text-xs text-red-500">{errors.sample_location.message}</p>}
                </div>
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
                <div>
                  <label className="label" htmlFor="iso_class">ISO Class *</label>
                  <select id="iso_class" {...register('iso_class')} className="select">
                    <option value="ISO 5">ISO 5</option>
                    <option value="ISO 7">ISO 7</option>
                    <option value="ISO 8">ISO 8</option>
                  </select>
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    ISO classification of the sampled area.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 1: Results ─── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Sampling Results</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                Enter the colony count and organism identification if applicable.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className={clsx(
                  'p-4 rounded-xl border-2 transition-all',
                  Number(values.cfu_found) > 0
                    ? 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15'
                    : 'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50'
                )}>
                  <label className="label" htmlFor="cfu_found">CFUs Found</label>
                  <input
                    id="cfu_found"
                    type="number"
                    min={0}
                    step={1}
                    {...register('cfu_found')}
                    className={`input mt-2 ${errors.cfu_found ? 'input-error' : ''}`}
                  />
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    Colony Forming Units on surface sample
                  </p>
                  {errors.cfu_found && <p className="mt-1 text-xs text-red-500">{errors.cfu_found.message}</p>}
                </div>
                <div className="p-4 rounded-xl border-2 border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
                  <label className="label" htmlFor="organism_id">Organism Identified <span className="font-normal text-surface-400">(optional)</span></label>
                  <input
                    id="organism_id"
                    {...register('organism_id')}
                    placeholder="e.g. Staphylococcus epidermidis"
                    className="input mt-2"
                  />
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    Microorganism species if identified
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: Notes ─── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Deviation &amp; Notes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label" htmlFor="deviation_number">
                    Deviation Number <span className="font-normal text-surface-400">(if applicable)</span>
                  </label>
                  <input
                    id="deviation_number"
                    {...register('deviation_number')}
                    placeholder="e.g. DEV-2026-17"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    Reference an open deviation if this result triggered one.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    {...register('notes')}
                    rows={3}
                    placeholder="Any additional observations…"
                    className="input resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ─── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Review &amp; Confirm</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  ['Sample Location', values.sample_location],
                  ['Lot Number',      values.lot_number],
                  ['Sample Date',     values.sample_date ? (() => { const [y,m,d] = values.sample_date.split('-'); return `${m}-${d}-${y}`; })() : ''],
                  ['ISO Class',       values.iso_class],
                  ['CFUs Found',      String(values.cfu_found)],
                  ['Organism',        values.organism_id || '—'],
                  ['Deviation #',     values.deviation_number || '—'],
                  ['Notes',           values.notes || '—'],
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
