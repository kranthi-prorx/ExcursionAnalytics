import { useState, useEffect, useCallback } from 'react';
import type { ExcursionRecord, FilterState, DrillDownData } from '../types';
import { recordsAPI, viableAPI, surfaceAPI } from '../lib/api';
import { queryCache } from '../lib/queryCache';
import type { ViableRecord, SurfaceRecord } from '../lib/api';
import FilterBar from '../components/FilterBar';
import DrillDownDrawer from '../components/DrillDownDrawer';
import ViableDrawer from '../components/ViableDrawer';
import { getDefaultFilters, formatDate, clsx, downloadCSV } from '../lib/utils';
import { Eye, Trash2, Download, Search, SortAsc, SortDesc, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import EditRecordModal from '../components/EditRecordModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import type { DeleteSummary } from '../components/DeleteConfirmModal';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type ViableISOClass, evaluateCfuStatus,
  PARTICLE_THRESHOLDS as CFG_PARTICLE_THRESHOLDS,
} from '../lib/cfuConfig';

const PAGE_SIZE = 15;
type RecordTab = 'pm' | 'viable' | 'surface';

// CFU thresholds — uses centralized cfuConfig for ISO 5/7/8
// Local alias for the particle thresholds (keyed as Record<string, ...> for table lookups)
const PARTICLE_THRESHOLDS: Record<string, { um05: { alert: number; action: number }; um50: { alert: number; action: number } }> = CFG_PARTICLE_THRESHOLDS;

function cfuStatus(val: number, isoClass: string) {
  return evaluateCfuStatus(val, isoClass as ViableISOClass);
}

function CfuBadge({ val, isoClass }: { val: number; isoClass: string }) {
  const s = cfuStatus(val, isoClass);
  if (s === 'action') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
      ⚠ {val} Action
    </span>
  );
  if (s === 'alert') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      ⚠ {val} Alert
    </span>
  );
  return <span>{val}</span>;
}

function ParticleBadge({ val, t }: { val: number; t: { alert: number; action: number } }) {
  const display = Number(val).toLocaleString();
  if (val >= t.action) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
      ⚠ {display} Action
    </span>
  );
  if (val >= t.alert) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      ⚠ {display} Alert
    </span>
  );
  return <span>{display}</span>;
}


