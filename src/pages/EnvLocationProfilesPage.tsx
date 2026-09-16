import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings, Plus, Search, RefreshCw, CheckCircle, XCircle, Pencil,
  AlertCircle, Loader2, ArrowLeft, MapPin, PowerOff, Power,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from '../lib/utils';
import { envLocationProfilesAPI } from '../lib/api';
import type { EnvLocationProfile, EnvISOClass, EnvSampleType, MonitoringContext } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ISO_COLOR: Record<string, string> = {
  'ISO 5': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'ISO 7': 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  'ISO 8': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};
const TYPE_LABELS: Record<string, string> = {
  VIABLE_AIR: 'Viable Air', NONVIABLE_AIR: 'Non-Viable Air', SURFACE: 'Surface',
};
const CTX_LABELS: Record<string, string> = {
  BATCH: 'Batch', ROUTINE_MONTHLY: 'Monthly', ROUTINE_WEEKLY: 'Weekly', OTHER: 'Other',
};

// ── Profile Form Modal ──────────────────────────────────────────────────────────
interface FormData {
  location_code: string;
  display_name: string;
  room_or_area: string;
  iso_class: EnvISOClass;
  allowed_sample_types: EnvSampleType[];
  allowed_contexts: MonitoringContext[];
  frequency: string;
  notes: string;
}

const defaultForm: FormData = {
  location_code: '',
  display_name: '',
  room_or_area: '',
  iso_class: 'ISO 7',
  allowed_sample_types: ['VIABLE_AIR', 'NONVIABLE_AIR'],
  allowed_contexts: ['BATCH', 'ROUTINE_MONTHLY', 'OTHER'],
  frequency: '',
  notes: '',
};

function toggleArr<T extends string>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

