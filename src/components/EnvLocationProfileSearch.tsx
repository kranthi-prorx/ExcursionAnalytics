import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, MapPin, AlertCircle, Loader2, Plus } from 'lucide-react';
import { clsx } from '../lib/utils';
import { envLocationProfilesAPI } from '../lib/api';
import type { EnvLocationProfile, EnvSampleType, MonitoringContext } from '../types';

interface Props {
  value: EnvLocationProfile | null;
  onChange: (profile: EnvLocationProfile | null) => void;
  sampleType?: EnvSampleType;
  context?: MonitoringContext;
  isoClass?: string;
  disabled?: boolean;
  /** Allow freeform text if no profile is selected */
  allowFreeform?: boolean;
  freeformValue?: string;
  onFreeformChange?: (v: string) => void;
  placeholder?: string;
}

const ISO_COLOR: Record<string, string> = {
  'ISO 5': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'ISO 7': 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  'ISO 8': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const TYPE_LABELS: Record<string, string> = {
  VIABLE_AIR: 'Viable Air',
  NONVIABLE_AIR: 'Non-Viable Air',
  SURFACE: 'Surface',
};

export default function EnvLocationProfileSearch({
  value,
  onChange,
  sampleType,
  context,
  isoClass,
  disabled = false,
  allowFreeform = false,
  freeformValue = '',
  onFreeformChange,
  placeholder = 'Search location (code, name, area)…',
}: Props) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<EnvLocationProfile[]>([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { q: q || undefined, active: true };
      if (isoClass)    params.iso_class    = isoClass;
      if (sampleType)  params.sample_type  = sampleType;
      if (context)     params.context      = context;
      const res = await envLocationProfilesAPI.search(params);
      setResults(res.data);
    } catch {
      setError('Failed to load location profiles');
    } finally {
      setLoading(false);
    }
  }, [isoClass, sampleType, context]);

  // Open dropdown and search on focus
  const handleFocus = () => {
    if (!disabled) {
      setOpen(true);
      search(query);
    }
  };

  // Debounced search on input change
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (!value) {
      setOpen(true);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => search(q), 250);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.parentElement?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (profile: EnvLocationProfile) => {
    onChange(profile);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="relative">
      {/* Selected profile display */}
      {value ? (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-brand-400 dark:border-brand-600 bg-brand-50/40 dark:bg-brand-900/20">
          <MapPin size={16} className="text-brand-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-surface-800 dark:text-surface-100">{value.location_code}</span>
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', ISO_COLOR[value.iso_class] || 'bg-surface-100 text-surface-600')}>
                {value.iso_class}
              </span>
              {value.allowed_sample_types.map(t => (
                <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
                  {TYPE_LABELS[t] || t}
                </span>
              ))}
            </div>
            <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">{value.display_name}</p>
            <p className="text-xs text-surface-400 dark:text-surface-500 truncate">{value.room_or_area}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-surface-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 transition-colors"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInput}
              onFocus={handleFocus}
              disabled={disabled}
              placeholder={placeholder}
              className="input pl-9 pr-8"
            />
            {loading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 animate-spin" />
            )}
          </div>

          {/* Freeform fallback */}
          {allowFreeform && (
            <div className="mt-2">
              <p className="text-xs text-surface-400 dark:text-surface-500 mb-1">
                No profile? Enter location text manually:
              </p>
              <input
                type="text"
                value={freeformValue}
                onChange={e => onFreeformChange?.(e.target.value)}
                placeholder="e.g. Filling Room, Near HVAC"
                className="input text-sm"
                disabled={disabled}
              />
            </div>
          )}

          {/* Dropdown */}
          {open && (
            <ul
              ref={listRef}
              className="absolute z-50 top-full mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl shadow-surface-900/10 divide-y divide-surface-100 dark:divide-surface-800"
            >
              {error && (
                <li className="px-3 py-2 flex items-center gap-2 text-red-600 text-xs">
                  <AlertCircle size={12} /> {error}
                </li>
              )}
              {!loading && !error && results.length === 0 && (
                <li className="px-3 py-3 text-center text-xs text-surface-400">
                  {query ? `No location profiles match "${query}"` : 'No active location profiles'}
                  {!isoClass && !sampleType && (
                    <span className="block mt-1 text-surface-400 dark:text-surface-500">
                      Admin/manager can add profiles in Location Profile Management.
                    </span>
                  )}
                </li>
              )}
              {results.map(profile => (
                <li key={profile.id}>
                  <button
                    type="button"
                    onClick={() => select(profile)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-surface-800 dark:text-surface-100">{profile.location_code}</span>
                      <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', ISO_COLOR[profile.iso_class] || '')}>
                        {profile.iso_class}
                      </span>
                      {profile.allowed_sample_types.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400">
                          {TYPE_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">{profile.display_name}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500 truncate">{profile.room_or_area}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
