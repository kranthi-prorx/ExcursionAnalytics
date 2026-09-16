import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, ChevronLeft, Save, CheckCircle, AlertCircle, Wind, FlaskConical, MapPin, Plus, X, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';
import {
  envSessionsAPI, envSamplesAPI, profilesAPI,
} from '../lib/api';
import type { LotProfile } from '../lib/api';
import type {
  MonitoringContext, EnvSampleType, EnvISOClass, EnvLocationProfile,
  EnvMonitoringSession, EnvSample,
} from '../types';
import { MONITORING_CONTEXT_LABELS as CTX_LABELS, ENV_SAMPLE_TYPE_LABELS as TYPE_LABELS } from '../types';
import EnvLocationProfileSearch from '../components/EnvLocationProfileSearch';


// ── Threshold reference (mirrors backend, for display only) ──────────────────
const VIABLE_THRESHOLDS: Record<EnvISOClass, { alert: number | null; action: number }> = {
  'ISO 5': { alert: null, action: 1 },
  'ISO 7': { alert: 5,    action: 10 },
  'ISO 8': { alert: 50,   action: 100 },
};
const SURFACE_THRESHOLDS: Record<EnvISOClass, { alert: number | null; action: number }> = {
  'ISO 5': { alert: null, action: 1 },
  'ISO 7': { alert: 3,    action: 5 },
  'ISO 8': { alert: 25,   action: 50 },
};
const PARTICLE_0_5: Record<EnvISOClass, { alert: number; action: number }> = {
  'ISO 5': { alert: 3_000,       action: 3_520       },
  'ISO 7': { alert: 300_000,     action: 352_000     },
  'ISO 8': { alert: 3_000_000,   action: 3_520_000   },
};
const PARTICLE_5_0: Record<EnvISOClass, { alert: number; action: number }> = {
  'ISO 5': { alert: 20,     action: 29     },
  'ISO 7': { alert: 2_000,  action: 2_930  },
  'ISO 8': { alert: 20_000, action: 29_300 },
};

function getViableStatus(cfu: number | null, iso: EnvISOClass): 'NORMAL'|'ALERT'|'ACTION'|null {
  if (cfu === null) return null;
  const t = VIABLE_THRESHOLDS[iso];
  if (cfu >= t.action) return 'ACTION';
  if (t.alert !== null && cfu >= t.alert) return 'ALERT';
  return 'NORMAL';
}
function getSurfaceStatus(cfu: number | null, iso: EnvISOClass): 'NORMAL'|'ALERT'|'ACTION'|null {
  if (cfu === null) return null;
  const t = SURFACE_THRESHOLDS[iso];
  if (cfu >= t.action) return 'ACTION';
  if (t.alert !== null && cfu >= t.alert) return 'ALERT';
  return 'NORMAL';
}
function getParticleStatus(val: number | null, iso: EnvISOClass, size: '0_5'|'5_0'): 'NORMAL'|'ALERT'|'ACTION'|null {
  if (val === null) return null;
  const t = size === '0_5' ? PARTICLE_0_5[iso] : PARTICLE_5_0[iso];
  if (val >= t.action) return 'ACTION';
  if (val >= t.alert)  return 'ALERT';
  return 'NORMAL';
}