function ProfileFormModal({
  initial, onSave, onClose,
}: {
  initial: FormData | null;
  onSave: (data: FormData, id?: string) => Promise<void>;
  onClose: () => void;
  editId?: string;
}) {
  const [form, setForm] = useState<FormData>(initial ?? defaultForm);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initial);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.location_code.trim() || !form.display_name.trim() || !form.room_or_area.trim()) {
      toast.error('Location code, display name, and room/area are required');
      return;
    }
    if (form.allowed_sample_types.length === 0) {
      toast.error('At least one sample type must be selected');
      return;
    }
    if (form.allowed_contexts.length === 0) {
      toast.error('At least one monitoring context must be selected');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-700 shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-800">
          <h2 className="text-base font-bold text-surface-900 dark:text-white">
            {isEdit ? 'Edit Location Profile' : 'New Location Profile'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-xl"><XCircle size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-5 max-h-[70vh] overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="location_code">Location Code *</label>
              <input id="location_code" value={form.location_code}
                onChange={e => setForm(f => ({ ...f, location_code: e.target.value }))}
                placeholder="e.g. FA-ISO5-L1" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="display_name">Display Name *</label>
              <input id="display_name" value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="e.g. Filling Area — ISO 5 Left" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="room_or_area">Room / Area *</label>
              <input id="room_or_area" value={form.room_or_area}
                onChange={e => setForm(f => ({ ...f, room_or_area: e.target.value }))}
                placeholder="e.g. Filling Room" className="input" />
            </div>
            <div>
              <label className="label">ISO Class *</label>
              <select value={form.iso_class}
                onChange={e => setForm(f => ({ ...f, iso_class: e.target.value as EnvISOClass }))}
                className="select">
                <option value="ISO 5">ISO 5</option>
                <option value="ISO 7">ISO 7</option>
                <option value="ISO 8">ISO 8</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Allowed Sample Types *</label>
            <div className="flex flex-wrap gap-2">
              {(['VIABLE_AIR', 'NONVIABLE_AIR', 'SURFACE'] as EnvSampleType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, allowed_sample_types: toggleArr(f.allowed_sample_types, t) }))}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                    form.allowed_sample_types.includes(t)
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-surface-200 dark:border-surface-700 text-surface-500'
                  )}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Allowed Monitoring Contexts *</label>
            <div className="flex flex-wrap gap-2">
              {(['BATCH', 'ROUTINE_MONTHLY', 'ROUTINE_WEEKLY', 'OTHER'] as MonitoringContext[]).map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, allowed_contexts: toggleArr(f.allowed_contexts, c) }))}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                    form.allowed_contexts.includes(c)
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-surface-200 dark:border-surface-700 text-surface-500'
                  )}>
                  {CTX_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="frequency">Frequency <span className="font-normal text-surface-400">(optional)</span></label>
              <input id="frequency" value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                placeholder="e.g. Monthly, Batch, Weekly" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="notes">Notes <span className="font-normal text-surface-400">(optional)</span></label>
              <input id="notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional information…" className="input" />
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 p-5 border-t border-surface-100 dark:border-surface-800">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Profile')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function EnvLocationProfilesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const [profiles, setProfiles] = useState<EnvLocationProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Filters
  const [q, setQ]                   = useState('');
  const [filterIso, setFilterIso]   = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editProfile, setEditProfile] = useState<EnvLocationProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (q)           params.q        = q;
      if (filterIso)   params.iso_class = filterIso;
      if (filterActive === 'active')   params.active = true;
      if (filterActive === 'inactive') params.active = false;
      const res = await envLocationProfilesAPI.search(params);
      setProfiles(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [q, filterIso, filterActive]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form: FormData) => {
    try {
      await envLocationProfilesAPI.create({
        location_code: form.location_code.trim(),
        display_name:  form.display_name.trim(),
        room_or_area:  form.room_or_area.trim(),
        iso_class:     form.iso_class,
        allowed_sample_types: form.allowed_sample_types,
        allowed_contexts:     form.allowed_contexts,
        frequency: form.frequency || undefined,
        notes:     form.notes || undefined,
      });
      toast.success('Location profile created');
      setShowCreate(false);
      load();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(err.response.data.message || 'A profile with this code already exists');
      } else {
        toast.error(err?.response?.data?.message ?? 'Failed to create profile');
      }
      throw err; // prevent modal close
    }
  };

  const handleUpdate = async (form: FormData) => {
    if (!editProfile) return;
    try {
      await envLocationProfilesAPI.update(editProfile.id, {
        location_code: form.location_code.trim(),
        display_name:  form.display_name.trim(),
        room_or_area:  form.room_or_area.trim(),
        iso_class:     form.iso_class,
        allowed_sample_types: form.allowed_sample_types,
        allowed_contexts:     form.allowed_contexts,
        frequency: form.frequency || undefined,
        notes:     form.notes || undefined,
      });
      toast.success('Profile updated');
      setEditProfile(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to update profile');
      throw err;
    }
  };

  const handleDeactivate = async (profile: EnvLocationProfile) => {
    try {
      await envLocationProfilesAPI.deactivate(profile.id);
      toast.success(`"${profile.location_code}" deactivated`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to deactivate');
    }
  };

  const handleReactivate = async (profile: EnvLocationProfile) => {
    try {
      await envLocationProfilesAPI.reactivate(profile.id);
      toast.success(`"${profile.location_code}" reactivated`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to reactivate');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/data-entry/environmental')} className="btn-ghost p-2 rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
              <Settings size={22} className="text-brand-500" />
              Location Profiles
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              Manage reusable sample location profiles for environmental monitoring
            </p>
          </div>
        </div>
        {isAdminOrManager && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Profile
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search code, name, area…" className="input pl-9" />
        </div>
        <select value={filterIso} onChange={e => setFilterIso(e.target.value)} className="select w-auto">
          <option value="">All ISO Classes</option>
          <option value="ISO 5">ISO 5</option>
          <option value="ISO 7">ISO 7</option>
          <option value="ISO 8">ISO 8</option>
        </select>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)} className="select w-auto">
          <option value="all">All</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button onClick={load} className="btn-ghost p-2 rounded-xl" title="Refresh"><RefreshCw size={16} /></button>
      </div>

      {/* Table / list */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-500" />
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {!loading && !error && profiles.length === 0 && (
        <div className="card p-8 text-center">
          <MapPin size={32} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
          <p className="text-sm text-surface-500 dark:text-surface-400">No location profiles found</p>
          {isAdminOrManager && (
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
              <Plus size={14} /> Create First Profile
            </button>
          )}
        </div>
      )}
      {!loading && profiles.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 dark:bg-surface-800 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name / Room</th>
                  <th className="px-4 py-3">ISO</th>
                  <th className="px-4 py-3">Sample Types</th>
                  <th className="px-4 py-3">Contexts</th>
                  <th className="px-4 py-3">Status</th>
                  {isAdminOrManager && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                {profiles.map(p => (
                  <tr key={p.id} className={clsx(
                    'hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors',
                    !p.active && 'opacity-60'
                  )}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-surface-800 dark:text-surface-100 whitespace-nowrap">
                      {p.location_code}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-surface-800 dark:text-surface-100 text-xs">{p.display_name}</p>
                      <p className="text-surface-400 dark:text-surface-500 text-[11px]">{p.room_or_area}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', ISO_COLOR[p.iso_class])}>
                        {p.iso_class}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.allowed_sample_types.map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
                            {TYPE_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.allowed_contexts.map(c => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400">
                            {CTX_LABELS[c] || c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.active
                        ? <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-semibold"><CheckCircle size={12} /> Active</span>
                        : <span className="flex items-center gap-1 text-[11px] text-surface-400 font-semibold"><XCircle size={12} /> Inactive</span>
                      }
                    </td>
                    {isAdminOrManager && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditProfile(p)}
                            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-500 transition-colors"
                            title="Edit">
                            <Pencil size={13} />
                          </button>
                          {p.active ? (
                            <button onClick={() => handleDeactivate(p)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500 transition-colors"
                              title="Deactivate">
                              <PowerOff size={13} />
                            </button>
                          ) : (
                            <button onClick={() => handleReactivate(p)}
                              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-surface-400 hover:text-green-500 transition-colors"
                              title="Reactivate">
                              <Power size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <ProfileFormModal
          initial={null}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editProfile && (
        <ProfileFormModal
          initial={{
            location_code: editProfile.location_code,
            display_name:  editProfile.display_name,
            room_or_area:  editProfile.room_or_area,
            iso_class:     editProfile.iso_class,
            allowed_sample_types: editProfile.allowed_sample_types,
            allowed_contexts:     editProfile.allowed_contexts,
            frequency: editProfile.frequency ?? '',
            notes:     editProfile.notes ?? '',
          }}
          onSave={handleUpdate}
          onClose={() => setEditProfile(null)}
        />
      )}
    </div>
  );
}
