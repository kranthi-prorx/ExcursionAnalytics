import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Check, X } from 'lucide-react';
import { clsx } from '../lib/utils';
import toast from 'react-hot-toast';

export interface DropdownOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  id?: string;
  label?: string;
  placeholder?: string;
  error?: string;
  className?: string;
  /** The currently confirmed selected option (controlled externally) */
  selectedOption: DropdownOption | null;
  /** Called when user picks or creates an option — parent stores it */
  onSelect: (option: DropdownOption) => void;
  /** Called when user explicitly clears the selection */
  onClear: () => void;
  /** Async search returning matched options */
  onSearch: (query: string) => Promise<DropdownOption[]>;
  /** Async creation returning the new option. Throw on error. */
  onCreateNew?: (inputText: string) => Promise<DropdownOption>;
  /** Toast message shown on successful creation, e.g. "Personnel profile created." */
  createSuccessMessage?: string;
}

/**
 * ProfileCombobox — a searchable dropdown specifically designed for
 * personnel and lot profile selection with proper confirmed-selection state.
 *
 * Separation of concerns:
 *  - searchText   : what the user is typing right now
 *  - selectedOption (prop): the confirmed profile (id + label) — stored in parent
 *  - isOpen       : whether the dropdown list is visible
 *  - creating     : whether an API create call is in flight
 */
