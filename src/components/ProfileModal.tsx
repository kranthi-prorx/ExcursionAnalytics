/**
 * ProfileModal.tsx
 * Allows any logged-in user to update their display name and/or password.
 * Accessible by clicking the user card in the Sidebar.
 */

import { useState, useEffect, useRef } from 'react';
import {
  X, User, Lock, CheckCircle2, AlertCircle,
  Loader2, Eye, EyeOff, Save, Shield,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import toast from 'react-hot-toast';

type Tab = 'profile' | 'password';

interface Props { onClose: () => void; }

// ── helpers ──────────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
      <AlertCircle size={13} className="shrink-0 mt-0.5" />
      {msg}
    </div>
  );
}

function SuccessBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs">
      <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
      {msg}
    </div>
  );
}

const inputCls = (err?: boolean) =>
  `w-full rounded-xl border px-4 py-2.5 text-sm text-surface-900 dark:text-white
   bg-surface-50 dark:bg-surface-800 placeholder-surface-400
   outline-none transition-all focus:ring-2
   ${err
     ? 'border-red-400 dark:border-red-600 focus:ring-red-400/30'
     : 'border-surface-200 dark:border-surface-700 focus:ring-brand-500/30 focus:border-brand-500/60'
   }`;

// strength helper
function strength(pw: string) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^a-zA-Z0-9]/.test(pw)].filter(Boolean).length;
}
const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColor = ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500'];
const strengthText  = ['', 'text-red-500', 'text-amber-500', 'text-brand-500', 'text-emerald-500'];

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!user) return null;

  // ── Tab: Profile (name) ───────────────────────────────────────────────────
  function ProfileTab() {
    const [name, setName] = useState(user!.name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    const changed = name.trim() !== user!.name && name.trim().length >= 2;

    const save = async () => {
      if (!changed) return;
      setError(''); setSuccess('');
      setBusy(true);
      try {
        const res = await api.put('/profile', { name: name.trim() });
        updateUser(res.data.user);
        setSuccess('Name updated successfully.');
        toast.success('Display name updated!');
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Failed to update name.');
      } finally { setBusy(false); }
    };

    return (
      <div className="space-y-5 pt-2">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <span className="text-white text-xl font-bold">{user!.name[0].toUpperCase()}</span>
          </div>
          <div>
            <p className="font-semibold text-surface-900 dark:text-white">{user!.name}</p>
            <p className="text-xs text-surface-500">{user!.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              <Shield size={9} /> {user!.role}
            </span>
          </div>
        </div>

        <ErrorBanner msg={error} />
        <SuccessBanner msg={success} />

        <div>
          <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide">
            Display Name
          </label>
          <input
            ref={ref}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Your full name"
            className={inputCls(!changed && name.trim().length < 2 && name.length > 0)}
          />
          {name.trim().length > 0 && name.trim().length < 2 && (
            <p className="mt-1 text-xs text-red-500">Name must be at least 2 characters</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide">
            Email Address
          </label>
          <input
            value={user!.email}
            disabled
            className={`${inputCls()} opacity-60 cursor-not-allowed`}
          />
          <p className="mt-1 text-[11px] text-surface-400">Email cannot be changed. Contact your administrator.</p>
        </div>

        <button
          onClick={save}
          disabled={!changed || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-500 hover:to-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    );
  }

  // ── Tab: Password ─────────────────────────────────────────────────────────
  function PasswordTab() {
    const [current, setCurrent]   = useState('');
    const [pw, setPw]             = useState('');
    const [confirm, setConfirm]   = useState('');
    const [showCur, setShowCur]   = useState(false);
    const [showPw, setShowPw]     = useState(false);
    const [showCf, setShowCf]     = useState(false);
    const [busy, setBusy]         = useState(false);
    const [error, setError]       = useState('');
    const [success, setSuccess]   = useState('');
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    const str    = strength(pw);
    const valid  = current.length > 0 && pw.length >= 8 && pw === confirm && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);

    const save = async () => {
      if (!valid) return;
      setError(''); setSuccess('');
      setBusy(true);
      try {
        await api.put('/profile', { currentPassword: current, newPassword: pw });
        setSuccess('Password updated. Use it next time you log in.');
        toast.success('Password changed successfully!');
        setCurrent(''); setPw(''); setConfirm('');
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Failed to update password.');
      } finally { setBusy(false); }
    };

    const PasswordField = ({
      label, value, onChange, show, toggleShow, placeholder, inputRef
    }: {
      label: string; value: string; onChange: (v: string) => void;
      show: boolean; toggleShow: () => void; placeholder: string;
      inputRef?: React.RefObject<HTMLInputElement>;
    }) => (
      <div>
        <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide">
          {label}
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputCls() + ' pr-10'}
          />
          <button type="button" onClick={toggleShow}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
    );

    return (
      <div className="space-y-4 pt-2">
        <ErrorBanner msg={error} />
        <SuccessBanner msg={success} />

        <PasswordField
          label="Current Password" value={current} onChange={setCurrent}
          show={showCur} toggleShow={() => setShowCur(v => !v)}
          placeholder="Enter your current password" inputRef={ref}
        />

        <div>
          <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Min 8 chars, letters + numbers"
              className={inputCls() + ' pr-10'}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {pw && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= str ? strengthColor[str] : 'bg-surface-200 dark:bg-surface-700'}`} />
                ))}
              </div>
              <p className={`text-[11px] font-medium ${strengthText[str]}`}>{strengthLabel[str]}</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showCf ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="Re-enter new password"
              className={inputCls(confirm.length > 0 && confirm !== pw) + ' pr-10'}
            />
            <button type="button" onClick={() => setShowCf(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
              {showCf ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {confirm.length > 0 && confirm !== pw && (
            <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Passwords don't match</p>
          )}
          {confirm.length > 0 && confirm === pw && pw.length >= 8 && (
            <p className="mt-1 text-[11px] text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11} /> Passwords match</p>
          )}
        </div>

        <button
          onClick={save}
          disabled={!valid || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-500 hover:to-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    );
  }

  // ── Modal shell ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 rounded-2xl shadow-2xl animate-fade-in overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <div>
              <h2 className="text-base font-bold text-surface-900 dark:text-white">My Profile</h2>
              <p className="text-xs text-surface-500 mt-0.5">Update your personal details</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mx-6 mt-5 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl">
            {(['profile', 'password'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  tab === t
                    ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                }`}
              >
                {t === 'profile' ? <User size={13} /> : <Lock size={13} />}
                {t === 'profile' ? 'Edit Profile' : 'Change Password'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-6 pb-6 pt-2">
            {tab === 'profile'  && <ProfileTab />}
            {tab === 'password' && <PasswordTab />}
          </div>
        </div>
      </div>
    </>
  );
}
