import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { recordsAPI } from '../lib/api';
import type { PersonnelType } from '../types';
import {
  PERSONNEL_TYPES,
  PERSONNEL_TYPE_LABELS,
  getLocationConfig,
  getLocationsForPersonnelType,
} from '../types';
import { PlusCircle, CheckCircle, ChevronRight, ChevronLeft, Save, Minus, Plus, Lock, Info, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';

// ─── Zod schema ──────────────────────────────────────────────────────────────
const hitDetailSchema = z.object({
  location:     z.string(),
  iso_class:    z.string(),
  hit_value:    z.coerce.number().int().min(0, 'Must be ≥ 0'),
  alert_level:  z.coerce.number().int().min(0),
  action_level: z.coerce.number().int().min(0),
});

const recordSchema = z.object({
  name:           z.string().min(1, 'Name is required'),
  lot_number:     z.string().min(1, 'Lot number is required'),
  job_function:   z.string().min(1, 'Job function is required'),
  personnel_type: z.string().min(1) as z.ZodType<PersonnelType>,
  iso_class:      z.string(),   // derived, not user-entered
  alert_level:    z.coerce.number().int().min(0),
  action_level:   z.coerce.number().int().min(0),
  hit_date:       z.string().min(1, 'Hit date is required'),
  hit_details:    z.array(hitDetailSchema).min(1),
});

type FormData = z.infer<typeof recordSchema>;

// ─── Build hit_details for a given personnel type ─────────────────────────────
function buildHitDetails(personnelType: PersonnelType) {
  const locations = getLocationsForPersonnelType(personnelType);
  return locations.map(loc => {
    const cfg = getLocationConfig(personnelType, loc);
    return {
      location:     loc,
      iso_class:    cfg.iso_class,
      hit_value:    0,
      alert_level:  cfg.alert_level,
      action_level: cfg.action_level,
    };
  });
}

const STEPS = ['Personnel Info', 'Location Rules', 'Hit Counts', 'Review & Save'];

// ─── Stepper number input ─────────────────────────────────────────────────────
function NumberStepper({
  value, onChange, min = 0, max = 999, size = 'md',
}: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <div className={clsx('flex items-center gap-1 rounded-xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 overflow-hidden', sm ? 'h-8' : 'h-10')}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={clsx('flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors', sm ? 'w-7' : 'w-9')}
      >
        <Minus size={sm ? 11 : 14} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = parseInt(e.target.value);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className={clsx(
          'text-center font-bold bg-transparent border-x border-surface-200 dark:border-surface-600 text-surface-800 dark:text-surface-100 focus:outline-none focus:bg-brand-50 dark:focus:bg-brand-900/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          sm ? 'w-10 text-sm py-1' : 'w-12 text-base py-2'
        )}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className={clsx('flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors', sm ? 'w-7' : 'w-9')}
      >
        <Plus size={sm ? 11 : 14} />
      </button>
    </div>
  );
}

// ─── ISO class badge ──────────────────────────────────────────────────────────
function IsoBadge({ iso }: { iso: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide',
      iso === 'ISO 5'
        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
    )}>
      {iso}
    </span>
  );
}