export default function ProfileCombobox({
  id, label, placeholder, error, className,
  selectedOption, onSelect, onClear,
  onSearch, onCreateNew, createSuccessMessage,
}: Props) {
  const [searchText, setSearchText]   = useState('');
  const [options, setOptions]         = useState<DropdownOption[]>([]);
  const [isOpen, setIsOpen]           = useState(false);
  const [searching, setSearching]     = useState(false);
  const [creating, setCreating]       = useState(false);

  const containerRef  = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout>>();
  // Guard against the search effect reopening the dropdown right after selection
  const justSelected  = useRef(false);

  // ─── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const results = await onSearch(q);
      setOptions(results);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, [onSearch]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(searchText), searchText ? 250 : 80);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchText, isOpen, runSearch]);

  // ─── Outside click closes dropdown ────────────────────────────────────────
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // ─── Confirm a selection ──────────────────────────────────────────────────
  const confirmSelection = (opt: DropdownOption) => {
    justSelected.current = true;
    onSelect(opt);
    setIsOpen(false);
    setSearchText('');
    setOptions([]);
    // Reset the guard after a tick so normal focus-open still works later
    setTimeout(() => { justSelected.current = false; }, 300);
  };

  // ─── Create new profile ───────────────────────────────────────────────────
  const handleCreateNew = async () => {
    if (!onCreateNew || !searchText.trim() || creating) return;
    setCreating(true);
    setIsOpen(false); // close immediately so user gets feedback
    try {
      const created = await onCreateNew(searchText.trim());
      confirmSelection(created);
      toast.success(createSuccessMessage ?? 'Profile created successfully.');
    } catch (err: any) {
      const status   = err?.response?.status;
      const existing = err?.response?.data?.existing;
      if (status === 409 && existing) {
        // Duplicate — select the existing profile instead
        const existingOpt: DropdownOption = {
          id:    existing.id,
          label: existing.display_name ?? existing.display_lot ?? existing.name ?? searchText.trim(),
        };
        confirmSelection(existingOpt);
        toast(
          existing.display_name
            ? `Existing personnel profile selected: "${existingOpt.label}"`
            : `Existing lot profile selected: "${existingOpt.label}"`,
          { icon: 'ℹ️' }
        );
      } else {
        const msg = err?.response?.data?.message ?? 'Failed to create profile. Please try again.';
        toast.error(msg);
        setIsOpen(true); // re-open so user can retry
      }
    } finally {
      setCreating(false);
    }
  };

  // ─── Input events ─────────────────────────────────────────────────────────
  const handleFocus = () => {
    if (justSelected.current) return;
    if (!selectedOption) {
      setIsOpen(true);
    }
  };

  const handleInputChange = (text: string) => {
    setSearchText(text);
    if (!isOpen) setIsOpen(true);
  };

  const handleClear = () => {
    setSearchText('');
    setOptions([]);
    setIsOpen(false);
    onClear();
    // Give the input focus so the user can immediately type
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isConfirmed = !!selectedOption;
  const displayValue = isConfirmed ? selectedOption.label : searchText;
  const exactMatch = options.find(
    o => o.label.trim().toLowerCase() === searchText.trim().toLowerCase()
  );
  const showCreateNew = !!onCreateNew && searchText.trim().length > 0 && !exactMatch && !creating;

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {label && (
        <label className="label" htmlFor={id}>{label}</label>
      )}

      {/* ── Input ── */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          placeholder={isConfirmed ? selectedOption.label : placeholder}
          value={displayValue}
          readOnly={isConfirmed} // lock input once confirmed — use X to clear
          onFocus={handleFocus}
          onChange={e => !isConfirmed && handleInputChange(e.target.value)}
          className={clsx(
            'input !pl-9 !pr-8',
            error && !isConfirmed && 'input-error',
            isConfirmed && 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/10 cursor-default',
          )}
        />

        {/* Right icon: spinner while creating, green check when confirmed, X to clear */}
        {creating ? (
          <svg
            className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500"
            viewBox="0 0 24 24" fill="none"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : isConfirmed ? (
          <button
            type="button"
            title="Clear selection"
            onMouseDown={e => e.preventDefault()}
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        ) : searchText ? (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setSearchText(''); setOptions([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* ── Confirmed badge ── */}
      {isConfirmed && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1 select-none">
          <Check size={11} />
          <span className="font-semibold">{selectedOption.label}</span> selected
          <span className="text-surface-400 dark:text-surface-500">— click × to change</span>
        </p>
      )}

      {/* ── Creating overlay ── */}
      {creating && (
        <div className="absolute z-50 mt-1 w-full px-3 py-2.5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-xs text-green-700 dark:text-green-400 flex items-center gap-2 shadow-lg">
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Creating "{searchText.trim()}"…
        </div>
      )}

      {/* ── Validation error (only when no confirmed selection) ── */}
      {!isConfirmed && !creating && error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {/* ── Dropdown list ── */}
      {isOpen && !isConfirmed && !creating && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-xl animate-fade-in">

          {searching && (
            <div className="px-3 py-2.5 text-xs text-surface-400 flex items-center gap-2">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Searching…
            </div>
          )}

          {!searching && options.length === 0 && searchText.length > 0 && !showCreateNew && (
            <div className="px-3 py-2.5 text-xs text-surface-400">No matches found</div>
          )}

          {!searching && options.length === 0 && searchText.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-surface-400">Start typing to search…</div>
          )}

          {/* Option list */}
          {options.map(opt => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={e => e.preventDefault()} // prevent blur before click
              onClick={() => confirmSelection(opt)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="font-medium text-surface-800 dark:text-surface-200 block truncate">
                  {opt.label}
                </span>
                {opt.sublabel && (
                  <span className="text-xs text-surface-400">{opt.sublabel}</span>
                )}
              </div>
            </button>
          ))}

          {/* Create New */}
          {showCreateNew && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()} // prevent blur before click
              onClick={handleCreateNew}
              className={clsx(
                'w-full text-left px-3 py-2.5 text-sm flex items-center gap-2',
                'border-t border-surface-100 dark:border-surface-700',
                'text-green-700 dark:text-green-400',
                'hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors',
              )}
            >
              <Plus size={14} className="shrink-0" />
              <span>Create new:</span>
              <span className="font-semibold truncate">"{searchText.trim()}"</span>
            </button>
          )}

          {/* No results + no create option  */}
          {!searching && options.length === 0 && searchText.length > 0 && !showCreateNew && (
            <div className="px-3 py-2 text-xs text-surface-400 border-t border-surface-100 dark:border-surface-700">
              No create option available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
