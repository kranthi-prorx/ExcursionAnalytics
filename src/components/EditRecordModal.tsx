import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { recordsAPI, viableAPI, surfaceAPI } from '../lib/api';
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
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await recordsAPI.update(record.id, {
        ...form,
        alert_level: Number(form.alert_level),
        action_level: Number(form.action_level),
      });
      onSaved(res.data);
      toast.success('Record updated!');
      onClose();
    } catch { toast.error('Failed to update record'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Name"><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Lot Number"><input className="input font-mono" value={form.lot_number} onChange={e => set('lot_number', e.target.value)} /></Field>
      <Field label="Job Function"><input className="input" value={form.job_function} onChange={e => set('job_function', e.target.value)} /></Field>
      <Field label="Personnel Type"><input className="input" value={form.personnel_type} onChange={e => set('personnel_type', e.target.value)} /></Field>
      <Field label="ISO Class">
        <select className="input" value={form.iso_class} onChange={e => set('iso_class', e.target.value)}>
          {ISO_CLASSES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Alert Level"><input type="number" className="input" value={form.alert_level} onChange={e => set('alert_level', e.target.value)} /></Field>
      <Field label="Action Level"><input type="number" className="input" value={form.action_level} onChange={e => set('action_level', e.target.value)} /></Field>
      <div className="col-span-2 flex justify-end gap-2 pt-2">
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
    particle_05um:    String(record.particle_05um ?? 0),
    particle_50um:    String(record.particle_50um ?? 0),
    deviation_number: record.deviation_number ?? '',
    notes:            record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await viableAPI.update(record.id, {
        ...form,
        iso5_cfu:     Number(form.iso5_cfu),
        iso7_cfu:     Number(form.iso7_cfu),
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
      <Field label="ISO 5 CFU"><input type="number" className="input" value={form.iso5_cfu} onChange={e => set('iso5_cfu', e.target.value)} /></Field>
      <Field label="ISO 7 CFU"><input type="number" className="input" value={form.iso7_cfu} onChange={e => set('iso7_cfu', e.target.value)} /></Field>
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
        <div className="pointer-events-auto w-full max-w-xl bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-100 dark:border-surface-800 animate-fade-in">
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
          <div className="px-6 py-5">
            {target.type === 'pm'      && <PMForm      record={target.record} onSaved={u => onSaved('pm', u)}      onClose={onClose} />}
            {target.type === 'viable'  && <ViableForm  record={target.record} onSaved={u => onSaved('viable', u)}  onClose={onClose} />}
            {target.type === 'surface' && <SurfaceForm record={target.record} onSaved={u => onSaved('surface', u)} onClose={onClose} />}
          </div>
        </div>
      </div>
    </>
  );
}