export default function DataEntryPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(recordSchema),
    defaultValues: {
      name:           '',
      lot_number:     '',
      job_function:   '',
      personnel_type: 'Filling',
      iso_class:      'ISO 7',
      alert_level:    0,
      action_level:   4,
      hit_date:       new Date().toISOString().slice(0, 10), // today
      hit_details:    buildHitDetails('Filling'),
    },
  });

  const { fields } = useFieldArray({ control, name: 'hit_details' });
  const values = watch();

  // When personnel_type changes, rebuild hit_details with correct ISO/threshold config
  const personnelType = watch('personnel_type') as PersonnelType;
  useEffect(() => {
    const details = buildHitDetails(personnelType);
    setValue('hit_details', details);
    // Set record-level iso_class to the dominant class (ISO 5 if any location is ISO 5)
    const hasFive = details.some(d => d.iso_class === 'ISO 5');
    setValue('iso_class', hasFive ? 'ISO 5' : 'ISO 7');
  }, [personnelType, setValue]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      await recordsAPI.create(data as any);
      setSubmitted(prev => [...prev, `${data.name} / ${data.lot_number}`]);
      toast.success('Record saved successfully!');
      // Full reset — clear all personal/lot info and zero out all hit counts,
      // but keep personnel_type so the next entry starts in the same mode.
      const freshDetails = buildHitDetails(data.personnel_type as PersonnelType);
      reset({
        name:           '',
        lot_number:     '',
        job_function:   '',
        personnel_type: data.personnel_type,
        iso_class:      data.iso_class,
        alert_level:    data.alert_level,
        action_level:   data.action_level,
        hit_date:       data.hit_date,   // keep the same date for quick batch entry
        hit_details:    freshDetails,
      });
      setStep(0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save record');
    } finally {
      setSubmitting(false);
    }
  };

  const totalHits = values.hit_details?.reduce((s, h) => s + (h.hit_value || 0), 0) ?? 0;

  // Build the reference table for Step 1 from the current personnel type
  const locationRules = (values.hit_details ?? []).map(h => ({
    location:     h.location,
    iso_class:    h.iso_class,
    alert_level:  h.alert_level,
    action_level: h.action_level,
  }));

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
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">PM Excursion Data Entry</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">Enter excursion hit records — replaces spreadsheets</p>
        </div>
      </div>

      {/* Recent submissions */}
      {submitted.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs animate-fade-in">
          <CheckCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Saved {submitted.length} record{submitted.length > 1 ? 's' : ''} this session</p>
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
      {/* Form — no onSubmit here; Save button calls handleSubmit imperatively
           so that pressing Enter inside a number field never triggers a save */}
      <form onSubmit={e => e.preventDefault()}>
        <div className="card p-6 space-y-6 animate-fade-in">

          {/* ─── Step 0: Personnel Info ─── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Personnel Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label" htmlFor="name">Full Name *</label>
                  <input id="name" {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="John Smith" />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="lot_number">Lot Number *</label>
                  <input id="lot_number" {...register('lot_number')} className={`input ${errors.lot_number ? 'input-error' : ''}`} placeholder="LOT-2024-001" />
                  {errors.lot_number && <p className="mt-1 text-xs text-red-500">{errors.lot_number.message}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="job_function">Job Function *</label>
                  <input id="job_function" {...register('job_function')} className={`input ${errors.job_function ? 'input-error' : ''}`} placeholder="e.g. Aseptic Fill" />
                  {errors.job_function && <p className="mt-1 text-xs text-red-500">{errors.job_function.message}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="personnel_type">Personnel Type *</label>
                  <select id="personnel_type" {...register('personnel_type')} className="select">
                    {PERSONNEL_TYPES.map(t => (
                      <option key={t} value={t}>{PERSONNEL_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    This determines which locations and ISO thresholds apply.
                  </p>
                </div>
                {/* Hit Date — full-width on its own row */}
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="hit_date">Date of Hit *</label>
                  <input
                    id="hit_date"
                    type="date"
                    {...register('hit_date')}
                    className={`input max-w-xs ${errors.hit_date ? 'input-error' : ''}`}
                  />
                  <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                    The date the excursion hit was observed (not the entry date).
                  </p>
                  {errors.hit_date && <p className="mt-1 text-xs text-red-500">{errors.hit_date.message}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 1: Location Rules (read-only reference) ─── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div>
                  <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">
                    Location Rules for <span className="text-brand-600 dark:text-brand-400">{PERSONNEL_TYPE_LABELS[values.personnel_type as PersonnelType]}</span>
                  </h2>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                    Alert and action levels are automatically set per location based on ISO class. These values are locked and cannot be changed.
                  </p>
                </div>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs">
                <Info size={14} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">ISO 5</span> locations (critical zone) have a stricter action level of <strong>1</strong>.{' '}
                  <span className="font-semibold">ISO 7</span> locations have an action level of <strong>4</strong>.
                  {values.personnel_type === 'Crimping'
                    ? ' Crimping personnel have an alert level of 2 for all locations.'
                    : ' Filling/Stoppering personnel have an alert level of 0 for all locations.'}
                </div>
              </div>

              {/* Reference table */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
                <table className="table-base w-full text-sm">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th className="text-center">ISO Class</th>
                      <th className="text-center">Alert Level</th>
                      <th className="text-center">Action Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationRules.map(rule => (
                      <tr key={rule.location}>
                        <td className="font-medium">{rule.location}</td>
                        <td className="text-center">
                          <IsoBadge iso={rule.iso_class} />
                        </td>
                        <td className="text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-surface-700 dark:text-surface-300">
                            <Lock size={10} className="opacity-50" />
                            {rule.alert_level}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-surface-700 dark:text-surface-300">
                            <Lock size={10} className="opacity-50" />
                            {rule.action_level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Step 2: Hit Counts ─── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Hit Counts</h2>
                <span className={clsx('badge', totalHits > 0 ? 'badge-hit' : 'badge-no-hit')}>
                  Total: {totalHits} hit{totalHits !== 1 ? 's' : ''}
                </span>
              </div>

              <p className="text-xs text-surface-500 dark:text-surface-400">
                Enter the number of hits observed at each location. Alert and action thresholds are shown for reference.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((field, i) => {
                  const hitVal = watch(`hit_details.${i}.hit_value`) || 0;
                  const isoClass = field.iso_class as string;
                  const alertLvl = field.alert_level;
                  const actionLvl = field.action_level;
                  const isAction = alertLvl > 0 ? hitVal >= actionLvl : hitVal > actionLvl;
                  const isAlert  = !isAction && alertLvl > 0 && hitVal >= alertLvl;
                  const hasHit   = hitVal > 0;

                  return (
                    <div key={field.id} className={clsx(
                      'p-4 rounded-xl border-2 transition-all duration-200',
                      isAction
                        ? 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15'
                        : isAlert
                        ? 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/15'
                        : hasHit
                        ? 'border-orange-300 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/10'
                        : 'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50'
                    )}>
                      {/* Location label + ISO badge */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                            {field.location}
                          </span>
                          <IsoBadge iso={isoClass} />
                          {isAction && <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">⚠ Action</span>}
                          {isAlert  && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">⚠ Alert</span>}
                        </div>
                        <NumberStepper
                          value={hitVal}
                          onChange={v => setValue(`hit_details.${i}.hit_value`, v)}
                          size="sm"
                        />
                      </div>

                      {/* Locked threshold display */}
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 flex items-center gap-1">
                          <Lock size={9} />
                          Alert ≥ <strong className="text-surface-600 dark:text-surface-300">{alertLvl}</strong>
                        </span>
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 flex items-center gap-1">
                          <Lock size={9} />
                          Action ≥ <strong className="text-surface-600 dark:text-surface-300">{actionLvl}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ─── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Review &amp; Confirm</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  ['Name',           values.name],
                  ['Lot Number',     values.lot_number],
                  ['Date of Hit',    values.hit_date ? (() => { const [y,m,d] = values.hit_date.split('-'); return `${m}-${d}-${y}`; })() : ''],
                  ['Job Function',   values.job_function],
                  ['Personnel Type', PERSONNEL_TYPE_LABELS[values.personnel_type as PersonnelType]],
                  ['Total Hits',     String(totalHits)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-3 bg-surface-50 dark:bg-surface-800">
                    <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="font-semibold text-surface-800 dark:text-surface-100">{v || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Location summary table */}
              <div>
                <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-widest mb-2">Hit Details per Location</p>
                <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
                  <table className="table-base w-full text-xs">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th className="text-center">ISO Class</th>
                        <th className="text-center">Hits</th>
                        <th className="text-center">Alert Lvl</th>
                        <th className="text-center">Action Lvl</th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {values.hit_details?.map(h => {
                        const isAction = h.alert_level > 0 ? h.hit_value >= h.action_level : h.hit_value > h.action_level;
                        const isAlert  = !isAction && h.alert_level > 0 && h.hit_value >= h.alert_level;
                        return (
                          <tr key={h.location}>
                            <td className="font-medium">{h.location}</td>
                            <td className="text-center"><IsoBadge iso={h.iso_class} /></td>
                            <td className="text-center">
                              <span className={clsx('badge', h.hit_value > 0 ? 'badge-hit' : 'badge-no-hit')}>
                                {h.hit_value}
                              </span>
                            </td>
                            <td className="text-center font-mono font-bold text-surface-700 dark:text-surface-300">{h.alert_level}</td>
                            <td className="text-center font-mono font-bold text-surface-700 dark:text-surface-300">{h.action_level}</td>
                            <td className="text-center">
                              {isAction
                                ? <span className="text-[10px] font-bold text-red-600 dark:text-red-400">ACTION</span>
                                : isAlert
                                ? <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">ALERT</span>
                                : <span className="text-[10px] text-surface-400">OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
              <ChevronLeft size={16} />
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="btn-primary"
              >
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                id="submit-record-btn"
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
                {submitting ? 'Saving…' : 'Save Record'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
