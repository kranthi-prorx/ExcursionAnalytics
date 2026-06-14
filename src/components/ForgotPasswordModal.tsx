/**
 * ForgotPasswordModal.tsx
 * 4-step password reset flow:
 *   1. Enter corporate email
 *   2. Enter 6-digit OTP
 *   3. Set new password
 *   4. Success screen
 */

import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import {
  X, Mail, KeyRound, Lock, CheckCircle2,
  AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';

const ALLOWED_DOMAIN = 'prorxpharma.com';

// ─── helpers ────────────────────────────────────────────────────────────────
const emailSchema = z
  .string()
  .email()
  .refine((v) => v.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`), {
    message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.`,
  });

const pwSchema = z
  .string()
  .min(8, 'Must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Must contain at least one letter')
  .regex(/[0-9]/, 'Must contain at least one number');

type Step = 1 | 2 | 3 | 4;

interface Props {
  onClose: () => void;
}

// ─── Step indicator ──────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const labels = ['Email', 'Verify', 'New Password', 'Done'];
  return (
    <div className="flex items-center gap-1 mb-8">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const done    = step > n;
        const active  = step === n;
        return (
          <div key={n} className="flex items-center gap-1 flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                done   ? 'bg-emerald-500 text-white' :
                active ? 'bg-brand-500 text-white ring-4 ring-brand-500/25' :
                         'bg-white/10 text-surface-500'
              }`}>
                {done ? <CheckCircle2 size={14} /> : n}
              </div>
              <span className={`text-[10px] font-semibold ${active ? 'text-brand-400' : done ? 'text-emerald-400' : 'text-surface-600'}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full mb-4 transition-all ${done ? 'bg-emerald-500' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs animate-fade-in">
      <AlertCircle size={13} className="shrink-0 mt-0.5" />
      {msg}
    </div>
  );
}

// ─── Shared input style ────────────────────────────────────────────────────────
const inputCls = (err?: boolean) =>
  `w-full rounded-xl border bg-white/5 px-4 py-3 text-sm text-white placeholder-surface-500 outline-none transition-all focus:ring-2 ${
    err
      ? 'border-red-500/60 focus:ring-red-500/30'
      : 'border-white/10 focus:ring-brand-500/30 focus:border-brand-500/60'
  }`;

