import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X, Trash2, Loader2 } from 'lucide-react';
import { clsx } from '../lib/utils';

export interface DeleteSummary {
  person?: string;
  batch?: string;
  date?: string;
  totalHits?: number;
  location?: string;
  isoClass?: string;
  lotNumber?: string;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  recordType: string;
  summary: DeleteSummary;
}

const EXAMPLE_REASONS = [
  'Duplicate entry',
  'Incorrect batch selected',
  'Record entered in error',
  'Test data — should not appear in production',
];

const MIN_REASON = 3;
const MAX_REASON = 500;

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  recordType,
  summary,
}: DeleteConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Reset state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      setSubmitting(false);
      setTimeout(() => reasonRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = reason.trim();
  const isReasonValid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

  const handleConfirm = async () => {
    if (submitting) return;
    if (!isReasonValid) {
      setError(trimmed.length === 0
        ? 'A deletion reason is required.'
        : trimmed.length < MIN_REASON
          ? `Reason must be at least ${MIN_REASON} characters.`
          : `Reason must not exceed ${MAX_REASON} characters.`);
      reasonRef.current?.focus();
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      // Parent closes the modal after success
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Deletion failed. Please try again.');
      setSubmitting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onKeyDown={handleKey}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-100 dark:border-surface-700 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-100 dark:border-surface-800 bg-red-50/50 dark:bg-red-900/10">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="delete-modal-title"
              className="text-sm font-bold text-surface-900 dark:text-white"
            >
              Delete {recordType} Record?
            </h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              This action creates an immutable audit entry and cannot be undone through the UI.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="btn-ghost p-1.5 rounded-lg shrink-0 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Record Summary */}
        <div className="px-5 py-4 space-y-1.5 border-b border-surface-100 dark:border-surface-800">
          {summary.person && (
            <SummaryRow label="Person" value={summary.person} />
          )}
          {summary.batch && (
            <SummaryRow label="Batch / Lot" value={summary.batch} />
          )}
          {summary.location && (
            <SummaryRow label="Sample Location" value={summary.location} />
          )}
          {summary.date && (
            <SummaryRow label="Date" value={summary.date} />
          )}
          {summary.isoClass && (
            <SummaryRow label="ISO Class" value={summary.isoClass} />
          )}
          {summary.totalHits !== undefined && (
            <SummaryRow
              label="Total Hits"
              value={String(summary.totalHits)}
              highlight={summary.totalHits > 0}
            />
          )}
        </div>

        {/* Reason Input */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label
              htmlFor="delete-reason"
              className="block text-xs font-semibold text-surface-700 dark:text-surface-300 mb-1.5"
            >
              Deletion Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="delete-reason"
              ref={reasonRef}
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              disabled={submitting}
              placeholder="e.g. Duplicate entry, Incorrect batch selected…"
              rows={3}
              maxLength={MAX_REASON}
              aria-describedby="delete-reason-hint delete-reason-error"
              className={clsx(
                'w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100',
                'focus:outline-none focus:ring-2 resize-none transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                error
                  ? 'border-red-400 focus:ring-red-400/30'
                  : 'border-surface-200 dark:border-surface-600 focus:ring-brand-500/30 focus:border-brand-400'
              )}
            />
            <div className="flex items-start justify-between mt-1 gap-2">
              <p id="delete-reason-hint" className="text-[10px] text-surface-400">
                Min {MIN_REASON} chars — Max {MAX_REASON} chars
              </p>
              <p className={clsx('text-[10px] shrink-0', trimmed.length > MAX_REASON ? 'text-red-500' : 'text-surface-400')}>
                {trimmed.length}/{MAX_REASON}
              </p>
            </div>
            {error && (
              <p id="delete-reason-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}
          </div>

          {/* Quick-fill example reasons */}
          <div>
            <p className="text-[10px] text-surface-400 mb-1.5 uppercase tracking-wide font-medium">Quick examples</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_REASONS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  disabled={submitting}
                  onClick={() => { setReason(ex); setError(''); }}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors disabled:opacity-40"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-ghost px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !isReasonValid}
            aria-label={`Confirm deletion of ${recordType} record`}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              'bg-red-600 hover:bg-red-700 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'focus-visible:ring-2 focus-visible:ring-red-500/50'
            )}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Delete Record
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-surface-500 dark:text-surface-400 shrink-0">{label}:</span>
      <span className={clsx(
        'font-semibold text-right truncate',
        highlight
          ? 'text-red-600 dark:text-red-400'
          : 'text-surface-800 dark:text-surface-100'
      )}>
        {value}
      </span>
    </div>
  );
}