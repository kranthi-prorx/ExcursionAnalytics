import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { recordsAPI, viableAPI, surfaceAPI } from '../lib/api';
import { queryCache } from '../lib/queryCache';
import type { ViableRecord, SurfaceRecord } from '../lib/api';
import type { ExcursionRecord } from '../types';
import { clsx } from '../lib/utils';

// ─── ISO class options ────────────────────────────────────────────────────────
const ISO_CLASSES = ['ISO 5', 'ISO 7', 'ISO 8'];

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type EditTarget =
  | { type: 'pm';      record: ExcursionRecord }
  | { type: 'viable';  record: ViableRecord    }
  | { type: 'surface'; record: SurfaceRecord   };

interface Props {
  target: EditTarget | null;
  onClose: () => void;
  onSaved: (type: 'pm' | 'viable' | 'surface', updated: any) => void;
}

// ─── PM Excursion form ────────────────────────────────────────────────────────
function PMForm({ record, onSaved, onClose }: { record: ExcursionRecord; onSaved: (u: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: record.name ?? '',
    lot_number: record.lot_number ?? '',
    job_function: record.job_function ?? '',
    personnel_type: record.personnel_type ?? '',
    iso_class: record.iso_class ?? 'ISO 7',
    alert_level: String(record.alert_level ?? 0),
    action_level: String(record.action_level ?? 0),
  });
  // Initialize hit_details from the record
  const [hitDetails, setHitDetails] = useState<Array<{
    id?: string | number; location: string; iso_class: string;
    hit_value: number; alert_level: number; action_level: number;
  }>>(
    (record.hit_details ?? []).map(hd => ({
      id: hd.id,
      location: hd.location,
      iso_class: hd.iso_class ?? 'ISO 7',
      hit_value: hd.hit_value ?? 0,
      alert_level: hd.alert_level ?? 0,
      action_level: hd.action_level ?? 4,
    }))
  );
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const setHitValue = (idx: number, value: number) => {
    setHitDetails(hd => hd.map((h, i) => i === idx ? { ...h, hit_value: value } : h));
  };

  const totalHits = hitDetails.reduce((sum, h) => sum + (h.hit_value ?? 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await recordsAPI.update(record.id, {
        ...form,
        alert_level: Number(form.alert_level),
        action_level: Number(form.action_level),
        hit_details: hitDetails,
      } as any);
      // Invalidate shared caches so all sessions see the updated record.
      queryCache.invalidate('dashboard:');
      queryCache.invalidate('analytics:');
      onSaved(res.data);
      toast.success('Record updated!');
      onClose();
    } catch { toast.error('Failed to update record'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Metadata fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Lot Number"><input className="input font-mono" value={form.lot_number} onChange={e => set('lot_number', e.target.value)} /></Field>
        <Field label="Personnel Type"><input className="input" value={form.personnel_type} onChange={e => set('personnel_type', e.target.value)} /></Field>
        <Field label="ISO Class">
          <select className="input" value={form.iso_class} onChange={e => set('iso_class', e.target.value)}>
            {ISO_CLASSES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {/* Hit Details Section */}
      {hitDetails.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Hit Values by Location</span>
            <span className={clsx(
              'text-xs font-bold px-2.5 py-0.5 rounded-full',
              totalHits > 0
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            )}>
              Total: {totalHits} hit{totalHits !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {hitDetails.map((hd, idx) => (
              <div key={hd.location} className={clsx(
                'rounded-xl border p-3 transition-all',
                hd.hit_value > 0 && hd.hit_value >= hd.action_level
                  ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                  : hd.hit_value > 0 && hd.hit_value >= hd.alert_level
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
                    : 'border-surface-200 dark:border-surface-700 bg-surface-50/30 dark:bg-surface-800/30'
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">{hd.location}</span>
                  <span className={hd.iso_class === 'ISO 5' ? 'badge-iso5 text-[9px]' : 'badge-iso7 text-[9px]'}>{hd.iso_class}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHitValue(idx, Math.max(0, hd.hit_value - 1))}
                    className="w-7 h-7 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600 flex items-center justify-center text-sm font-bold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    value={hd.hit_value}
                    onChange={e => setHitValue(idx, Math.max(0, parseInt(e.target.value) || 0))}
                    className="input text-center w-16 font-mono text-sm py-1"
                  />
                  <button
                    type="button"
                    onClick={() => setHitValue(idx, hd.hit_value + 1)}
                    className="w-7 h-7 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600 flex items-center justify-center text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2 pt-2 border-t border-surface-100 dark:border-surface-800">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
        </button>
      </div>
    </div>
  );
}

// ─── Viable form ──────────────────────────────────────────────────────────────
function ViableForm({ record, onSaved, onClose }: { record: ViableRecord; onSaved: (u: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    lot_number:       record.lot_number ?? '',
    sample_date:      String(record.sample_date ?? '').slice(0, 10),
    iso_class:        record.iso_class ?? 'ISO 7',
    room_number:      record.room_number ?? '',
    iso5_cfu:         String(record.iso5_cfu ?? 0),
    iso7_cfu:         String(record.iso7_cfu ?? 0),
    iso8_cfu:         String(record.iso8_cfu ?? 0),
    particle_05um:    String(record.particle_05um ?? 0),
    particle_50um:    String(record.particle_50um ?? 0),
    deviation_number: record.deviation_number ?? '',
    notes:            record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Determine active CFU field based on ISO class
  const cfuFieldMap: Record<string, { field: 'iso5_cfu' | 'iso7_cfu' | 'iso8_cfu'; label: string }> = {
    'ISO 5': { field: 'iso5_cfu', label: 'ISO 5 CFU' },
    'ISO 7': { field: 'iso7_cfu', label: 'ISO 7 CFU' },
    'ISO 8': { field: 'iso8_cfu', label: 'ISO 8 CFU' },
  };
  const activeField = cfuFieldMap[form.iso_class] ?? cfuFieldMap['ISO 7'];

  const save = async () => {
    setSaving(true);
    try {
      const res = await viableAPI.update(record.id, {
        ...form,
        iso5_cfu:      Number(form.iso5_cfu),
        iso7_cfu:      Number(form.iso7_cfu),
        iso8_cfu:      Number(form.iso8_cfu),
        particle_05um: Number(form.particle_05um),
        particle_50um: Number(form.particle_50um),
      });
      onSaved(res.data);
      toast.success('Viable record updated!');
      onClose();
    } catch { toast.error('Failed to update record'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Lot Number"><input className="input font-mono" value={form.lot_number} onChange={e => set('lot_number', e.target.value)} /></Field>
      <Field label="Sample Date"><input type="date" className="input" value={form.sample_date} onChange={e => set('sample_date', e.target.value)} /></Field>
      <Field label="ISO Class">
        <select className="input" value={form.iso_class} onChange={e => set('iso_class', e.target.value)}>
          {ISO_CLASSES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Room Number">
        <input className="input" placeholder="e.g. Room 101" value={form.room_number} onChange={e => set('room_number', e.target.value)} />
      </Field>
      <Field label={activeField.label}><input type="number" className="input" value={form[activeField.field]} onChange={e => set(activeField.field, e.target.value)} /></Field>
      <Field label="0.5 μm Particle Count"><input type="number" className="input" value={form.particle_05um} onChange={e => set('particle_05um', e.target.value)} /></Field>
      <Field label="5.0 μm Particle Count"><input type="number" className="input" value={form.particle_50um} onChange={e => set('particle_50um', e.target.value)} /></Field>
      <Field label="Deviation Number"><input className="input" value={form.deviation_number} onChange={e => set('deviation_number', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
        </button>
      </div>
    </div>
  );
}

// ─── Surface form ─────────────────────────────────────────────────────────────
function SurfaceForm({ record, onSaved, onClose }: { record: SurfaceRecord; onSaved: (u: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    sample_location:  record.sample_location ?? '',
    lot_number:       record.lot_number ?? '',
    sample_date:      String(record.sample_date ?? '').slice(0, 10),
    iso_class:        record.iso_class ?? 'ISO 7',
    cfu_found:        String(record.cfu_found ?? 0),
    organism_id:      record.organism_id ?? '',
    deviation_number: record.deviation_number ?? '',
    notes:            record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await surfaceAPI.update(record.id, {
        ...form,
        cfu_found: Number(form.cfu_found),
      });
      onSaved(res.data);
      toast.success('Surface record updated!');
      onClose();
    } catch { toast.error('Failed to update record'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Sample Location"><input className="input" value={form.sample_location} onChange={e => set('sample_location', e.target.value)} /></Field>
      <Field label="Lot Number"><input className="input font-mono" value={form.lot_number} onChange={e => set('lot_number', e.target.value)} /></Field>
      <Field label="Sample Date"><input type="date" className="input" value={form.sample_date} onChange={e => set('sample_date', e.target.value)} /></Field>
      <Field label="ISO Class">
        <select className="input" value={form.iso_class} onChange={e => set('iso_class', e.target.value)}>
          {ISO_CLASSES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="CFUs Found"><input type="number" className="input" value={form.cfu_found} onChange={e => set('cfu_found', e.target.value)} /></Field>
      <Field label="Organism ID"><input className="input" value={form.organism_id} onChange={e => set('organism_id', e.target.value)} /></Field>
      <Field label="Deviation Number"><input className="input" value={form.deviation_number} onChange={e => set('deviation_number', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
        </button>
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
const TITLES = { pm: 'Edit PM Excursion Record', viable: 'Edit Viable / Non-Viable Record', surface: 'Edit Surface Sampling Record' };

export default function EditRecordModal({ target, onClose, onSaved }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!target) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className={clsx(
          'pointer-events-auto w-full bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-100 dark:border-surface-800 animate-fade-in max-h-[90vh] flex flex-col',
          target.type === 'pm' ? 'max-w-2xl' : 'max-w-xl'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-800">
            <div>
              <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-widest">Editing</p>
              <h2 className="text-base font-bold text-surface-900 dark:text-white">{TITLES[target.type]}</h2>
            </div>
            <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200">
              <X size={16} />
            </button>
          </div>

          {/* Form body */}
          <div className="px-6 py-5 overflow-y-auto">
            {target.type === 'pm'      && <PMForm      record={target.record} onSaved={u => onSaved('pm', u)}      onClose={onClose} />}
            {target.type === 'viable'  && <ViableForm  record={target.record} onSaved={u => onSaved('viable', u)}  onClose={onClose} />}
            {target.type === 'surface' && <SurfaceForm record={target.record} onSaved={u => onSaved('surface', u)} onClose={onClose} />}
          </div>
        </div>
      </div>
    </>
  );
}