const STATUS_RING: Record<string, string> = {
  ACTION: 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15',
  ALERT:  'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/15',
  NORMAL: 'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50',
};
const STATUS_BADGE: Record<string, string> = {
  ACTION: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ALERT:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  NORMAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

// ── Sample draft (pre-submit state) ─────────────────────────────────────────
interface SampleDraft {
  id?: string;           // set after successful POST
  sampleType: EnvSampleType;
  isoClass: EnvISOClass;
  locationProfile: EnvLocationProfile | null;
  locationText: string;
  viableCfu: string;
  surfaceCfu: string;
  particle0_5: string;
  particle5_0: string;
  organism: string;
  deviationNumber: string;
  notes: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

const makeDraft = (type: EnvSampleType, iso: EnvISOClass): SampleDraft => ({
  sampleType: type, isoClass: iso,
  locationProfile: null, locationText: '',
  viableCfu: '', surfaceCfu: '', particle0_5: '', particle5_0: '',
  organism: '', deviationNumber: '', notes: '',
  saved: false, saving: false, error: null,
});

// ── STEPS ───────────────────────────────────────────────────────────────────
type Step = 0 | 1 | 2 | 3;
const STEPS = ['Monitoring Context', 'Location & Samples', 'Review', 'Done'];

// ── Lot search combobox ──────────────────────────────────────────────────────
function LotSearch({ value, onChange }: {
  value: LotProfile | null;
  onChange: (p: LotProfile | null) => void;
}) {
  const [q, setQ]       = useState('');
  const [opts, setOpts] = useState<LotProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await profilesAPI.searchLots(query);
      setOpts(res.data);
      setOpen(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!value) search(q); }, 250);
    return () => clearTimeout(t);
  }, [q, value, search]);

  const create = async () => {
    if (!q.trim()) return;
    setCreating(true);
    try {
      const res = await profilesAPI.createLot({ lot_number: q.trim() });
      onChange(res.data as LotProfile);
      setOpen(false);
    } catch (err: any) {
      // 409 = already exists, select it
      if (err?.response?.data?.existing) {
        onChange(err.response.data.existing as LotProfile);
        setOpen(false);
      } else {
        toast.error('Failed to create lot profile');
      }
    } finally { setCreating(false); }
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-brand-400 dark:border-brand-600 bg-brand-50/30 dark:bg-brand-900/15">
        <div className="flex-1">
          <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">{value.display_lot || (value as any).lot_number}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400">Lot Profile</p>
        </div>
        <button type="button" onClick={() => { onChange(null); setQ(''); }} className="text-xs text-surface-400 hover:text-red-500 transition-colors">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        type="text" value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { search(q); }}
        placeholder="Type lot number to search or create…"
        className="input"
      />
      {open && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 max-h-48 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl divide-y divide-surface-100 dark:divide-surface-800">
          {loading && <li className="px-3 py-2 text-xs text-surface-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching…</li>}
          {!loading && opts.length === 0 && q && (
            <li>
              <button type="button" disabled={creating} onClick={create}
                className="w-full text-left px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-sm transition-colors flex items-center gap-2 text-brand-600 dark:text-brand-400">
                <Plus size={14} />
                {creating ? 'Creating…' : `Create new lot "${q}"`}
              </button>
            </li>
          )}
          {opts.map(o => (
            <li key={o.id}>
              <button type="button" onClick={() => { onChange(o); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-sm font-medium text-surface-800 dark:text-surface-100 transition-colors">
                {o.display_lot || (o as any).lot_number}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function EnvSessionEntryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initType = searchParams.get('type') === 'surface' ? 'SURFACE' : 'AIR';

  // ── Step 0: Context selection ──
  const [monitoringType, setMonitoringType] = useState<'AIR' | 'SURFACE'>(initType as any);
  const [context, setContext]         = useState<MonitoringContext>('BATCH');
  const [lot, setLot]                 = useState<LotProfile | null>(null);
  const [roomOrArea, setRoomOrArea]   = useState('');
  const [customReason, setCustomReason] = useState('');
  const [lotForOther, setLotForOther] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');

  // ── Step 1: Samples ──
  const [session, setSession] = useState<EnvMonitoringSession | null>(null);
  const [samples, setSamples] = useState<SampleDraft[]>([]);
  const [step, setStep]       = useState<Step>(0);
  const [creating, setCreating] = useState(false);
  const [monitoringDate, setMonitoringDate] = useState(new Date().toISOString().slice(0, 10));

  // ── Step 3 (done) ──
  const [savedSessions, setSavedSessions] = useState<EnvMonitoringSession[]>([]);

  // ── Determine applicable ISO classes ──
  const airIsos: EnvISOClass[] = context === 'BATCH' ? ['ISO 5', 'ISO 7'] : ['ISO 5', 'ISO 7', 'ISO 8'];
  const sampleType: EnvSampleType =
    monitoringType === 'SURFACE' ? 'SURFACE' : 'VIABLE_AIR'; // default; user can add nonviable

  // ── Step 0: Create session on Next ──────────────────────────────────────────
  const createSession = async () => {
    // Validate
    if (context === 'BATCH' && !lot) {
      toast.error('Please select or create a lot number for Batch Monitoring');
      return;
    }
    if ((context === 'ROUTINE_MONTHLY' || context === 'ROUTINE_WEEKLY') && !roomOrArea.trim()) {
      toast.error('Room / Area is required for routine monitoring');
      return;
    }
    if (context === 'OTHER' && !customReason.trim()) {
      toast.error('A non-blank reason is required for Other monitoring');
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        monitoring_date:    monitoringDate,
        monitoring_context: context,
        room_or_area:       roomOrArea || null,
        batch_id:           (context === 'BATCH' || (context === 'OTHER' && lotForOther)) ? lot?.id : null,
        custom_reason:      context === 'OTHER' ? customReason : null,
        notes:              sessionNotes || null,
      };
      const res = await envSessionsAPI.create(payload);
      setSession(res.data);

      // Auto-generate starter drafts based on monitoring type
      if (monitoringType === 'AIR') {
        const isos = context === 'BATCH' ? ['ISO 5', 'ISO 7'] as EnvISOClass[] : ['ISO 5', 'ISO 7', 'ISO 8'] as EnvISOClass[];
        const drafts: SampleDraft[] = [];
        for (const iso of isos) {
          drafts.push(makeDraft('VIABLE_AIR', iso));
          drafts.push(makeDraft('NONVIABLE_AIR', iso));
        }
        setSamples(drafts);
      } else {
        setSamples([makeDraft('SURFACE', 'ISO 5')]);
      }

      setStep(1);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error('A session already exists for this context, date, and room/area. Use the existing session.');
      } else {
        toast.error(err?.response?.data?.message ?? 'Failed to create session');
      }
    } finally {
      setCreating(false);
    }
  };

  // ── Sample helpers ──────────────────────────────────────────────────────────
  const addDraft = (type: EnvSampleType, iso: EnvISOClass) => {
    setSamples(prev => [...prev, makeDraft(type, iso)]);
  };

  const removeDraft = (idx: number) => {
    setSamples(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDraft = (idx: number, patch: Partial<SampleDraft>) => {
    setSamples(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const saveSample = async (idx: number) => {
    if (!session) return;
    const d = samples[idx];
    updateDraft(idx, { saving: true, error: null });

    try {
      const payload: any = {
        session_id:          session.id,
        location_profile_id: d.locationProfile?.id || null,
        sample_location_text: d.locationText || null,
        sample_type:         d.sampleType,
        iso_class:           d.isoClass,
        viable_cfu:          d.sampleType === 'VIABLE_AIR'    ? (d.viableCfu  !== '' ? Number(d.viableCfu)  : null) : null,
        surface_cfu:         d.sampleType === 'SURFACE'       ? (d.surfaceCfu !== '' ? Number(d.surfaceCfu) : null) : null,
        particle_count_0_5:  d.sampleType === 'NONVIABLE_AIR' ? (d.particle0_5 !== '' ? Number(d.particle0_5) : null) : null,
        particle_count_5_0:  d.sampleType === 'NONVIABLE_AIR' ? (d.particle5_0 !== '' ? Number(d.particle5_0) : null) : null,
        organism_id:         d.organism || null,
        deviation_number:    d.deviationNumber || null,
        notes:               d.notes || null,
      };
      const res = await envSamplesAPI.create(payload);
      updateDraft(idx, { saved: true, saving: false, id: res.data.id });
    } catch (err: any) {
      updateDraft(idx, { saving: false, error: err?.response?.data?.message ?? 'Failed to save sample' });
    }
  };

  const saveAll = async () => {
    if (!session) return;
    const unsaved = samples.map((d, i) => ({ d, i })).filter(x => !x.d.saved);
    await Promise.all(unsaved.map(({ i }) => saveSample(i)));
    // Wait briefly then check if all saved
    setTimeout(() => {
      setSamples(prev => {
        if (prev.every(d => d.saved)) {
          toast.success('All samples saved!');
          setStep(2);
        }
        return prev;
      });
    }, 500);
  };

  const finishSession = () => {
    if (session) setSavedSessions(prev => [...prev, session]);
    setStep(3);
  };

  const startNew = () => {
    setSession(null);
    setSamples([]);
    setStep(0);
    setLot(null);
    setRoomOrArea('');
    setCustomReason('');
    setSessionNotes('');
    setMonitoringDate(new Date().toISOString().slice(0, 10));
  };

  // ── Sample card ────────────────────────────────────────────────────────────
  function SampleDraftCard({ d, idx }: { d: SampleDraft; idx: number }) {
    const isoStatusRing = () => {
      if (d.sampleType === 'VIABLE_AIR') {
        const s = getViableStatus(d.viableCfu !== '' ? Number(d.viableCfu) : null, d.isoClass);
        return s ? STATUS_RING[s] : STATUS_RING['NORMAL'];
      }
      if (d.sampleType === 'SURFACE') {
        const s = getSurfaceStatus(d.surfaceCfu !== '' ? Number(d.surfaceCfu) : null, d.isoClass);
        return s ? STATUS_RING[s] : STATUS_RING['NORMAL'];
      }
      const s05 = getParticleStatus(d.particle0_5 !== '' ? Number(d.particle0_5) : null, d.isoClass, '0_5');
      const s50 = getParticleStatus(d.particle5_0 !== '' ? Number(d.particle5_0) : null, d.isoClass, '5_0');
      const worst = s05 === 'ACTION' || s50 === 'ACTION' ? 'ACTION' : s05 === 'ALERT' || s50 === 'ALERT' ? 'ALERT' : s05 || s50 || 'NORMAL';
      return STATUS_RING[worst];
    };

    if (d.saved) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/15 text-sm">
          <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" />
          <span className="font-semibold text-green-700 dark:text-green-400">
            {TYPE_LABELS[d.sampleType]} — {d.isoClass}
          </span>
          <span className="ml-auto text-xs text-green-600 dark:text-green-500">Saved</span>
        </div>
      );
    }

    return (
      <div className={clsx('rounded-xl border-2 p-4 space-y-4 transition-all', isoStatusRing())}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              {d.isoClass}
            </span>
            <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
              {TYPE_LABELS[d.sampleType]}
            </span>
          </div>
          <button type="button" onClick={() => removeDraft(idx)}
            className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-red-500 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Location */}
        <div>
          <label className="label text-xs">Location Profile <span className="font-normal text-surface-400">(optional)</span></label>
          <EnvLocationProfileSearch
            value={d.locationProfile}
            onChange={lp => updateDraft(idx, { locationProfile: lp })}
            sampleType={d.sampleType}
            isoClass={d.isoClass}
            allowFreeform
            freeformValue={d.locationText}
            onFreeformChange={v => updateDraft(idx, { locationText: v })}
          />
        </div>

        {/* Measurement fields */}
        {d.sampleType === 'VIABLE_AIR' && (() => {
          const t = VIABLE_THRESHOLDS[d.isoClass];
          const val = d.viableCfu !== '' ? Number(d.viableCfu) : null;
          const st = getViableStatus(val, d.isoClass);
          return (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">CFU Count</label>
                {st && st !== 'NORMAL' && <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', STATUS_BADGE[st])}>⚠ {st}</span>}
              </div>
              <input type="number" min={0} step={1} value={d.viableCfu}
                onChange={e => updateDraft(idx, { viableCfu: e.target.value })}
                className="input" placeholder="Colony Forming Units" />
              <p className="mt-1 text-[11px] text-surface-400">
                {t.alert === null ? 'No Alert level' : `Alert ≥ ${t.alert}`} · Action ≥ {t.action} CFU
              </p>
            </div>
          );
        })()}

        {d.sampleType === 'NONVIABLE_AIR' && (() => {
          const t05 = PARTICLE_0_5[d.isoClass];
          const t50 = PARTICLE_5_0[d.isoClass];
          const v05 = d.particle0_5 !== '' ? Number(d.particle0_5) : null;
          const v50 = d.particle5_0 !== '' ? Number(d.particle5_0) : null;
          const s05 = getParticleStatus(v05, d.isoClass, '0_5');
          const s50 = getParticleStatus(v50, d.isoClass, '5_0');
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label text-xs mb-0">0.5 µm (p/m³)</label>
                  {s05 && s05 !== 'NORMAL' && <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', STATUS_BADGE[s05])}>⚠ {s05}</span>}
                </div>
                <input type="number" min={0} value={d.particle0_5}
                  onChange={e => updateDraft(idx, { particle0_5: e.target.value })}
                  className="input" placeholder="Count" />
                <p className="mt-1 text-[11px] text-surface-400">Alert ≥ {t05.alert.toLocaleString()} · Action ≥ {t05.action.toLocaleString()}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label text-xs mb-0">5.0 µm (p/m³)</label>
                  {s50 && s50 !== 'NORMAL' && <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', STATUS_BADGE[s50])}>⚠ {s50}</span>}
                </div>
                <input type="number" min={0} value={d.particle5_0}
                  onChange={e => updateDraft(idx, { particle5_0: e.target.value })}
                  className="input" placeholder="Count" />
                <p className="mt-1 text-[11px] text-surface-400">Alert ≥ {t50.alert.toLocaleString()} · Action ≥ {t50.action.toLocaleString()}</p>
              </div>
            </div>
          );
        })()}

        {d.sampleType === 'SURFACE' && (() => {
          const t = SURFACE_THRESHOLDS[d.isoClass];
          const val = d.surfaceCfu !== '' ? Number(d.surfaceCfu) : null;
          const st = getSurfaceStatus(val, d.isoClass);
          return (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">CFU Found</label>
                {st && st !== 'NORMAL' && <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', STATUS_BADGE[st])}>⚠ {st}</span>}
              </div>
              <input type="number" min={0} step={1} value={d.surfaceCfu}
                onChange={e => updateDraft(idx, { surfaceCfu: e.target.value })}
                className="input" placeholder="Colony Forming Units on surface" />
              <p className="mt-1 text-[11px] text-surface-400">
                {t.alert === null ? 'No Alert level' : `Alert ≥ ${t.alert}`} · Action ≥ {t.action} CFU
              </p>
              <div className="mt-3">
                <label className="label text-xs">Organism Identified <span className="font-normal text-surface-400">(optional)</span></label>
                <input type="text" value={d.organism}
                  onChange={e => updateDraft(idx, { organism: e.target.value })}
                  placeholder="e.g. Staphylococcus epidermidis" className="input" />
              </div>
            </div>
          );
        })()}

        {/* Optional metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-100 dark:border-surface-800">
          <div>
            <label className="label text-xs">Deviation # <span className="font-normal text-surface-400">(if applicable)</span></label>
            <input type="text" value={d.deviationNumber}
              onChange={e => updateDraft(idx, { deviationNumber: e.target.value })}
              placeholder="e.g. DEV-2026-17" className="input" />
          </div>
          <div>
            <label className="label text-xs">Notes</label>
            <input type="text" value={d.notes}
              onChange={e => updateDraft(idx, { notes: e.target.value })}
              placeholder="Optional notes…" className="input" />
          </div>
        </div>

        {d.error && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={12} /> {d.error}
          </div>
        )}

        <button type="button" onClick={() => saveSample(idx)}
          disabled={d.saving}
          className="btn-success w-full flex items-center justify-center gap-2">
          {d.saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {d.saving ? 'Saving…' : 'Save Sample'}
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/data-entry/environmental')} className="btn-ghost p-2 rounded-xl" title="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            Environmental Monitoring Entry
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            {monitoringType === 'AIR' ? 'Viable & Non-Viable Air' : 'Surface Sampling'} — multi-sample session
          </p>
        </div>
      </div>

      {/* Previous sessions */}
      {savedSessions.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs animate-fade-in">
          <CheckCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Saved {savedSessions.length} session{savedSessions.length > 1 ? 's' : ''} this session</p>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="card p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
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
              {i < STEPS.length - 1 && (
                <div className={clsx('w-8 h-0.5 rounded-full', i < step ? 'bg-success' : 'bg-surface-200 dark:bg-surface-700')} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-6 animate-fade-in">

        {/* ── Step 0: Context ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Monitoring Context</h2>

            {/* Monitoring type */}
            <div>
              <label className="label">Measurement Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {(['AIR', 'SURFACE'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setMonitoringType(t)}
                    className={clsx(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      monitoringType === t
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'
                    )}>
                    {t === 'AIR' ? <Wind size={18} className="text-brand-500 mb-2" /> : <MapPin size={18} className="text-emerald-500 mb-2" />}
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">{t === 'AIR' ? 'Air Monitoring' : 'Surface Sampling'}</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {t === 'AIR' ? 'Viable (CFU) + Non-Viable (particles)' : 'Surface swab / contact plate'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Context */}
            <div>
              <label className="label">Monitoring Context *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['BATCH', 'ROUTINE_MONTHLY', ...(monitoringType === 'SURFACE' ? ['ROUTINE_WEEKLY'] : []), 'OTHER'] as MonitoringContext[]).map(c => (
                  <button key={c} type="button"
                    onClick={() => setContext(c)}
                    className={clsx(
                      'p-3 rounded-xl border-2 text-left transition-all',
                      context === c
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'
                    )}>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">{CTX_LABELS[c]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="label" htmlFor="monitoring_date">Monitoring Date *</label>
              <input id="monitoring_date" type="date" value={monitoringDate}
                onChange={e => setMonitoringDate(e.target.value)}
                className="input max-w-xs" />
            </div>

            {/* Batch: lot required */}
            {context === 'BATCH' && (
              <div>
                <label className="label">Lot Number *</label>
                <LotSearch value={lot} onChange={setLot} />
              </div>
            )}

            {/* Routine: room required */}
            {(context === 'ROUTINE_MONTHLY' || context === 'ROUTINE_WEEKLY') && (
              <div>
                <label className="label" htmlFor="room_or_area">Room / Area *</label>
                <input id="room_or_area" type="text" value={roomOrArea}
                  onChange={e => setRoomOrArea(e.target.value)}
                  placeholder="e.g. Filling Room, ISO 8 Corridor" className="input" />
              </div>
            )}

            {/* Other: reason + optional lot */}
            {context === 'OTHER' && (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="custom_reason">Reason *</label>
                  <input id="custom_reason" type="text" value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                    placeholder="Describe the reason for this monitoring activity…" className="input" />
                  <p className="mt-1 text-xs text-surface-400">Required for Other context. Be specific.</p>
                </div>
                <div>
                  <label className="label" htmlFor="room_other">Room / Area <span className="font-normal text-surface-400">(optional)</span></label>
                  <input id="room_other" type="text" value={roomOrArea}
                    onChange={e => setRoomOrArea(e.target.value)}
                    placeholder="e.g. ISO 8 Corridor" className="input" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="lot_for_other" checked={lotForOther}
                    onChange={e => setLotForOther(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-300 text-brand-500" />
                  <label htmlFor="lot_for_other" className="text-sm text-surface-700 dark:text-surface-300 cursor-pointer">
                    Associate with a production lot?
                  </label>
                </div>
                {lotForOther && (
                  <LotSearch value={lot} onChange={setLot} />
                )}
              </div>
            )}

            {/* Session notes */}
            <div>
              <label className="label" htmlFor="session_notes">Session Notes <span className="font-normal text-surface-400">(optional)</span></label>
              <input id="session_notes" type="text" value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                placeholder="Any overall notes for this monitoring session…" className="input" />
            </div>
          </div>
        )}

        {/* ── Step 1: Samples ── */}
        {step === 1 && session && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Sample Results</h2>
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                samples.every(d => d.saved) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              )}>
                {samples.filter(d => d.saved).length}/{samples.length} saved
              </span>
            </div>

            {/* Sample list */}
            <div className="space-y-4">
              {samples.map((d, idx) => (
                <SampleDraftCard key={idx} d={d} idx={idx} />
              ))}
            </div>

            {/* Add more samples */}
            <div className="pt-2 border-t border-surface-100 dark:border-surface-800">
              <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 mb-2">Add another sample:</p>
              <div className="flex flex-wrap gap-2">
                {monitoringType === 'AIR' && (
                  <>
                    {(['ISO 5', 'ISO 7', 'ISO 8'] as EnvISOClass[]).map(iso => (
                      <button key={`va-${iso}`} type="button"
                        onClick={() => addDraft('VIABLE_AIR', iso)}
                        className="btn-ghost text-xs px-2 py-1.5 flex items-center gap-1">
                        <Plus size={12} /> Viable {iso}
                      </button>
                    ))}
                    {(['ISO 5', 'ISO 7', 'ISO 8'] as EnvISOClass[]).map(iso => (
                      <button key={`nv-${iso}`} type="button"
                        onClick={() => addDraft('NONVIABLE_AIR', iso)}
                        className="btn-ghost text-xs px-2 py-1.5 flex items-center gap-1">
                        <Plus size={12} /> Non-Viable {iso}
                      </button>
                    ))}
                  </>
                )}
                {monitoringType === 'SURFACE' && (
                  <>
                    {(['ISO 5', 'ISO 7', 'ISO 8'] as EnvISOClass[]).map(iso => (
                      <button key={`sf-${iso}`} type="button"
                        onClick={() => addDraft('SURFACE', iso)}
                        className="btn-ghost text-xs px-2 py-1.5 flex items-center gap-1">
                        <Plus size={12} /> Surface {iso}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && session && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">Review & Finish</h2>
            <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
              <div className="bg-surface-50 dark:bg-surface-800 px-4 py-2 text-[10px] font-bold text-surface-500 uppercase tracking-wide">Session Summary</div>
              <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="Date"    value={(() => { const [y,m,d] = session.monitoring_date.split('-'); return `${m}-${d}-${y}`; })()} />
                <Info label="Context" value={CTX_LABELS[session.monitoring_context]} />
                {session.room_or_area && <Info label="Room/Area" value={session.room_or_area} />}
                {session.lot_number   && <Info label="Lot"       value={session.lot_number} />}
              </div>
            </div>
            <div className="space-y-2">
              {samples.map((d, i) => (
                <div key={i} className={clsx(
                  'flex items-center gap-2 p-2.5 rounded-xl text-xs',
                  d.saved ? 'bg-green-50 dark:bg-green-900/15 text-green-700 dark:text-green-400' :
                  'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400'
                )}>
                  {d.saved ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                  <span className="font-semibold">{TYPE_LABELS[d.sampleType]} — {d.isoClass}</span>
                  <span className="ml-auto">{d.saved ? 'Saved' : 'Not saved'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <div className="text-center space-y-4 py-6">
            <CheckCircle size={48} className="mx-auto text-green-500" />
            <h2 className="text-xl font-bold text-surface-900 dark:text-white">Session Complete!</h2>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              All samples have been recorded and the session is saved.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button type="button" onClick={startNew} className="btn-primary">
                Start New Session
              </button>
              <button type="button" onClick={() => navigate('/env/analytics')} className="btn-secondary">
                View Analytics
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < 3 && (
          <div className="flex items-center justify-between pt-4 border-t border-surface-100 dark:border-surface-800">
            <button type="button" onClick={() => setStep(s => (s - 1) as Step)}
              disabled={step === 0}
              className="btn-secondary">
              <ChevronLeft size={16} /> Back
            </button>

            {step === 0 && (
              <button type="button" onClick={createSession} disabled={creating} className="btn-primary">
                {creating ? <Loader2 size={14} className="animate-spin" /> : null}
                {creating ? 'Creating…' : <>Next <ChevronRight size={16} /></>}
              </button>
            )}

            {step === 1 && (
              <div className="flex gap-2">
                <button type="button" onClick={saveAll}
                  disabled={samples.every(d => d.saved)}
                  className="btn-success flex items-center gap-1">
                  <Save size={14} /> Save All Unsaved
                </button>
                {samples.every(d => d.saved) && (
                  <button type="button" onClick={() => setStep(2)} className="btn-primary">
                    Review <ChevronRight size={16} />
                  </button>
                )}
              </div>
            )}

            {step === 2 && (
              <button type="button" onClick={finishSession} className="btn-success flex items-center gap-1">
                <CheckCircle size={14} /> Finish Session
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 bg-surface-50 dark:bg-surface-800">
      <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="font-semibold text-surface-800 dark:text-surface-100">{value || '—'}</p>
    </div>
  );
}
