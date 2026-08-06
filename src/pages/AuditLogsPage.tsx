import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, ExternalLink, Filter, X } from 'lucide-react';
import { auditLogsAPI } from '../lib/api';
import type { AuditLogListItem, AuditLog, AuditActionType } from '../types';
import { clsx } from '../lib/utils';
import { queryCache } from '../lib/queryCache';
import AuditDetailDrawer from '../components/AuditDetailDrawer';

const PAGE_SIZE = 20;

const ACTION_COLORS: Record<AuditActionType, string> = {
  CREATE:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  RESTORE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const ENTITY_LABELS: Record<string, string> = {
  pm_record:       'PM Monitoring',
  viable_record:   'Env / Viable',
  surface_record:  'Surface Sampling',
  processed_batch: 'Processed Batch',
};

function fmt(d: string | null) {
  if (!d) return '\u2014';
  try { return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return d; }
}
function fmtDate(d: string | null) {
  if (!d) return '\u2014';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${m}-${day}-${y}`;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [personnelName, setPersonnelName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [sort, setSort] = useState('occurred_at_desc');
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await auditLogsAPI.getAll({
        page: pg, limit: PAGE_SIZE,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        action_type: actionType || undefined,
        entity_type: entityType || undefined,
        personnel_name: personnelName || undefined,
        batch_number: batchNumber || undefined,
        sort,
      });
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(pg);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, actionType, entityType, personnelName, batchNumber, sort]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await auditLogsAPI.getById(id);
      setDetailLog(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setActionType('');
    setEntityType(''); setPersonnelName(''); setBatchNumber('');
    setSort('occurred_at_desc');
  };

  const hasFilters = dateFrom || dateTo || actionType || entityType || personnelName || batchNumber;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Audit Logs</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Immutable record of all create, update, delete, and restore actions.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
              showFilters
                ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/20 dark:border-brand-600 dark:text-brand-400'
                : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300'
            )}
          >
            <Filter size={14} />
            Filters
            {hasFilters && <span className="w-2 h-2 rounded-full bg-brand-500" />}
          </button>
          <button
            onClick={() => fetchLogs(page)}
            disabled={loading}
            className="btn-ghost p-2 rounded-xl disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Date From">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-base" />
            </Field>
            <Field label="Date To">
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-base" />
            </Field>
            <Field label="Action">
              <select value={actionType} onChange={e => setActionType(e.target.value)} className="input-base">
                <option value="">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="RESTORE">Restore</option>
              </select>
            </Field>
            <Field label="Record Type">
              <select value={entityType} onChange={e => setEntityType(e.target.value)} className="input-base">
                <option value="">All Types</option>
                <option value="pm_record">PM Monitoring</option>
                <option value="viable_record">Env / Viable</option>
                <option value="surface_record">Surface Sampling</option>
                <option value="processed_batch">Processed Batch</option>
              </select>
            </Field>
            <Field label="Personnel Name">
              <input value={personnelName} onChange={e => setPersonnelName(e.target.value)} placeholder="Search name…" className="input-base" />
            </Field>
            <Field label="Batch / Lot">
              <input value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="Search batch…" className="input-base" />
            </Field>
            <Field label="Sort By">
              <select value={sort} onChange={e => setSort(e.target.value)} className="input-base">
                <option value="occurred_at_desc">Newest First</option>
                <option value="occurred_at_asc">Oldest First</option>
                <option value="actor">By User</option>
                <option value="action_type">By Action</option>
                <option value="entity_type">By Record Type</option>
              </select>
            </Field>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors">
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      {!loading && (
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} events
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-surface-100 dark:border-surface-700 bg-white dark:bg-surface-900 overflow-hidden">
        {loading ? (
          <div className="space-y-0 divide-y divide-surface-50 dark:divide-surface-800">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-5 py-3.5 animate-pulse">
                <div className="w-28 h-3.5 bg-surface-100 dark:bg-surface-800 rounded-lg" />
                <div className="w-20 h-3.5 bg-surface-100 dark:bg-surface-800 rounded-lg" />
                <div className="flex-1 h-3.5 bg-surface-100 dark:bg-surface-800 rounded-lg" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Search size={32} className="mx-auto text-surface-300 dark:text-surface-600" />
            <p className="text-sm text-surface-500 dark:text-surface-400">No audit events found</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/60">
                  {['Date / Time', 'User', 'Role', 'Action', 'Record Type', 'Personnel', 'Batch', 'Date of Batch', 'Reason', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide whitespace-nowrap text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50 dark:divide-surface-800">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap text-surface-700 dark:text-surface-300 font-mono">
                      {fmt(log.occurred_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-surface-800 dark:text-surface-200">{log.actor_name}</div>
                      <div className="text-surface-400 text-[10px]">{log.actor_email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap capitalize text-surface-600 dark:text-surface-400">
                      {log.actor_role}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', ACTION_COLORS[log.action_type])}>
                        {log.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-surface-600 dark:text-surface-400">
                      {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-surface-700 dark:text-surface-300">
                      {log.personnel_name ?? '\u2014'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-surface-600 dark:text-surface-400 text-[11px]">
                      {log.batch_number ?? '\u2014'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-surface-600 dark:text-surface-400">
                      {fmtDate(log.date_of_batch)}
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      {log.deletion_reason ? (
                        <span className="truncate block text-surface-500 dark:text-surface-400 italic" title={log.deletion_reason}>
                          "{log.deletion_reason}"
                        </span>
                      ) : <span className="text-surface-300 dark:text-surface-600">\u2014</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openDetail(log.id)}
                        disabled={loadingDetail}
                        aria-label="View audit event details"
                        className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium disabled:opacity-40"
                      >
                        Details <ExternalLink size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => fetchLogs(page - 1)}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 text-sm font-medium text-surface-600 dark:text-surface-300 disabled:opacity-40 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="text-xs text-surface-500 dark:text-surface-400">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => fetchLogs(page + 1)}
            disabled={page >= pages || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 text-sm font-medium text-surface-600 dark:text-surface-300 disabled:opacity-40 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Detail Drawer */}
      <AuditDetailDrawer log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide font-semibold text-surface-500 dark:text-surface-400">{label}</label>
      {children}
    </div>
  );
}