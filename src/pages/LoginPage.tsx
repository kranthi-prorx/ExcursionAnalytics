import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  FlaskConical, LogIn, Eye, EyeOff, AlertCircle,
  ShieldCheck, Sun, Moon, Building2, Loader2,
} from 'lucide-react';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

const ALLOWED_DOMAIN = 'prorxpharma.com';

const schema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .refine(
      (v) => v.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`),
      { message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.` }
    ),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

// Returns 'ok' | 'wrong' | 'empty' based on domain format only
function domainStatus(email: string): 'empty' | 'ok' | 'wrong' {
  if (!email) return 'empty';
  if (!email.includes('@')) return 'empty';
  const domain = (email.split('@')[1] ?? '').toLowerCase();
  if (domain === ALLOWED_DOMAIN) return 'ok';
  return 'wrong';
}

import api from '../lib/api';

export default function LoginPage() {
  const { login }        = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate         = useNavigate();
  const [showPw, setShowPw]         = useState(false);
  const [apiError, setApiError]      = useState('');
  const [showForgot, setShowForgot]  = useState(false);

  // ── Real-time account existence check ─────────────────────────────────────
  type AccountStatus = 'idle' | 'checking' | 'found' | 'not_found';
  const [acctStatus, setAcctStatus] = useState<AccountStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const emailVal = watch('email') ?? '';
  const dStatus  = domainStatus(emailVal);

  // Debounced DB check whenever email has the right domain
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (dStatus !== 'ok') { setAcctStatus('idle'); return; }
    setAcctStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.post('/auth/check-email', { email: emailVal.trim().toLowerCase() });
        setAcctStatus(res.data.exists ? 'found' : 'not_found');
      } catch {
        setAcctStatus('idle'); // silently fall back on network error
      }
    }, 500); // 500ms debounce
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [emailVal, dStatus]);

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className={`min-h-screen flex ${
      theme === 'dark'
        ? 'bg-gradient-to-br from-[#0f1729] via-[#111827] to-[#0f1729]'
        : 'bg-gradient-to-br from-slate-100 via-white to-slate-100'
    }`}>

      {/* ── Left brand panel ───────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-32 -left-32 w-[400px] h-[400px] rounded-full bg-brand-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-16 w-[350px] h-[350px] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <FlaskConical size={20} className="text-white" />
          </div>
          <span className="text-surface-900 dark:text-white font-bold text-lg tracking-tight">ProRx Pharma</span>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-6">
          <div>
            <p className="text-brand-500 dark:text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">Excursion Hit Analytics</p>
            <h1 className="text-4xl font-extrabold text-surface-900 dark:text-white leading-tight">
              Real-time<br />cleanroom<br />monitoring.
            </h1>
            <p className="text-surface-600 dark:text-surface-400 mt-4 text-sm leading-relaxed max-w-xs">
              Track viable and non-viable excursion data, particle counts, and personnel monitoring across all ISO classifications — in one unified dashboard.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-2">
            {[
              'ISO 5 / 7 / 8 classification tracking',
              'CFU & particle count alerts',
              'PDF report generation',
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300">
                <ShieldCheck size={14} className="text-brand-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-surface-600">
          © {new Date().getFullYear()} ProRx Pharma — Internal use only
        </p>
      </div>

      {/* ── Right login panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2 rounded-xl text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-md space-y-6">

          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/30 mb-3">
              <FlaskConical size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">Excursion Hit Analytics</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">ProRx Pharma — Internal Portal</p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-surface-200 dark:border-white/10 rounded-2xl p-8 shadow-2xl">

            <div className="mb-6">
              <h2 className="text-xl font-bold text-surface-900 dark:text-white">Sign in</h2>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                Use your <span className="text-brand-500 dark:text-brand-400 font-medium">@{ALLOWED_DOMAIN}</span> email
              </p>
            </div>



            {/* API / domain error banner */}
            {apiError && (
              <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs animate-fade-in">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {apiError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide" htmlFor="email">
                  Corporate Email
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={`you@${ALLOWED_DOMAIN}`}
                    {...register('email')}
                    className={`
                      w-full rounded-xl border bg-white dark:bg-white/5 px-4 py-3 text-sm text-surface-900 dark:text-white placeholder-surface-400 dark:placeholder-surface-500
                      outline-none transition-all focus:ring-2
                      ${errors.email || acctStatus === 'not_found'
                        ? 'border-red-500/60 focus:ring-red-500/30'
                        : acctStatus === 'found'
                          ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                          : dStatus === 'wrong'
                            ? 'border-red-500/60 focus:ring-red-500/30'
                            : 'border-surface-200 dark:border-white/10 focus:ring-brand-500/30 focus:border-brand-500/60'
                      }
                    `}
                  />

                  {/* Right-side status indicator */}
                  {acctStatus === 'checking' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-surface-400">
                      <Loader2 size={12} className="animate-spin" /> Checking…
                    </span>
                  )}
                  {acctStatus === 'found' && !errors.email && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                      <ShieldCheck size={12} /> Account Found
                    </span>
                  )}
                  {acctStatus === 'not_found' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-red-400">
                      <AlertCircle size={12} /> Not Found
                    </span>
                  )}
                  {dStatus === 'wrong' && acctStatus === 'idle' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-red-400">
                      <AlertCircle size={12} /> Rejected
                    </span>
                  )}
                </div>

                {/* Inline message below the input */}
                {acctStatus === 'not_found' && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 animate-fade-in">
                    <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400 leading-snug">
                      No account found for this email.<br />
                      Please contact your <span className="font-semibold">administrator</span> to create an account.
                    </p>
                  </div>
                )}
                {dStatus === 'wrong' && !errors.email && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle size={11} />
                    Only corporate emails (@{ALLOWED_DOMAIN}) are allowed.
                  </p>
                )}
                {errors.email && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle size={11} />
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5 uppercase tracking-wide" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register('password')}
                    className={`
                      w-full rounded-xl border bg-white dark:bg-white/5 px-4 py-3 pr-11 text-sm text-surface-900 dark:text-white placeholder-surface-400 dark:placeholder-surface-500
                      outline-none transition-all focus:ring-2
                      ${errors.password
                        ? 'border-red-500/60 focus:ring-red-500/30'
                        : 'border-surface-200 dark:border-white/10 focus:ring-brand-500/30 focus:border-brand-500/60'
                      }
                    `}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle size={11} />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Forgot password link */}
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isSubmitting || dStatus === 'wrong' || acctStatus === 'not_found' || acctStatus === 'checking'}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm
                  bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-700/30
                  hover:from-brand-500 hover:to-brand-600 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                  mt-1"
              >
                {isSubmitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <LogIn size={16} />
                )}
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          {/* Corporate domain notice */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-surface-200 dark:border-white/10 text-xs text-surface-500 dark:text-surface-400">
            <Building2 size={14} className="text-brand-500 dark:text-brand-400 shrink-0" />
            <span>
              Access is restricted to <span className="text-brand-500 dark:text-brand-400 font-semibold">@{ALLOWED_DOMAIN}</span> accounts only.
              Contact your administrator for access.
            </span>
          </div>
        </div>
      </div>
      {/* Forgot Password Modal */}
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}
