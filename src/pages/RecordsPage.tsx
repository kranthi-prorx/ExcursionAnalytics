import { useState, useEffect, useCallback } from 'react';
import type { ExcursionRecord, FilterState, DrillDownData } from '../types';
import { recordsAPI, viableAPI, surfaceAPI } from '../lib/api';
import type { ViableRecord, SurfaceRecord } from '../lib/api';
import FilterBar from '../components/FilterBar';
import DrillDownDrawer from '../components/DrillDownDrawer';
import ViableDrawer from '../components/ViableDrawer';
import { getDefaultFilters, formatDate, clsx, downloadCSV } from '../lib/utils';
import { Eye, Trash2, Download, Search, SortAsc, SortDesc, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import EditRecordModal from '../components/EditRecordModal';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE_SIZE = 15;
type RecordTab = 'pm' | 'viable' | 'surface';

// CFU alert / action thresholds (mirrors ViableDataEntryPage)
const CFU5 = { alert: Infinity, action: 1  }; // ISO 5: N/A alert, action ≥ 1
const CFU7 = { alert: 5,        action: 10 }; // ISO 7: alert ≥ 5, action ≥ 10

// Particle count thresholds per ISO class (mirrors ViableDataEntryPage)
const PARTICLE_THRESHOLDS: Record<string, { um05: { alert: number; action: number }; um50: { alert: number; action: number } }> = {
  'ISO 5': { um05: { alert: 3_000,     action: 3_520     }, um50: { alert: 20,     action: 29      } },
  'ISO 7': { um05: { alert: 300_000,   action: 352_000   }, um50: { alert: 2_000,  action: 2_930   } },
  'ISO 8': { um05: { alert: 3_000_000, action: 3_520_000 }, um50: { alert: 20_000, action: 29_300  } },
};

function cfuStatus(val: number, t: { alert: number; action: number }) {
  if (val >= t.action) return 'action';
  if (val >= t.alert)  return 'alert';
  return 'ok';
}

function CfuBadge({ val, t }: { val: number; t: { alert: number; action: number } }) {
  const s = cfuStatus(val, t);
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
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters('monthly'));
  const [records, setRecords] = useState<ExcursionRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [sortBy, setSortBy]   = useState<'hit_date' | 'name' | 'total_hits'>('hit_date');
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

  const canDelete = user?.role === 'admin' || user?.role === 'manager';
  const canExport = user?.role === 'admin' || user?.role === 'manager';

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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record permanently?')) return;
    setDeleting(id);
    try {
      await recordsAPI.delete(id);
      setRecords(r => r.filter(rec => rec.id !== id));
      toast.success('Record deleted');
    } catch {
      toast.error('Failed to delete record');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteViable = async (id: number) => {
    if (!confirm('Delete this viable record permanently?')) return;
    setDeletingViable(id);
    try {
      await viableAPI.delete(id);
      setViableRecords(r => r.filter(rec => rec.id !== id));
      toast.success('Viable record deleted');
    } catch { toast.error('Failed to delete record'); }
    finally { setDeletingViable(null); }
  };

  const handleDeleteSurface = async (id: number) => {
    if (!confirm('Delete this surface record permanently?')) return;
    setDeletingSurface(id);
    try {
      await surfaceAPI.delete(id);
      setSurfaceRecords(r => r.filter(rec => rec.id !== id));
      toast.success('Surface record deleted');
    } catch { toast.error('Failed to delete record'); }
    finally { setDeletingSurface(null); }
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
      if (sortBy === 'hit_date') { av = a.hit_date ?? ''; bv = b.hit_date ?? ''; }
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
      Name: r.name, LotNumber: r.lot_number, HitDate: fmtHitDate(r.hit_date),
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
      startY: 26,
      head: [['Name', 'Lot', 'Hit Date', 'Type', 'ISO', 'Hits', 'Recorded At']],
      body: filtered.map(r => [r.name, r.lot_number, fmtHitDate(r.hit_date), r.personnel_type, r.iso_class, r.total_hits ?? 0, new Date(r.timestamp).toLocaleString()]),
      styles: { fontSize: 9 },
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
            {tab === 'pm' ? `${total} PM excursion records` : tab === 'viable' ? `${viableRecords.length} viable/non-viable records` : `${surfaceRecords.length} surface sampling records`}
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
          <button key={t} onClick={() => setTab(t)} className={clsx(
            'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
            tab === t ? 'bg-white dark:bg-surface-700 shadow text-surface-900 dark:text-white' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
          )}>{label}</button>
        ))}
      </div>

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
                  <th onClick={() => toggleSort('name')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Name <SortIcon field="name" /></div></th>
                  <th>Lot Number</th>
                  <th onClick={() => toggleSort('hit_date')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Hit Date <SortIcon field="hit_date" /></div></th>
                  <th>Type</th><th>ISO Class</th>
                  <th onClick={() => toggleSort('total_hits')} className="cursor-pointer hover:text-surface-700 dark:hover:text-surface-200"><div className="flex items-center gap-1">Hits <SortIcon field="total_hits" /></div></th>
                  <th>Entered By</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse" /></td>)}</tr>
                  )) : paged.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-surface-400">No records found</td></tr>
                  ) : paged.map(rec => {
                    const hits = Number(rec.total_hits ?? rec.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0);
                    return (
                      <tr key={rec.id} className="cursor-pointer" onClick={() => openDrawer(rec)}>
                        <td className="font-semibold text-surface-800 dark:text-surface-200">{rec.name}</td>
                        <td className="font-mono text-xs">{rec.lot_number}</td>
                        <td className="text-xs font-medium text-surface-600 dark:text-surface-400">{fmtHitDate(rec.hit_date)}</td>
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
                                <button onClick={() => handleDelete(rec.id)} disabled={deleting === rec.id}
                                  className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                                  {deleting === rec.id ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <Trash2 size={14} />}
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
                <th>Lot Number</th><th>Sample Date</th><th>ISO Class</th><th>Room</th>
                <th>ISO 5 CFU</th><th>ISO 7 CFU</th>
                <th>0.5 μm (p/m³)</th><th>5.0 μm (p/m³)</th>
                <th>Deviation #</th><th>Entered By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {subLoading ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:10}).map((_,j)=><td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse"/></td>)}</tr>
                )) : viableRecords.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-surface-400">No viable records yet</td></tr>
                ) : viableRecords.map(r => {
                  const s5 = cfuStatus(r.iso5_cfu, CFU5);
                  const s7 = cfuStatus(r.iso7_cfu, CFU7);
                  const rowStatus = s5 === 'action' || s7 === 'action' ? 'action'
                                  : s5 === 'alert'  || s7 === 'alert'  ? 'alert' : 'ok';
                  return (
                  <tr key={r.id} className={clsx(
                    rowStatus === 'action' ? 'bg-red-50/60 dark:bg-red-900/10' :
                    rowStatus === 'alert'  ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''
                  )}>
                    <td className="font-mono text-xs">{r.lot_number}</td>
                    <td className="text-xs">{fmtHitDate(r.sample_date)}</td>
                    <td><span className={r.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{r.iso_class}</span></td>
                    <td className="text-xs text-surface-600 dark:text-surface-300">{r.room_number || '—'}</td>
                    <td><CfuBadge val={r.iso5_cfu} t={CFU5} /></td>
                    <td><CfuBadge val={r.iso7_cfu} t={CFU7} /></td>
                    <td><ParticleBadge val={Number(r.particle_05um)} t={(PARTICLE_THRESHOLDS[r.iso_class] ?? PARTICLE_THRESHOLDS['ISO 7']).um05} /></td>
                    <td><ParticleBadge val={Number(r.particle_50um)} t={(PARTICLE_THRESHOLDS[r.iso_class] ?? PARTICLE_THRESHOLDS['ISO 7']).um50} /></td>
                    <td className="text-xs">{r.deviation_number || '—'}</td>
                    <td className="text-xs">{r.created_by_name || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViableLot(r.lot_number)} className="btn-ghost p-1.5" title="View lot records"><Eye size={14} /></button>
                        {canDelete && (
                          <>
                            <button onClick={() => setEditTarget({ type: 'viable', record: r })} className="btn-ghost p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteViable(r.id)} disabled={deletingViable === r.id}
                              className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                              {deletingViable === r.id ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <Trash2 size={14} />}
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
                <th>Sample Location</th><th>Lot Number</th><th>Sample Date</th>
                <th>ISO Class</th><th>CFUs Found</th><th>Organism</th>
                <th>Deviation #</th><th>Entered By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {subLoading ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:9}).map((_,j)=><td key={j}><div className="h-4 bg-surface-100 dark:bg-surface-700 rounded animate-pulse"/></td>)}</tr>
                )) : surfaceRecords.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-surface-400">No surface records yet</td></tr>
                ) : surfaceRecords.map(r => (
                  <tr key={r.id}>
                    <td className="font-semibold text-surface-800 dark:text-surface-200">{r.sample_location}</td>
                    <td className="font-mono text-xs">{r.lot_number}</td>
                    <td className="text-xs">{fmtHitDate(r.sample_date)}</td>
                    <td><span className={r.iso_class === 'ISO 5' ? 'badge-iso5' : 'badge-iso7'}>{r.iso_class}</span></td>
                    <td><span className={clsx('badge', r.cfu_found > 0 ? 'badge-hit' : 'badge-no-hit')}>{r.cfu_found}</span></td>
                    <td className="text-xs">{r.organism_id || '—'}</td>
                    <td className="text-xs">{r.deviation_number || '—'}</td>
                    <td className="text-xs">{r.created_by_name || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toast(`📍 ${r.sample_location} | ${r.iso_class} | ${r.cfu_found} CFU${r.organism_id ? ` | ${r.organism_id}` : ''}`, { duration: 4000 })} className="btn-ghost p-1.5" title="View details"><Eye size={14} /></button>
                        {canDelete && (
                          <>
                            <button onClick={() => setEditTarget({ type: 'surface', record: r })} className="btn-ghost p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20" title="Edit"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteSurface(r.id)} disabled={deletingSurface === r.id}
                              className="btn-ghost p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                              {deletingSurface === r.id ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <Trash2 size={14} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DrillDownDrawer data={drawer} onClose={() => setDrawer(null)} />
      <ViableDrawer lot={viableLot} records={viableRecords.filter(r => r.lot_number === viableLot)} onClose={() => setViableLot(null)} />
      <EditRecordModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
    </div>
  );
}
