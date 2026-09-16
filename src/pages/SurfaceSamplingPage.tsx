import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, ChevronRight, ChevronLeft, Loader2, Search, X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';
import api, { profilesAPI } from '../lib/api';
import type { LotProfile } from '../lib/api';
import { queryCache } from '../lib/queryCache';

// ─── Types ─────────────────────────────────────────────────────────────────────
type MonitoringCtx = 'BATCH' | 'ROUTINE_WEEKLY' | 'OTHER';

// ─── Surface CFU thresholds ───────────────────────────────────────────────────
const SURFACE_THRESHOLDS: Record<string, { alert: number | null; action: number }> = {
  'ISO 5': { alert: null, action: 1 },
  'ISO 7': { alert: 3,    action: 5 },
  'ISO 8': { alert: 25,   action: 50 },
};

function SurfaceBadge({ val, iso }: { val: string; iso: string }) {
  const n = Number(val);
  if (!val || isNaN(n)) return null;
  const t = SURFACE_THRESHOLDS[iso];
  if (!t) return null;
  if (n >= t.action) return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">⚠ Action</span>;
  if (t.alert !== null && n >= t.alert) return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">⚠ Alert</span>;
  return null;
}

// ─── Lot Combobox (shared pattern with ViableDataEntryPage) ──────────────────
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
const STEPS = ['Context & Sample Info', 'Results', 'Notes & Review'];

const defaultValues = {
  sample_location: '',
  sample_date: new Date().toISOString().slice(0, 10),
  iso_class: 'ISO 7' as string,
  cfu_found: '',
  organism_id: '',
  deviation_number: '',
  notes: '',
};