// ════════════════════════════════════════════════════════════════════════════
export default function ForgotPasswordModal({ onClose }: Props) {
  const [step, setStep]         = useState<Step>(1);
  const [email, setEmail]       = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Step 1: email ──────────────────────────────────────────────────────────
  function Step1() {
    const [val, setVal]       = useState(email);
    const [err, setErr]       = useState('');
    const [notFound, setNotFound] = useState(false);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    const submit = async () => {
      setErr('');
      setNotFound(false);
      const parsed = emailSchema.safeParse(val.trim());
      if (!parsed.success) { setErr(parsed.error.errors[0].message); return; }
      setBusy(true);
      try {
        await api.post('/auth/forgot-password', { email: val.trim().toLowerCase() });
        setEmail(val.trim().toLowerCase());
        setStep(2);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg    = e?.response?.data?.message ?? 'Something went wrong. Please try again.';
        if (status === 404) {
          setNotFound(true);   // render the distinct "no account" banner
        } else {
          setErr(msg);
        }
      } finally { setBusy(false); }
    };

    const domainOk = val.includes('@') && (val.split('@')[1] ?? '').toLowerCase() === ALLOWED_DOMAIN;

    return (
      <div className="space-y-5">
        <div>
          <div className="w-11 h-11 rounded-2xl bg-brand-500/15 flex items-center justify-center mb-4">
            <Mail size={20} className="text-brand-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Reset your password</h3>
          <p className="text-sm text-surface-400 mt-1">
            Enter your <span className="text-brand-400">@{ALLOWED_DOMAIN}</span> email and we'll send you a verification code.
          </p>
        </div>

        {/* Generic error */}
        <ErrorBanner msg={err} />

        {/* No-account banner — distinct amber style */}
        {notFound && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 animate-fade-in">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-300">No account found</p>
              <p className="text-xs text-amber-400/80 leading-relaxed">
                No account was found with this email address.<br />
                Please contact your <span className="font-semibold text-amber-300">administrator</span> to create an account.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-surface-300 mb-1.5 uppercase tracking-wide">
            Corporate Email
          </label>
          <input
            ref={ref}
            type="email"
            value={val}
            onChange={e => { setVal(e.target.value); setNotFound(false); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={`you@${ALLOWED_DOMAIN}`}
            className={inputCls(!!err || notFound)}
          />
          {domainOk && !notFound && !err && (
            <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={11} /> Corporate email verified
            </p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy || !domainOk}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-500 hover:to-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          {busy ? 'Checking account…' : 'Send Verification Code'}
        </button>
      </div>
    );
  }

  // ── Step 2: OTP ────────────────────────────────────────────────────────────
  function Step2() {
    const [otp, setOtp]     = useState(['', '', '', '', '', '']);
    const [err, setErr]     = useState('');
    const [resent, setResent] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => { inputs.current[0]?.focus(); }, []);
    useEffect(() => {
      if (countdown <= 0) return;
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }, [countdown]);

    const handleChange = (i: number, v: string) => {
      const digit = v.replace(/\D/g, '').slice(-1);
      const next = [...otp];
      next[i] = digit;
      setOtp(next);
      if (digit && i < 5) inputs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (text.length === 6) {
        setOtp(text.split(''));
        inputs.current[5]?.focus();
        e.preventDefault();
      }
    };

    const submit = async () => {
      setErr('');
      const code = otp.join('');
      if (code.length < 6) { setErr('Please enter all 6 digits.'); return; }
      setBusy(true);
      try {
        const res = await api.post('/auth/verify-otp', { email, otp: code });
        setResetToken(res.data.resetToken);
        setStep(3);
      } catch (e: any) {
        setErr(e?.response?.data?.message ?? 'Invalid or expired code.');
        setOtp(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
      } finally { setBusy(false); }
    };

    const resend = async () => {
      if (countdown > 0) return;
      setBusy(true);
      try {
        await api.post('/auth/forgot-password', { email });
        setResent(true);
        setCountdown(60);
        setOtp(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
      } catch { /* silent */ }
      finally { setBusy(false); }
    };

    return (
      <div className="space-y-5">
        <div>
          <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 mb-4 transition-colors">
            <ArrowLeft size={13} /> Back
          </button>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-4">
            <KeyRound size={20} className="text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Enter verification code</h3>
          <p className="text-sm text-surface-400 mt-1">
            We sent a 6-digit code to <span className="text-white font-medium">{email}</span>.<br />
            Check your inbox (and spam folder).
          </p>
          {!import.meta.env.PROD && (
            <p className="mt-2 text-[11px] text-brand-400">
              💡 SMTP not configured? Check the server console for your OTP.
            </p>
          )}
        </div>

        <ErrorBanner msg={err} />
        {resent && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} /> New code sent!</p>}

        {/* OTP boxes */}
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={`w-11 h-14 rounded-xl border text-center text-xl font-bold text-white bg-white/5 outline-none transition-all focus:ring-2 ${
                digit
                  ? 'border-brand-500/60 focus:ring-brand-500/30'
                  : 'border-white/10 focus:ring-brand-500/30 focus:border-brand-500/60'
              }`}
            />
          ))}
        </div>

        <button
          onClick={submit}
          disabled={busy || otp.join('').length < 6}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-500 hover:to-brand-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {busy ? 'Verifying…' : 'Verify Code'}
        </button>

        <p className="text-center text-xs text-surface-500">
          Didn't receive it?{' '}
          <button
            onClick={resend}
            disabled={countdown > 0 || busy}
            className="text-brand-400 hover:text-brand-300 disabled:text-surface-600 disabled:cursor-not-allowed transition-colors font-medium inline-flex items-center gap-1"
          >
            <RefreshCw size={11} />
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
          </button>
        </p>
      </div>
    );
  }

  // ── Step 3: new password ───────────────────────────────────────────────────
  function Step3() {
    const [pw, setPw]       = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw]   = useState(false);
    const [showCf, setShowCf]   = useState(false);
    const [err, setErr]         = useState('');
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    // Strength meter
    const strength = [
      pw.length >= 8,
      /[A-Z]/.test(pw),
      /[0-9]/.test(pw),
      /[^a-zA-Z0-9]/.test(pw),
    ].filter(Boolean).length;
    const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const strengthColors = ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500'];

    const submit = async () => {
      setErr('');
      const parsed = pwSchema.safeParse(pw);
      if (!parsed.success) { setErr(parsed.error.errors[0].message); return; }
      if (pw !== confirm)  { setErr('Passwords do not match.'); return; }
      setBusy(true);
      try {
        await api.post('/auth/reset-password', { resetToken, newPassword: pw });
        setStep(4);
      } catch (e: any) {
        setErr(e?.response?.data?.message ?? 'Failed to reset password. Please start over.');
      } finally { setBusy(false); }
    };

    return (
      <div className="space-y-5">
        <div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
            <Lock size={20} className="text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Create new password</h3>
          <p className="text-sm text-surface-400 mt-1">Choose a strong password for your account.</p>
        </div>

        <ErrorBanner msg={err} />

        {/* New password */}
        <div>
          <label className="block text-xs font-semibold text-surface-300 mb-1.5 uppercase tracking-wide">New Password</label>
          <div className="relative">
            <input
              ref={ref}
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Min 8 chars, letters + numbers"
              className={inputCls(!!err) + ' pr-11'}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {/* Strength bar */}
          {pw && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColors[strength] : 'bg-white/10'}`} />
                ))}
              </div>
              <p className={`text-[11px] font-medium ${strengthColors[strength].replace('bg-','text-')}`}>
                {strengthLabels[strength]}
              </p>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs font-semibold text-surface-300 mb-1.5 uppercase tracking-wide">Confirm Password</label>
          <div className="relative">
            <input
              type={showCf ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Re-enter new password"
              className={inputCls(confirm.length > 0 && confirm !== pw) + ' pr-11'}
            />
            <button type="button" onClick={() => setShowCf(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
              {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirm.length > 0 && confirm !== pw && (
            <p className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1"><AlertCircle size={11} /> Passwords don't match</p>
          )}
          {confirm.length > 0 && confirm === pw && (
            <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} /> Passwords match</p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy || pw.length < 8 || pw !== confirm}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    );
  }

  // ── Step 4: success ────────────────────────────────────────────────────────
  function Step4() {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Password updated!</h3>
          <p className="text-sm text-surface-400 mt-2">
            Your password has been reset successfully.<br />
            You can now sign in with your new password.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-500 hover:to-brand-600 transition-all"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  // ── Modal shell ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={step === 4 ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-[#0f1729]/95 border border-white/10 rounded-2xl shadow-2xl p-8 animate-fade-in">

          {/* Close button */}
          <div className="flex justify-end mb-2 -mt-2 -mr-2">
            <button onClick={onClose} className="p-1.5 rounded-lg text-surface-500 hover:text-white hover:bg-white/10 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Step bar */}
          <StepBar step={step} />

          {/* Step content */}
          {step === 1 && <Step1 />}
          {step === 2 && <Step2 />}
          {step === 3 && <Step3 />}
          {step === 4 && <Step4 />}
        </div>
      </div>
    </>
  );
}
