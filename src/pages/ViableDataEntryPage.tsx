import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, ChevronRight, ChevronLeft, Plus, Trash2, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';
import api, { viableAPI, profilesAPI } from '../lib/api';
import type { LotProfile } from '../lib/api';
import { queryCache } from '../lib/queryCache';
import {
  type ViableISOClass, CFU_THRESHOLDS, PARTICLE_THRESHOLDS,
  evaluateCfuStatus, getCfuThresholdLabel, cfuStatusColor,
} from '../lib/cfuConfig';

// ─── Types ─────────────────────────────────────────────────────────────────────
type MonitoringCtx = 'BATCH' | 'ROUTINE_MONTHLY' | 'OTHER';
type SampleType = 'VIABLE_AIR' | 'NONVIABLE_AIR';
type ISOClass = 'ISO 5' | 'ISO 7' | 'ISO 8';

interface SampleRow {
  id: string;
  iso_class: ISOClass;
  sample_type: SampleType;
  sample_location: string;
  cfu: string;
  particle_05um: string;
  particle_50um: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const STEPS = ['Context & Info', 'Sample Measurements', 'Review & Save'];

function mkId() { return Math.random().toString(36).slice(2); }

function CfuBadge({ val, iso }: { val: string; iso: ISOClass }) {
  const n = Number(val);
  if (!val || isNaN(n)) return null;
  const s = evaluateCfuStatus(n, iso as ViableISOClass);
  if (s === 'action') return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">⚠ Action</span>;
  if (s === 'alert')  return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">⚠ Alert</span>;
  return null;
}

function ParticleBadge({ val, field, iso }: { val: string; field: 'um05' | 'um50'; iso: ISOClass }) {
  const n = Number(val);
  if (!val || isNaN(n)) return null;
  const t = PARTICLE_THRESHOLDS[iso as ViableISOClass][field];
  if (n >= t.action) return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">⚠ Action</span>;
  if (n >= t.alert)  return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">⚠ Alert</span>;
  return null;
}

// ─── Lot Combobox ─────────────────────────────────────────────────────────────
interface LotComboboxProps {
  value: string;
  lotId: string | null;
  onChange: (text: string, id: string | null) => void;
  required?: boolean;
  error?: string;
}

function LotCombobox({ value, onChange, required, error }: LotComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LotProfile[]>([]);
  const [creating, setCreating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    try {
      const res = await profilesAPI.searchLots(q || undefined);
      setResults(res.data);
      setOpen(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (lot: LotProfile) => {
    setQuery(lot.display_lot);
    onChange(lot.display_lot, lot.id);
    setOpen(false);
  };

  const createNew = async () => {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const res = await profilesAPI.createLot({ lot_number: query.trim() });
      select(res.data);
      toast.success(`Lot "${res.data.display_lot}" created`);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const existing = err.response.data.existing as LotProfile;
        select(existing);
        toast.success(`Matched existing lot "${existing.display_lot}"`);
      } else {
        toast.error(err?.response?.data?.message ?? 'Failed to create lot');
      }
    } finally { setCreating(false); }
  };

  const clear = () => { setQuery(''); onChange('', null); setResults([]); setOpen(false); };
  const queryNormalized = query.trim().toLowerCase();
  const exactMatch = results.find(r => r.lot_key === queryNormalized || r.display_lot.toLowerCase() === queryNormalized);
  const canCreate = query.trim().length > 0 && !exactMatch;

  return (
    <div ref={containerRef} className="relative">
      <div className={clsx('input flex items-center gap-2 pr-2', error ? 'input-error' : '')}>
        <Search size={14} className="shrink-0 text-surface-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value, null); }}
          onFocus={() => search(query)}
          placeholder="Search or type lot number…"
          className="flex-1 bg-transparent outline-none text-sm"
          autoComplete="off"
        />
        {query && <button type="button" onClick={clear} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"><X size={14} /></button>}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-xl max-h-52 overflow-y-auto">
          {results.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-xs text-surface-400 italic">No lots found</p>
          )}
          {results.map(lot => (
            <button key={lot.id} type="button" onClick={() => select(lot)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors font-mono">
              {lot.display_lot}
            </button>
          ))}
          {canCreate && (
            <button type="button" onClick={createNew} disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-brand-600 dark:text-brand-400 font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 border-t border-surface-100 dark:border-surface-700 flex items-center gap-2">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {creating ? 'Creating…' : `Create "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const defaultSample = (): SampleRow => ({
  id: mkId(), iso_class: 'ISO 7', sample_type: 'VIABLE_AIR',
  sample_location: '', cfu: '', particle_05um: '', particle_50um: '',
});

export default function ViableDataEntryPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>([]);

  // Step 0 fields
  const [ctx, setCtx] = useState<MonitoringCtx>('BATCH');
  const [lotText, setLotText] = useState('');
  const [lotId, setLotId] = useState<string | null>(null);
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));
  const [roomArea, setRoomArea] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [otherBatchLinked, setOtherBatchLinked] = useState<'yes' | 'no'>('no');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1 — sample rows
  const [samples, setSamples] = useState<SampleRow[]>([defaultSample()]);

  const updateSample = (id: string, field: keyof SampleRow, val: string) =>
    setSamples(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));

  const addSample = () => setSamples(prev => [...prev, defaultSample()]);
  const removeSample = (id: string) => setSamples(prev => prev.filter(s => s.id !== id));

  // Validation
  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!sampleDate) e.sampleDate = 'Sample date is required';
    if (ctx === 'BATCH' && !lotText) e.lot = 'Lot number is required for Batch monitoring';
    if (ctx === 'OTHER' && !otherReason) e.otherReason = 'Reason is required';
    if (ctx === 'OTHER' && otherBatchLinked === 'yes' && !lotText) e.lot = 'Lot number is required when batch-associated';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep1 = () => {
    if (samples.length === 0) { toast.error('Add at least one sample'); return false; }
    for (const s of samples) {
      if (!s.sample_location.trim()) { toast.error('All samples need a location'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    setStep(s => s + 1);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    const savedLabels: string[] = [];
    try {
      const lotNumberForBatch = (ctx === 'BATCH' || (ctx === 'OTHER' && otherBatchLinked === 'yes')) ? lotText : null;
      const lotIdForBatch = (ctx === 'BATCH' || (ctx === 'OTHER' && otherBatchLinked === 'yes')) ? lotId : null;

      for (const s of samples) {
        const payload: Record<string, unknown> = {
          monitoring_context: ctx,
          lot_number: lotNumberForBatch || null,
          lot_id: lotIdForBatch || null,
          sample_date: sampleDate,
          iso_class: s.iso_class,
          room_number: roomArea || null,
          sample_location: s.sample_location || null,
          sample_type: s.sample_type,
          deviation_number: null,
          notes: ctx === 'OTHER' ? `Reason: ${otherReason}` : null,
        };

        if (s.sample_type === 'VIABLE_AIR') {
          const cfuField = s.iso_class === 'ISO 5' ? 'iso5_cfu' : s.iso_class === 'ISO 7' ? 'iso7_cfu' : 'iso8_cfu';
          payload[cfuField] = s.cfu !== '' ? Number(s.cfu) : null;
          payload.iso5_cfu = s.iso_class === 'ISO 5' ? (s.cfu !== '' ? Number(s.cfu) : null) : null;
          payload.iso7_cfu = s.iso_class === 'ISO 7' ? (s.cfu !== '' ? Number(s.cfu) : null) : null;
          payload.iso8_cfu = s.iso_class === 'ISO 8' ? (s.cfu !== '' ? Number(s.cfu) : null) : null;
          payload.particle_05um = null;
          payload.particle_50um = null;
        } else {
          payload.iso5_cfu = null;
          payload.iso7_cfu = null;
          payload.iso8_cfu = null;
          payload.particle_05um = s.particle_05um !== '' ? Number(s.particle_05um) : null;
          payload.particle_50um = s.particle_50um !== '' ? Number(s.particle_50um) : null;
        }

        await api.post('/viable', payload);
        savedLabels.push(`${s.iso_class} ${s.sample_type === 'VIABLE_AIR' ? 'Viable' : 'Non-Viable'} @ ${s.sample_location}`);
      }

      queryCache.invalidate('viable:');
      queryCache.invalidate('analytics:');
      setSubmitted(prev => [...prev, ...savedLabels]);
      toast.success(`${samples.length} sample${samples.length > 1 ? 's' : ''} saved!`);
      // Reset
      setStep(0); setCtx('BATCH'); setLotText(''); setLotId(null);
      setSampleDate(new Date().toISOString().slice(0, 10)); setRoomArea('');
      setOtherReason(''); setOtherBatchLinked('no');
      setSamples([defaultSample()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save samples');
    } finally { setSubmitting(false); }
  };

  // Determine lot requirement
  const lotRequired = ctx === 'BATCH' || (ctx === 'OTHER' && otherBatchLinked === 'yes');
  const showLot = ctx !== 'ROUTINE_MONTHLY';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/data-entry')} className="btn-ghost p-2 rounded-xl" title="Back to Data Entry">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Viable &amp; Non-Viable Entry</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Record CFU counts and particle concentrations — batch, routine, or other
          </p>
        </div>
      </div>

      {/* Recent submissions */}
      {submitted.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs animate-fade-in">
          <CheckCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Saved {submitted.length} sample{submitted.length > 1 ? 's' : ''} this session</p>
            {submitted.slice(-5).map((s, i) => <p key={i}>{s}</p>)}
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="card p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => i < step && setStep(i)}
                className={clsx('flex items-center gap-2', i < step ? 'cursor-pointer' : 'cursor-default')}>
                <span className={clsx(i === step ? 'step-active' : i < step ? 'step-complete' : 'step-inactive')}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className={clsx('text-xs font-semibold hidden sm:block',
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

      <div className="card p-6 space-y-6 animate-fade-in">

        {/* ── Step 0: Context & Basic Info ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Context &amp; Basic Information</h2>

            {/* Monitoring Context */}
            <div>
              <label className="label">Monitoring Context *</label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                {([
                  ['BATCH', 'Batch Monitoring', 'Tied to a production lot'],
                  ['ROUTINE_MONTHLY', 'Routine Monthly', 'ISO 8 and routine areas'],
                  ['OTHER', 'Other', 'Ad-hoc / non-standard'],
                ] as [MonitoringCtx, string, string][]).map(([val, label, sub]) => (
                  <button key={val} type="button"
                    onClick={() => { setCtx(val); setErrors({}); }}
                    className={clsx('p-3 rounded-xl border-2 text-left transition-all', ctx === val
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                    )}>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-[11px] text-surface-400 dark:text-surface-500 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* OTHER: reason + batch-linked */}
            {ctx === 'OTHER' && (
              <div className="space-y-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700">
                <div>
                  <label className="label" htmlFor="otherReason">Reason *</label>
                  <input id="otherReason" value={otherReason} onChange={e => setOtherReason(e.target.value)}
                    placeholder="Describe reason for this monitoring…"
                    className={clsx('input', errors.otherReason ? 'input-error' : '')} />
                  {errors.otherReason && <p className="mt-1 text-xs text-red-500">{errors.otherReason}</p>}
                </div>
                <div>
                  <label className="label">Associated with a Batch? *</label>
                  <div className="flex gap-4 mt-1">
                    {(['yes', 'no'] as const).map(v => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="otherBatch" value={v} checked={otherBatchLinked === v}
                          onChange={() => setOtherBatchLinked(v)} className="accent-brand-600" />
                        <span className="text-sm font-medium capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Lot Number */}
              {(ctx !== 'ROUTINE_MONTHLY') && (
                <div className={ctx === 'BATCH' || (ctx === 'OTHER' && otherBatchLinked === 'yes') ? '' : 'sm:col-span-1'}>
                  <label className="label">
                    Lot Number {lotRequired ? '*' : <span className="font-normal text-surface-400">(optional)</span>}
                  </label>
                  <LotCombobox
                    value={lotText}
                    lotId={lotId}
                    onChange={(text, id) => { setLotText(text); setLotId(id); if (text) setErrors(e => ({ ...e, lot: '' })); }}
                    required={lotRequired}
                    error={errors.lot}
                  />
                </div>
              )}

              {/* Sample Date */}
              <div>
                <label className="label" htmlFor="sampleDate">Sample Date *</label>
                <input id="sampleDate" type="date" value={sampleDate}
                  onChange={e => setSampleDate(e.target.value)}
                  className={clsx('input', errors.sampleDate ? 'input-error' : '')} />
                {errors.sampleDate && <p className="mt-1 text-xs text-red-500">{errors.sampleDate}</p>}
              </div>

              {/* Room / Area */}
              <div>
                <label className="label" htmlFor="roomArea">Room / Area <span className="font-normal text-surface-400">(optional)</span></label>
                <input id="roomArea" value={roomArea} onChange={e => setRoomArea(e.target.value)}
                  placeholder="e.g. ISO 7 Cleanroom, LFH Suite A"
                  className="input" />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Sample Measurements ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Sample Measurements</h2>
              <button type="button" onClick={addSample}
                className="btn-secondary text-sm flex items-center gap-1.5">
                <Plus size={14} /> Add Sample
              </button>
            </div>

            {ctx === 'BATCH' && lotText && (
              <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800 rounded-xl px-3 py-2">
                <span className="font-semibold text-brand-600 dark:text-brand-400">{lotText}</span>
                <span>·</span>
                <span>{sampleDate}</span>
                {roomArea && <><span>·</span><span>{roomArea}</span></>}
              </div>
            )}

            {samples.length === 0 && (
              <p className="text-sm text-surface-400 dark:text-surface-500 italic text-center py-6">
                No samples yet — click "Add Sample" to begin
              </p>
            )}

            <div className="space-y-4">
              {samples.map((s, idx) => {
                const t = PARTICLE_THRESHOLDS[s.iso_class as ViableISOClass];
                return (
                  <div key={s.id} className="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-4 bg-surface-50/50 dark:bg-surface-800/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-surface-500 uppercase tracking-wide">Sample {idx + 1}</p>
                      {samples.length > 1 && (
                        <button type="button" onClick={() => removeSample(s.id)}
                          className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* ISO Class */}
                      <div>
                        <label className="label" htmlFor={`iso_${s.id}`}>ISO Class *</label>
                        <select id={`iso_${s.id}`} value={s.iso_class}
                          onChange={e => updateSample(s.id, 'iso_class', e.target.value)} className="select">
                          <option value="ISO 5">ISO 5</option>
                          <option value="ISO 7">ISO 7</option>
                          <option value="ISO 8">ISO 8</option>
                        </select>
                      </div>
                      {/* Sample Type */}
                      <div>
                        <label className="label" htmlFor={`type_${s.id}`}>Sample Type *</label>
                        <select id={`type_${s.id}`} value={s.sample_type}
                          onChange={e => updateSample(s.id, 'sample_type', e.target.value)} className="select">
                          <option value="VIABLE_AIR">Viable Air (CFU)</option>
                          <option value="NONVIABLE_AIR">Non-Viable Air (Particles)</option>
                        </select>
                      </div>
                      {/* Location */}
                      <div>
                        <label className="label" htmlFor={`loc_${s.id}`}>Sample Location *</label>
                        <input id={`loc_${s.id}`} value={s.sample_location}
                          onChange={e => updateSample(s.id, 'sample_location', e.target.value)}
                          placeholder="e.g. LFH-1, Clean Bench"
                          className="input" />
                      </div>
                    </div>

                    {/* Measurements */}
                    {s.sample_type === 'VIABLE_AIR' ? (
                      <div className={clsx('p-3 rounded-xl border-2 transition-all max-w-xs',
                        s.cfu && evaluateCfuStatus(Number(s.cfu), s.iso_class as ViableISOClass) === 'action'
                          ? 'border-red-400 bg-red-50/60 dark:bg-red-900/10'
                          : s.cfu && evaluateCfuStatus(Number(s.cfu), s.iso_class as ViableISOClass) === 'alert'
                          ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/10'
                          : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800')}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="label mb-0 text-xs" htmlFor={`cfu_${s.id}`}>{s.iso_class} CFUs Found</label>
                          <CfuBadge val={s.cfu} iso={s.iso_class} />
                        </div>
                        <input id={`cfu_${s.id}`} type="number" min={0} step={1} value={s.cfu}
                          onChange={e => updateSample(s.id, 'cfu', e.target.value)}
                          placeholder="Leave blank if not collected"
                          className="input" />
                        {(() => { const lbl = getCfuThresholdLabel(s.iso_class as ViableISOClass); return (
                          <p className="mt-1 text-[11px] text-surface-400">{lbl.alertLabel} | {lbl.actionLabel}</p>
                        ); })()}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 max-w-lg">
                        <div className={clsx('p-3 rounded-xl border-2 transition-all',
                          s.particle_05um && Number(s.particle_05um) >= t.um05.action ? 'border-red-400 bg-red-50/60 dark:bg-red-900/10' :
                          s.particle_05um && Number(s.particle_05um) >= t.um05.alert  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/10' :
                          'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800')}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="label mb-0 text-xs" htmlFor={`p05_${s.id}`}>0.5 μm (p/m³)</label>
                            <ParticleBadge val={s.particle_05um} field="um05" iso={s.iso_class} />
                          </div>
                          <input id={`p05_${s.id}`} type="number" min={0} step={1} value={s.particle_05um}
                            onChange={e => updateSample(s.id, 'particle_05um', e.target.value)}
                            placeholder="Blank = not collected"
                            className="input" />
                          <p className="mt-1 text-[11px] text-surface-400">Alert ≥ {t.um05.alert.toLocaleString()} | Action ≥ {t.um05.action.toLocaleString()}</p>
                        </div>
                        <div className={clsx('p-3 rounded-xl border-2 transition-all',
                          s.particle_50um && Number(s.particle_50um) >= t.um50.action ? 'border-red-400 bg-red-50/60 dark:bg-red-900/10' :
                          s.particle_50um && Number(s.particle_50um) >= t.um50.alert  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/10' :
                          'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800')}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="label mb-0 text-xs" htmlFor={`p50_${s.id}`}>5.0 μm (p/m³)</label>
                            <ParticleBadge val={s.particle_50um} field="um50" iso={s.iso_class} />
                          </div>
                          <input id={`p50_${s.id}`} type="number" min={0} step={1} value={s.particle_50um}
                            onChange={e => updateSample(s.id, 'particle_50um', e.target.value)}
                            placeholder="Blank = not collected"
                            className="input" />
                          <p className="mt-1 text-[11px] text-surface-400">Alert ≥ {t.um50.alert.toLocaleString()} | Action ≥ {t.um50.action.toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Review & Save ── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Review &amp; Confirm</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                ['Context', ctx === 'BATCH' ? 'Batch Monitoring' : ctx === 'ROUTINE_MONTHLY' ? 'Routine Monthly' : 'Other'],
                ['Lot Number', lotText || '—'],
                ['Sample Date', sampleDate],
                ['Room / Area', roomArea || '—'],
                ['Samples', String(samples.length)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl p-3 bg-surface-50 dark:bg-surface-800">
                  <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide mb-0.5">{k}</p>
                  <p className="font-semibold text-surface-800 dark:text-surface-100">{v}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Samples to Save</p>
              {samples.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 text-sm">
                  <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400 w-5">{i + 1}</span>
                  <span className="font-semibold">{s.iso_class}</span>
                  <span className="text-surface-400">·</span>
                  <span>{s.sample_type === 'VIABLE_AIR' ? 'Viable Air' : 'Non-Viable Air'}</span>
                  <span className="text-surface-400">·</span>
                  <span className="text-surface-600 dark:text-surface-300">{s.sample_location || '—'}</span>
                  {s.sample_type === 'VIABLE_AIR' && s.cfu !== '' && (
                    <span className="ml-auto text-xs text-surface-500">{s.cfu} CFU</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-100 dark:border-surface-800">
          <button type="button" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn-secondary">
            <ChevronLeft size={16} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={handleNext} className="btn-primary">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" disabled={submitting} className="btn-success" onClick={onSubmit}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {submitting ? 'Saving…' : `Save ${samples.length} Sample${samples.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
