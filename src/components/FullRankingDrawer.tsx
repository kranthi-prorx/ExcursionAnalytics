import { useState, useMemo } from 'react';
import type { PersonHits, LotHits, ExcursionRecord, DrillDownData } from '../types';
import { Search, X, ChevronUp, ChevronDown, ArrowRight, Users, Package } from 'lucide-react';
import { clsx } from '../lib/utils';

type SortKey = 'rank' | 'name' | 'hits' | 'records' | 'iso5' | 'iso7';
type SortDir = 'asc' | 'desc';

interface Props {
  type: 'person' | 'lot';
  data: PersonHits[] | LotHits[];
  allRecords: ExcursionRecord[];
  onDrillDown: (data: DrillDownData) => void;
  onClose: () => void;
}

const PAGE_SIZE = 25;

export default function FullRankingDrawer({ type, data, allRecords, onDrillDown, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown size={10} className="opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-brand-500" />
      : <ChevronDown size={10} className="text-brand-500" />;
  };

  // Rank, filter, sort
  const ranked = useMemo(() => {
    // Add rank (by hits descending)
    const sorted = [...data].sort((a, b) => b.hits - a.hits);
    const withRank = sorted.map((d, i) => ({ ...d, rank: i + 1 }));

    // Filter
    const q = search.trim().toLowerCase();
    const filtered = q
      ? withRank.filter(d => {
          const label = type === 'person'
            ? (d as PersonHits).name
            : (d as LotHits).lot_number;
          return label.toLowerCase().includes(q);
        })
      : withRank;

    // Sort
    const comparator = (a: any, b: any) => {
      let aVal: any, bVal: any;
      if (sortKey === 'name') {
        aVal = type === 'person' ? a.name : a.lot_number;
        bVal = type === 'person' ? b.name : b.lot_number;
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = a[sortKey] ?? 0;
      bVal = b[sortKey] ?? 0;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    };

    return filtered.sort(comparator);
  }, [data, search, sortKey, sortDir, type]);

  const totalPages = Math.ceil(ranked.length / PAGE_SIZE);
  const pageData = ranked.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isPersonnel = type === 'person';

  const handleRowClick = (item: any) => {
    const label = isPersonnel ? item.name : item.lot_number;
    const normKey = label.trim().replace(/\s+/g, ' ').toLowerCase();
    const recs = allRecords.filter(r => {
      const key = isPersonnel
        ? r.name.trim().replace(/\s+/g, ' ').toLowerCase()
        : r.lot_number.trim().replace(/\s+/g, ' ').toLowerCase();
      return key === normKey;
    });
    onDrillDown({
      type: isPersonnel ? 'person' : 'lot',
      label: `${isPersonnel ? '👤' : '📦'} ${label}`,
      records: recs,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-surface-900 shadow-2xl overflow-hidden flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2">
            {isPersonnel ? <Users size={18} className="text-brand-500" /> : <Package size={18} className="text-brand-500" />}
            <h2 className="text-lg font-bold text-surface-900 dark:text-white">
              All {isPersonnel ? 'Personnel' : 'Lots'} ({data.length})
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-xl">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-surface-100 dark:border-surface-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder={`Search ${isPersonnel ? 'personnel' : 'lots'}…`}
              className="input !pl-9 w-full"
            />
          </div>
          <p className="text-xs text-surface-400 mt-2">
            {ranked.length} result{ranked.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
            {' · '} Click any row to view details
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="table-base w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-surface-900 z-10">
              <tr>
                <th className="w-14 cursor-pointer" onClick={() => toggleSort('rank')}>
                  <span className="flex items-center gap-1"># <SortIcon col="rank" /></span>
                </th>
                <th className="cursor-pointer" onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">{isPersonnel ? 'Name' : 'Lot'} <SortIcon col="name" /></span>
                </th>
                <th className="text-center cursor-pointer" onClick={() => toggleSort('hits')}>
                  <span className="flex items-center justify-center gap-1">Hits <SortIcon col="hits" /></span>
                </th>
                <th className="text-center cursor-pointer" onClick={() => toggleSort('records')}>
                  <span className="flex items-center justify-center gap-1">Records <SortIcon col="records" /></span>
                </th>
                {isPersonnel && (
                  <>
                    <th className="text-center cursor-pointer" onClick={() => toggleSort('iso5')}>
                      <span className="flex items-center justify-center gap-1">ISO 5 <SortIcon col="iso5" /></span>
                    </th>
                    <th className="text-center cursor-pointer" onClick={() => toggleSort('iso7')}>
                      <span className="flex items-center justify-center gap-1">ISO 7 <SortIcon col="iso7" /></span>
                    </th>
                  </>
                )}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {pageData.map((item: any) => (
                <tr
                  key={item.rank}
                  className="cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                  onClick={() => handleRowClick(item)}
                >
                  <td className="font-mono text-surface-400 text-center">{item.rank}</td>
                  <td className="font-medium text-surface-900 dark:text-white">
                    {isPersonnel ? item.name : item.lot_number}
                    {isPersonnel && item.personnel_type && (
                      <span className="ml-2 text-[10px] text-surface-400">
                        {item.personnel_type === 'Filling' ? 'F/S' : 'C/H'}
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    <span className={clsx('badge', item.hits > 0 ? 'badge-hit' : 'badge-no-hit')}>
                      {item.hits}
                    </span>
                  </td>
                  <td className="text-center text-surface-500">{item.records ?? '—'}</td>
                  {isPersonnel && (
                    <>
                      <td className="text-center text-surface-500">{item.iso5 ?? 0}</td>
                      <td className="text-center text-surface-500">{item.iso7 ?? 0}</td>
                    </>
                  )}
                  <td>
                    <ArrowRight size={14} className="text-surface-300" />
                  </td>
                </tr>
              ))}
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={isPersonnel ? 7 : 5} className="text-center text-surface-400 py-8">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 dark:border-surface-800">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary btn-sm"
            >
              Previous
            </button>
            <span className="text-xs text-surface-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