export default function SurfaceSamplingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>([]);

  // Context & info
  const [ctx, setCtx] = useState<MonitoringCtx>('BATCH');
  const [lotText, setLotText] = useState('');
  const [lotId, setLotId] = useState<string | null>(null);
  const [sampleDate, setSampleDate] = useState(defaultValues.sample_date);
  const [roomArea, setRoomArea] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [otherBatchLinked, setOtherBatchLinked] = useState<'yes' | 'no'>('no');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sample details
  const [sampleLocation, setSampleLocation] = useState('');
  const [isoClass, setIsoClass] = useState('ISO 7');
  const [cfuFound, setCfuFound] = useState('');
  const [organismId, setOrganismId] = useState('');
  const [deviationNumber, setDeviationNumber] = useState('');
  const [notes, setNotes] = useState('');

  const lotRequired = ctx === 'BATCH' || (ctx === 'OTHER' && otherBatchLinked === 'yes');

  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!sampleDate) e.sampleDate = 'Sample date is required';
    if (lotRequired && !lotText) e.lot = `Lot number is required for ${ctx === 'BATCH' ? 'Batch' : 'batch-associated'} monitoring`;
    if (!sampleLocation.trim()) e.sampleLocation = 'Sample location is required';
    if (ctx === 'OTHER' && !otherReason.trim()) e.otherReason = 'Reason is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep0()) return;
    setStep(s => s + 1);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const lotNumberForBatch = lotRequired ? lotText : null;
      const lotIdForBatch = lotRequired ? lotId : null;

      const payload = {
        monitoring_context: ctx,
        lot_number: lotNumberForBatch || null,
        lot_id: lotIdForBatch || null,
        sample_location: sampleLocation,
        sample_date: sampleDate,
        iso_class: isoClass,
        room_area: roomArea || null,
        cfu_found: cfuFound !== '' ? Number(cfuFound) : null,
        organism_id: organismId || null,
        deviation_number: deviationNumber || null,
        notes: ctx === 'OTHER' ? `Reason: ${otherReason}${notes ? ' | ' + notes : ''}` : (notes || null),
      };

      await api.post('/surface', payload);
      queryCache.invalidate('surface:');
      queryCache.invalidate('analytics:');
      setSubmitted(prev => [...prev, `${sampleLocation} / ${lotText || 'No lot'} (${isoClass})`]);
      toast.success('Surface sample saved!');

      // Reset sample-level fields, keep context + date
      setSampleLocation('');
      setCfuFound('');
      setOrganismId('');
      setDeviationNumber('');
      setNotes('');
      setStep(0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save entry');
    } finally { setSubmitting(false); }
  };

  const t = SURFACE_THRESHOLDS[isoClass] || { alert: null, action: 1 };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/data-entry')} className="btn-ghost p-2 rounded-xl" title="Back to Data Entry">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Surface Sampling Entry</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Log surface swab and contact plate results — batch, routine, or other
          </p>
        </div>
      </div>

      {/* Recent submissions */}
      {submitted.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs animate-fade-in">
          <CheckCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Saved {submitted.length} entr{submitted.length > 1 ? 'ies' : 'y'} this session</p>
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

        {/* ── Step 0: Context & Sample Info ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Context &amp; Sample Information</h2>

            {/* Monitoring Context */}
            <div>
              <label className="label">Monitoring Context *</label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                {([
                  ['BATCH', 'Batch Monitoring', 'Tied to a production lot'],
                  ['ROUTINE_WEEKLY', 'Routine Weekly', 'Scheduled weekly surface'],
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

            {/* OTHER options */}
            {ctx === 'OTHER' && (
              <div className="space-y-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700">
                <div>
                  <label className="label" htmlFor="otherReason">Reason *</label>
                  <input id="otherReason" value={otherReason} onChange={e => setOtherReason(e.target.value)}
                    placeholder="Describe reason for this monitoring activity…"
                    className={clsx('input', errors.otherReason ? 'input-error' : '')} />
                  {errors.otherReason && <p className="mt-1 text-xs text-red-500">{errors.otherReason}</p>}
                </div>
                <div>
                  <label className="label">Associated with a Batch?</label>
                  <div className="flex gap-4 mt-1">
                    {(['yes', 'no'] as const).map(v => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="otherBatchSurface" value={v} checked={otherBatchLinked === v}
                          onChange={() => setOtherBatchLinked(v)} className="accent-brand-600" />
                        <span className="text-sm font-medium capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Lot Number — only for BATCH or OTHER+batch-linked */}
              {(ctx !== 'ROUTINE_WEEKLY') && (
                <div>
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
                  placeholder="e.g. Filling Suite, ISO 8 Gowning"
                  className="input" />
              </div>

              {/* ISO Class */}
              <div>
                <label className="label" htmlFor="isoClass">ISO Class *</label>
                <select id="isoClass" value={isoClass} onChange={e => setIsoClass(e.target.value)} className="select">
                  <option value="ISO 5">ISO 5</option>
                  <option value="ISO 7">ISO 7</option>
                  <option value="ISO 8">ISO 8</option>
                </select>
              </div>

              {/* Sample Location */}
              <div className="sm:col-span-2">
                <label className="label" htmlFor="sampleLocation">Sample Location *</label>
                <input id="sampleLocation" value={sampleLocation} onChange={e => setSampleLocation(e.target.value)}
                  placeholder="e.g. Filling Room Floor, LAF Unit Surface, Door Handle"
                  className={clsx('input', errors.sampleLocation ? 'input-error' : '')} />
                {errors.sampleLocation && <p className="mt-1 text-xs text-red-500">{errors.sampleLocation}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Results ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Sampling Results</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">{isoClass}</span>
            </div>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Enter the colony count and organism identification if applicable.
            </p>

            {/* Threshold reference */}
            <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden text-xs">
              <div className="grid grid-cols-3 bg-surface-50 dark:bg-surface-800 px-3 py-2 font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                <span>ISO Class</span>
                <span className="text-amber-600 dark:text-amber-400">Alert Level</span>
                <span className="text-red-600 dark:text-red-400">Action Level</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2 border-t border-surface-100 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                <span className="font-medium">{isoClass} Surface CFU</span>
                <span className={t.alert === null ? 'text-surface-400 italic' : ''}>{t.alert === null ? 'N/A' : `≥ ${t.alert}`}</span>
                <span>≥ {t.action}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className={clsx('p-4 rounded-xl border-2 transition-all',
                cfuFound && Number(cfuFound) >= t.action ? 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15' :
                cfuFound && t.alert !== null && Number(cfuFound) >= t.alert ? 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/15' :
                'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50')}>
                <div className="flex items-center justify-between mb-2">
                  <label className="label" htmlFor="cfuFound">CFUs Found</label>
                  <SurfaceBadge val={cfuFound} iso={isoClass} />
                </div>
                <input id="cfuFound" type="number" min={0} step={1} value={cfuFound}
                  onChange={e => setCfuFound(e.target.value)}
                  placeholder="Leave blank if not collected"
                  className="input mt-2" />
                <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">Colony Forming Units on surface sample</p>
              </div>
              <div className="p-4 rounded-xl border-2 border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
                <label className="label" htmlFor="organism_id">Organism Identified <span className="font-normal text-surface-400">(optional)</span></label>
                <input id="organism_id" value={organismId} onChange={e => setOrganismId(e.target.value)}
                  placeholder="e.g. Staphylococcus epidermidis"
                  className="input mt-2" />
                <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">Microorganism species if identified</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Notes & Review ── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Deviation, Notes &amp; Review</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="label" htmlFor="deviation_number">Deviation Number <span className="font-normal text-surface-400">(if applicable)</span></label>
                <input id="deviation_number" value={deviationNumber} onChange={e => setDeviationNumber(e.target.value)}
                  placeholder="e.g. DEV-2026-17" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="notes">Notes</label>
                <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
                  rows={3} placeholder="Any additional observations…" className="input resize-none" />
              </div>
            </div>

            {/* Review summary */}
            <div>
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  ['Context', ctx === 'BATCH' ? 'Batch Monitoring' : ctx === 'ROUTINE_WEEKLY' ? 'Routine Weekly' : 'Other'],
                  ['Lot Number', lotText || '—'],
                  ['Sample Date', sampleDate],
                  ['Room / Area', roomArea || '—'],
                  ['ISO Class', isoClass],
                  ['Sample Location', sampleLocation],
                  ['CFUs Found', cfuFound || '—'],
                  ['Organism', organismId || '—'],
                  ['Deviation #', deviationNumber || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-3 bg-surface-50 dark:bg-surface-800">
                    <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="font-semibold text-surface-800 dark:text-surface-100 break-words">{v || '—'}</p>
                  </div>
                ))}
              </div>
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
              {submitting ? 'Saving…' : 'Save Entry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