// Display helper: YYYY-MM-DD → MM-DD-YYYY
function fmtHitDate(d: string | null | undefined): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${m}-${day}-${y}`;
}

export default function RecordsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<RecordTab>('pm');
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters('yearly'));
  const [records, setRecords] = useState<ExcursionRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [sortBy, setSortBy]   = useState<'date_of_batch' | 'name' | 'total_hits'>('date_of_batch');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drawer, setDrawer]   = useState<DrillDownData | null>(null);
  const [deleting, setDeleting]           = useState<string | null>(null);
  const [deletingViable, setDeletingViable] = useState<number | null>(null);
  const [deletingSurface, setDeletingSurface] = useState<number | null>(null);
  const [viableRecords, setViableRecords]   = useState<ViableRecord[]>([]);
  const [surfaceRecords, setSurfaceRecords] = useState<SurfaceRecord[]>([]);
  const [viableLot, setViableLot]           = useState<string | null>(null);
  const [subLoading, setSubLoading]         = useState(false);
  const [editTarget, setEditTarget]         = useState<
    | { type: 'pm';      record: ExcursionRecord }
    | { type: 'viable';  record: ViableRecord    }
    | { type: 'surface'; record: SurfaceRecord   }
    | null
  >(null);
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'pm' | 'viable' | 'surface';
    id: string | number;
    recordType: string;
    summary: DeleteSummary;
  } | null>(null);

  // ── Bulk-selection state (one Set per tab) ──────────────────────────
  const [selectedPm,      setSelectedPm]      = useState<Set<string>>(new Set());
  const [selectedViable,  setSelectedViable]  = useState<Set<number>>(new Set());
  const [selectedSurface, setSelectedSurface] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen,  setBulkDeleteOpen]  = useState(false);
  const [bulkDeleting,    setBulkDeleting]    = useState(false);

  // Clear selections when switching tabs
  const handleTabChange = (t: RecordTab) => {
    setTab(t);
    setSelectedPm(new Set());
    setSelectedViable(new Set());
    setSelectedSurface(new Set());
  };

  const canDelete = !!user;
  const canExport = ['admin', 'manager'].includes((user?.role ?? '').toLowerCase());

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recordsAPI.getAll(filters);
      setRecords(res.data.records);
      setTotal(res.data.total);
      setPage(1);
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchSubRecords = useCallback(async () => {
    setSubLoading(true);
    try {
      const [vRes, sRes] = await Promise.allSettled([viableAPI.getAll(), surfaceAPI.getAll()]);
      if (vRes.status === 'fulfilled') setViableRecords(vRes.value.data);
      if (sRes.status === 'fulfilled') setSurfaceRecords(sRes.value.data);
    } catch {
      toast.error('Failed to load sub-records');
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { fetchSubRecords(); }, [fetchSubRecords]);

  // Open delete confirmation modal for PM records
  const openDeletePm = (rec: ExcursionRecord) => {
    setDeleteModal({
      isOpen: true, type: 'pm', id: rec.id,
      recordType: 'PM Monitoring',
      summary: {
        person: rec.name,
        batch: rec.lot_number,
        date: rec.date_of_batch,
        totalHits: rec.total_hits,
        isoClass: rec.iso_class,
      },
    });
  };

  // Open delete confirmation modal for viable records
  const openDeleteViable = (rec: ViableRecord) => {
    setDeleteModal({
      isOpen: true, type: 'viable', id: rec.id,
      recordType: 'Environmental/Viable',
      summary: {
        batch: rec.lot_number,
        date: rec.sample_date,
        isoClass: rec.iso_class,
      },
    });
  };

  // Open delete confirmation modal for surface records
  const openDeleteSurface = (rec: SurfaceRecord) => {
    setDeleteModal({
      isOpen: true, type: 'surface', id: rec.id,
      recordType: 'Surface Sampling',
      summary: {
        location: rec.sample_location,
        batch: rec.lot_number,
        date: rec.sample_date,
        isoClass: rec.iso_class,
      },
    });
  };

  // Unified delete confirm handler (single record)
  const handleDeleteConfirm = async (reason: string) => {
    if (!deleteModal) return;
    const { type, id } = deleteModal;
    try {
      if (type === 'pm') {
        await recordsAPI.delete(String(id), reason);
        setRecords(r => r.filter(rec => rec.id !== String(id)));
        setSelectedPm(s => { const n = new Set(s); n.delete(String(id)); return n; });
        toast.success('Record deleted');
      } else if (type === 'viable') {
        await viableAPI.delete(Number(id), reason);
        setViableRecords(r => r.filter(rec => rec.id !== Number(id)));
        setSelectedViable(s => { const n = new Set(s); n.delete(Number(id)); return n; });
        toast.success('Viable record deleted');
      } else if (type === 'surface') {
        await surfaceAPI.delete(Number(id), reason);
        setSurfaceRecords(r => r.filter(rec => rec.id !== Number(id)));
        setSelectedSurface(s => { const n = new Set(s); n.delete(Number(id)); return n; });
        toast.success('Surface record deleted');
      }
      queryCache.invalidate('dashboard:');
      queryCache.invalidate('analytics:');
      queryCache.invalidate('audit-logs:');
      setDeleteModal(null);
    } catch (err: any) {
      throw err;
    }
  };

  // ── Bulk-delete: sequentially delete all selected records ─────────
  const handleBulkDeleteConfirm = async (reason: string) => {
    setBulkDeleting(true);
    let failed = 0;
    try {
      if (tab === 'pm') {
        const ids = [...selectedPm];
        for (const id of ids) {
          try { await recordsAPI.delete(id, reason); }
          catch { failed++; }
        }
        setRecords(r => r.filter(rec => !selectedPm.has(rec.id)));
        setSelectedPm(new Set());
      } else if (tab === 'viable') {
        const ids = [...selectedViable];
        for (const id of ids) {
          try { await viableAPI.delete(id, reason); }
          catch { failed++; }
        }
        setViableRecords(r => r.filter(rec => !selectedViable.has(rec.id)));
        setSelectedViable(new Set());
      } else if (tab === 'surface') {
        const ids = [...selectedSurface];
        for (const id of ids) {
          try { await surfaceAPI.delete(id, reason); }
          catch { failed++; }
        }
        setSurfaceRecords(r => r.filter(rec => !selectedSurface.has(rec.id)));
        setSelectedSurface(new Set());
      }
      queryCache.invalidate('dashboard:');
      queryCache.invalidate('analytics:');
      queryCache.invalidate('audit-logs:');
      if (failed > 0) toast.error(`${failed} record(s) could not be deleted.`);
      else toast.success('Selected records deleted.');
      setBulkDeleteOpen(false);
    } catch {
      throw new Error('Bulk delete failed. Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const openDrawer = (rec: ExcursionRecord) => {
    setDrawer({ type: 'record', label: `${rec.name} — ${rec.lot_number}`, records: [rec] });
  };

  // Patch local state instantly after a successful edit
  const handleSaved = (type: 'pm' | 'viable' | 'surface', updated: any) => {
    if (type === 'pm')      setRecords(rs => rs.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    if (type === 'viable')  setViableRecords(rs => rs.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    if (type === 'surface') setSurfaceRecords(rs => rs.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  };

  // Client-side search + sort + paginate
  const filtered = records
    .filter(r => {
      const q = search.toLowerCase();
      return !q || r.name.toLowerCase().includes(q) || r.lot_number.toLowerCase().includes(q) || (r.job_function ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortBy === 'date_of_batch') { av = a.date_of_batch ?? ''; bv = b.date_of_batch ?? ''; }
      else if (sortBy === 'name') { av = a.name; bv = b.name; }
      else { av = a.total_hits ?? 0; bv = b.total_hits ?? 0; }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) =>
    sortBy !== field ? null :
    sortDir === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />;

  const exportCSV = () => {
    if (tab === 'viable') {
      if (!viableRecords.length) return toast.error('No viable records to export');
      const flat = viableRecords.map(r => ({
        LotNumber: r.lot_number, SampleDate: fmtHitDate(r.sample_date),
        ISOClass: r.iso_class, ISO5_CFU: r.iso5_cfu, ISO7_CFU: r.iso7_cfu,
        Particle_05um: r.particle_05um, Particle_50um: r.particle_50um,
        DeviationNumber: r.deviation_number ?? '', Notes: r.notes ?? '',
        EnteredBy: r.created_by_name ?? '',
      }));
      downloadCSV(flat as any, `viable-records-${Date.now()}.csv`);
      return toast.success('CSV exported!');
    }
    if (tab === 'surface') {
      if (!surfaceRecords.length) return toast.error('No surface records to export');
      const flat = surfaceRecords.map(r => ({
        SampleLocation: r.sample_location, LotNumber: r.lot_number,
        SampleDate: fmtHitDate(r.sample_date), ISOClass: r.iso_class,
        CFU_Found: r.cfu_found, OrganismID: r.organism_id ?? '',
        DeviationNumber: r.deviation_number ?? '', Notes: r.notes ?? '',
        EnteredBy: r.created_by_name ?? '',
      }));
      downloadCSV(flat as any, `surface-records-${Date.now()}.csv`);
      return toast.success('CSV exported!');
    }
    // PM Excursion
    if (!filtered.length) return;
    const flat = filtered.map(r => ({
      Name: r.name, LotNumber: r.lot_number, DateOfBatch: fmtHitDate(r.date_of_batch),
      JobFunction: r.job_function, PersonnelType: r.personnel_type,
      ISOClass: r.iso_class, AlertLevel: r.alert_level, ActionLevel: r.action_level,
      TotalHits: Number(r.total_hits ?? 0), RecordedAt: r.timestamp,
    }));
    downloadCSV(flat as any, `records-${Date.now()}.csv`);
    toast.success('CSV exported!');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const M = 14;

    if (tab === 'viable') {
      if (!viableRecords.length) return toast.error('No viable records to export');
      doc.setFontSize(14); doc.setTextColor(40, 40, 40);
      doc.text('Viable & Non-Viable Records', M, 18);
      autoTable(doc, {
        startY: 26,
        head: [['Lot Number', 'Sample Date', 'ISO Class', 'ISO 5 CFU', 'ISO 7 CFU', '0.5 μm (p/m³)', '5.0 μm (p/m³)', 'Deviation #', 'Entered By']],
        body: viableRecords.map(r => [
          r.lot_number, fmtHitDate(r.sample_date), r.iso_class,
          r.iso5_cfu, r.iso7_cfu,
          Number(r.particle_05um).toLocaleString(), Number(r.particle_50um).toLocaleString(),
          r.deviation_number ?? '—', r.created_by_name ?? '—',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] },
        columnStyles: { 0: { cellWidth: 32 } },
      });
      doc.save(`viable-records-${Date.now()}.pdf`);
      return toast.success('PDF exported!');
    }

    if (tab === 'surface') {
      if (!surfaceRecords.length) return toast.error('No surface records to export');
      doc.setFontSize(14); doc.setTextColor(40, 40, 40);
      doc.text('Surface Sampling Records', M, 18);
      autoTable(doc, {
        startY: 26,
        head: [['Sample Location', 'Lot Number', 'Sample Date', 'ISO Class', 'CFUs Found', 'Organism', 'Deviation #', 'Entered By']],
        body: surfaceRecords.map(r => [
          r.sample_location, r.lot_number, fmtHitDate(r.sample_date),
          r.iso_class, r.cfu_found, r.organism_id ?? '—',
          r.deviation_number ?? '—', r.created_by_name ?? '—',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] },
      });
      doc.save(`surface-records-${Date.now()}.pdf`);
      return toast.success('PDF exported!');
    }

    // PM Excursion
    doc.setFontSize(14); doc.setTextColor(40, 40, 40);
    doc.text('PM Excursion Records', M, 18);
    autoTable(doc, {
        startY: M + 20,
        head: [['Name', 'Lot', 'Date of Batch', 'Type', 'ISO Class', 'Hits', 'Recorded', 'Entered By']],
        body: filtered.map(r => [
          r.name, r.lot_number, fmtHitDate(r.date_of_batch),
          r.personnel_type,
          r.iso_class,
          r.total_hits?.toString() ?? '0',
          new Date(r.timestamp).toLocaleString(),
          (r as any).created_by_name || '—'
        ]),
        headStyles: { fillColor: [99, 102, 241] },
    });
    doc.save(`records-${Date.now()}.pdf`);
    toast.success('PDF exported!');
  };


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Records</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
          {tab === 'pm' ? `${total} PM excursion records` : tab === 'viable' ? `${viableRecords.length} viable/non-viable samples` : `${surfaceRecords.length} surface sampling records`}
          </p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="btn-secondary btn-sm"><Download size={14} />CSV</button>
            <button onClick={exportPDF} className="btn-secondary btn-sm"><Download size={14} />PDF</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl w-fit">
        {([['pm','PM Excursion'],['viable','Viable & Non-Viable'],['surface','Surface Sampling']] as [RecordTab,string][]).map(([t,label]) => (
          <button key={t} onClick={() => handleTabChange(t as RecordTab)} className={clsx(
            'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
            tab === t ? 'bg-white dark:bg-surface-700 shadow text-surface-900 dark:text-white' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
          )}>{label}</button>
        ))}
      </div>

      {/* ── Bulk Action Bar ──────────────────────────────────────────── */}
      {canDelete && (() => {
        const selCount = tab === 'pm' ? selectedPm.size : tab === 'viable' ? selectedViable.size : selectedSurface.size;
        if (selCount === 0) return null;
        return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 animate-fade-in">
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">
              {selCount} record{selCount !== 1 ? 's' : ''} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={() => {
                if (tab === 'pm') setSelectedPm(new Set());
                else if (tab === 'viable') setSelectedViable(new Set());
                else setSelectedSurface(new Set());
              }}
              className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
            >
              Clear selection
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
            >
              <Trash2 size={13} /> Delete {selCount} record{selCount !== 1 ? 's' : ''}
            </button>
          </div>
        );
      })()}


      {tab === 'pm' && (
        <>
          <FilterBar filters={filters} onChange={setFilters} />
          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input type="search" placeholder="Search name, lot, function…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
          </div>
          {/* PM Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table-base min-w-[700px]">
                <thead><tr>
                  {canDelete && (
                    <th className="w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select all records on this page"
                        checked={paged.length > 0 && paged.every(r => selectedPm.has(r.id))}
                        ref={el => { if (el) el.indeterminate = paged.some(r => selectedPm.has(r.id)) && !paged.every(r => selectedPm.has(r.id)); }}
                        onChange={e => {
                          if (e.target.checked) setSelectedPm(s => new Set([...s, ...paged.map(r => r.id)]));
                          else setSelectedPm(s => { const n = new Set(s); paged.forEach(r => n.delete(r.id)); return n; });
                        }}
                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th onClick={() => toggleSort('name')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Name <SortIcon field="name" /></div></th>
                  <th>Lot Number</th>
                  <th onClick={() => toggleSort('date_of_batch')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Date of Batch <SortIcon field="date_of_batch" /></div></th>
                  <th>Type</th><th>ISO Class</th>
                  <th onClick={() => toggleSort('total_hits')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Hits <SortIcon field="total_hits" /></div></th>
                  <th>Entered By</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: canDelete ? 9 : 8 }).map((_, j) => <td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse" /></td>)}</tr>
                  )) : paged.length === 0 ? (
                    <tr><td colSpan={canDelete ? 9 : 8} className="text-center py-12 text-surface-400">No records found</td></tr>
                  ) : paged.map(rec => {
                    const hits = Number(rec.total_hits ?? rec.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0);
                    const isSelected = selectedPm.has(rec.id);
                    return (
                      <tr
                        key={rec.id}
                        className={clsx('cursor-pointer transition-colors', isSelected ? 'bg-red-50/60 dark:bg-red-900/10' : '')}
                        onClick={() => openDrawer(rec)}
                      >
                        {canDelete && (
                          <td onClick={e => e.stopPropagation()} className="w-10">
                            <input
                              type="checkbox"
                              aria-label={`Select record for ${rec.name}`}
                              checked={isSelected}
                              onChange={e => {
                                setSelectedPm(s => {
                                  const n = new Set(s);
                                  e.target.checked ? n.add(rec.id) : n.delete(rec.id);
                                  return n;
                                });
                              }}
                              className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="font-semibold text-surface-800 dark:text-surface-200">{rec.name}</td>
                        <td className="font-mono text-xs">{rec.lot_number}</td>
                        <td className="text-xs font-medium text-surface-600 dark:text-surface-400">{fmtHitDate(rec.date_of_batch)}</td>
                        <td><span className="badge bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400">{rec.personnel_type}</span></td>
                        <td><span className={rec.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{rec.iso_class}</span></td>
                        <td><span className={clsx('badge', hits > 0 ? 'badge-hit' : 'badge-no-hit')}>{hits}</span></td>
                        <td className="text-xs text-surface-500 dark:text-surface-400">{(rec as any).created_by_name || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openDrawer(rec)} className="btn-ghost p-1.5" title="View details"><Eye size={14} /></button>
                            {canDelete && (
                              <>
                                <button onClick={() => setEditTarget({ type: 'pm', record: rec })} className="btn-ghost p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit"><Pencil size={14} /></button>
                                <button
                                  onClick={() => openDeletePm(rec)}
                                  aria-label={`Delete PM record for ${rec.name}`}
                                  className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 dark:border-surface-800">
                <p className="text-xs text-surface-500">{((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => p-1)} disabled={page===1} className="btn-ghost p-1.5"><ChevronLeft size={16} /></button>
                  {Array.from({length:Math.min(pages,7)},(_,i)=>i+1).map(p=>(
                    <button key={p} onClick={() => setPage(p)} className={clsx('w-7 h-7 rounded-lg text-xs font-semibold',p===page?'bg-brand-600 text-white':'btn-ghost')}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p => p+1)} disabled={page===pages} className="btn-ghost p-1.5"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'viable' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table-base min-w-[700px]">
              <thead><tr>
                {canDelete && (
                  <th className="w-10" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Select all viable records"
                      checked={viableRecords.length > 0 && viableRecords.every(r => selectedViable.has(r.id))}
                      ref={el => { if (el) el.indeterminate = viableRecords.some(r => selectedViable.has(r.id)) && !viableRecords.every(r => selectedViable.has(r.id)); }}
                      onChange={e => {
                        if (e.target.checked) setSelectedViable(new Set(viableRecords.map(r => r.id)));
                        else setSelectedViable(new Set());
                      }}
                      className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                    />
                  </th>
                )}
                <th>Context</th><th>Lot Number</th><th>Sample Date</th><th>ISO Class</th><th>Sample Type</th><th>Location</th><th>Room</th>
                <th>CFU</th>
                <th>0.5 μm (p/m³)</th><th>5.0 μm (p/m³)</th>
                <th>Deviation #</th><th>Entered By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {subLoading ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:10}).map((_,j)=><td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse"/></td>)}</tr>
                )) : viableRecords.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-surface-400">No viable records yet</td></tr>
                ) : viableRecords.map(r => {
                  const activeCfu = r.iso_class === 'ISO 5' ? (r.iso5_cfu ?? null)
                                  : r.iso_class === 'ISO 8' ? (r.iso8_cfu ?? null)
                                  : (r.iso7_cfu ?? null);
                  const cfuSt = activeCfu !== null ? evaluateCfuStatus(activeCfu, r.iso_class as ViableISOClass) : 'normal';
                  const rowStatus = cfuSt;
                  const isViableSelected = selectedViable.has(r.id);
                  return (
                  <tr key={r.id} className={clsx(
                    isViableSelected ? 'bg-red-50/60 dark:bg-red-900/10' :
                    rowStatus === 'action' ? 'bg-red-50/60 dark:bg-red-900/10' :
                    rowStatus === 'alert'  ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''
                  )}>
                    {canDelete && (
                      <td onClick={e => e.stopPropagation()} className="w-10">
                        <input
                          type="checkbox"
                          aria-label={`Select viable record for lot ${r.lot_number}`}
                          checked={isViableSelected}
                          onChange={e => { setSelectedViable(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; }); }}
                          className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="text-xs font-semibold">{(() => {
                      const ctx = (r as any).monitoring_context;
                      if (ctx === 'ROUTINE_MONTHLY') return <span className="text-emerald-600 dark:text-emerald-400">Routine Monthly</span>;
                      if (ctx === 'OTHER') return <span className="text-amber-600 dark:text-amber-400">Other</span>;
                      return <span className="text-brand-600 dark:text-brand-400">Batch</span>;
                    })()}</td>
                    <td className="font-mono text-xs">{r.lot_number || <span className="text-surface-400 dark:text-surface-500">—</span>}</td>
                    <td className="text-xs">{fmtHitDate(r.sample_date)}</td>
                    <td><span className={r.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{r.iso_class}</span></td>
                    <td className="text-xs text-surface-600 dark:text-surface-400">{(r as any).sample_type === 'NONVIABLE_AIR' ? 'Non-Viable' : 'Viable Air'}</td>
                    <td className="text-xs text-surface-600 dark:text-surface-300">{(r as any).sample_location || '—'}</td>
                    <td className="text-xs text-surface-600 dark:text-surface-300">{r.room_number || '—'}</td>
                    <td>{activeCfu !== null ? <CfuBadge val={activeCfu} isoClass={r.iso_class} /> : <span className="text-surface-400 text-xs">—</span>}</td>
                    <td>{r.particle_05um !== null && r.particle_05um !== undefined ? <ParticleBadge val={Number(r.particle_05um)} t={(PARTICLE_THRESHOLDS[r.iso_class] ?? PARTICLE_THRESHOLDS['ISO 7']).um05} /> : <span className="text-surface-400 text-xs">—</span>}</td>
                    <td>{r.particle_50um !== null && r.particle_50um !== undefined ? <ParticleBadge val={Number(r.particle_50um)} t={(PARTICLE_THRESHOLDS[r.iso_class] ?? PARTICLE_THRESHOLDS['ISO 7']).um50} /> : <span className="text-surface-400 text-xs">—</span>}</td>
                    <td className="text-xs">{r.deviation_number || '—'}</td>
                    <td className="text-xs">{r.created_by_name || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViableLot(r.lot_number)} className="btn-ghost p-1.5" title="View lot records"><Eye size={14} /></button>
                        {canDelete && (
                          <>
                            <button onClick={() => setEditTarget({ type: 'viable', record: r })} className="btn-ghost p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit"><Pencil size={14} /></button>
                            <button
                              onClick={() => openDeleteViable(r)}
                              aria-label={`Delete viable record for lot ${r.lot_number}`}
                              className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'surface' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table-base min-w-[700px]">
              <thead><tr>
                {canDelete && (
                  <th className="w-10" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Select all surface records"
                      checked={surfaceRecords.length > 0 && surfaceRecords.every(r => selectedSurface.has(r.id))}
                      ref={el => { if (el) el.indeterminate = surfaceRecords.some(r => selectedSurface.has(r.id)) && !surfaceRecords.every(r => selectedSurface.has(r.id)); }}
                      onChange={e => {
                        if (e.target.checked) setSelectedSurface(new Set(surfaceRecords.map(r => r.id)));
                        else setSelectedSurface(new Set());
                      }}
                      className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                    />
                  </th>
                )}
                <th>Context</th><th>Sample Location</th><th>Lot Number</th><th>Sample Date</th>
                <th>ISO Class</th><th>CFUs Found</th><th>Organism</th>
                <th>Deviation #</th><th>Entered By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {subLoading ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:canDelete?10:9}).map((_,j)=><td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse"/></td>)}</tr>
                )) : surfaceRecords.length === 0 ? (
                  <tr><td colSpan={canDelete?10:9} className="text-center py-12 text-surface-400">No surface records yet</td></tr>
                ) : surfaceRecords.map(r => {
                  const isSurfaceSelected = selectedSurface.has(r.id);
                  return (
                  <tr key={r.id} className={clsx(isSurfaceSelected ? 'bg-red-50/60 dark:bg-red-900/10' : '')}>
                    {canDelete && (
                      <td onClick={e => e.stopPropagation()} className="w-10">
                        <input
                          type="checkbox"
                          aria-label={`Select surface record for ${r.sample_location}`}
                          checked={isSurfaceSelected}
                          onChange={e => { setSelectedSurface(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; }); }}
                          className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="text-xs font-semibold">{(() => {
                      const ctx = (r as any).monitoring_context;
                      if (ctx === 'ROUTINE_WEEKLY') return <span className="text-emerald-600 dark:text-emerald-400">Routine Weekly</span>;
                      if (ctx === 'OTHER') return <span className="text-amber-600 dark:text-amber-400">Other</span>;
                      return <span className="text-brand-600 dark:text-brand-400">Batch</span>;
                    })()}</td>
                    <td className="font-semibold text-surface-800 dark:text-surface-200">{r.sample_location}</td>
                    <td className="font-mono text-xs">{r.lot_number || <span className="text-surface-400">—</span>}</td>
                    <td className="text-xs">{fmtHitDate(r.sample_date)}</td>
                    <td><span className={r.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{r.iso_class}</span></td>
                    <td>{r.cfu_found !== null && r.cfu_found !== undefined ? <span className={clsx('badge', r.cfu_found > 0 ? 'badge-hit' : 'badge-no-hit')}>{r.cfu_found}</span> : <span className="text-surface-400 text-xs">—</span>}</td>
                    <td className="text-xs">{r.organism_id || '—'}</td>
                    <td className="text-xs">{r.deviation_number || '—'}</td>
                    <td className="text-xs">{r.created_by_name || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toast(`📍 ${r.sample_location} | ${r.iso_class} | ${r.cfu_found} CFU${r.organism_id ? ` | ${r.organism_id}` : ''}`, { duration: 4000 })} className="btn-ghost p-1.5" title="View details"><Eye size={14} /></button>
                        {canDelete && (
                          <>
                            <button onClick={() => setEditTarget({ type: 'surface', record: r })} className="btn-ghost p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit"><Pencil size={14} /></button>
                            <button
                              onClick={() => openDeleteSurface(r)}
                              aria-label={`Delete surface record for ${r.sample_location}`}
                              className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DrillDownDrawer data={drawer} onClose={() => setDrawer(null)} />
      <ViableDrawer lot={viableLot} records={viableRecords.filter(r => r.lot_number === viableLot)} onClose={() => setViableLot(null)} />
      <EditRecordModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />

      {/* Single-record Delete Modal */}
      {deleteModal && (
        <DeleteConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleDeleteConfirm}
          recordType={deleteModal.recordType}
          summary={deleteModal.summary}
        />
      )}

      {/* Bulk Delete Modal */}
      {canDelete && (() => {
        const selCount = tab === 'pm' ? selectedPm.size : tab === 'viable' ? selectedViable.size : selectedSurface.size;
        const recordTypeLabel = tab === 'pm' ? 'PM Monitoring' : tab === 'viable' ? 'Environmental/Viable' : 'Surface Sampling';
        return (
          <DeleteConfirmModal
            isOpen={bulkDeleteOpen}
            onClose={() => setBulkDeleteOpen(false)}
            onConfirm={handleBulkDeleteConfirm}
            recordType={`${selCount} ${recordTypeLabel}`}
            summary={{ batch: `${selCount} record${selCount !== 1 ? 's' : ''} selected — one reason applies to all` }}
          />
        );
      })()}
    </div>
  );
}
