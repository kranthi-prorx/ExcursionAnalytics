import { useState, useEffect, useCallback } from 'react';
import type { FilterState, TrendData, PersonHits, LocationHits, DrillDownData, ExcursionRecord } from '../types';
import { analyticsAPI, recordsAPI, viableAPI } from '../lib/api';
import { queryCache } from '../lib/queryCache';
import type { ViableByLot, ViableRecord } from '../lib/api';
import FilterBar from '../components/FilterBar';
import { TrendsChart, PersonChart, LocationChart, ISOPieChart, HeatmapChart, LotChart, LotTrendsChart, ViableCFUChart, ParticleCountChart } from '../components/Charts';
import DrillDownDrawer from '../components/DrillDownDrawer';
import ViableDrawer from '../components/ViableDrawer';
import { getDefaultFilters, downloadCSV } from '../lib/utils';
import { Activity, TrendingUp, Users, MapPin, Shield, Package, Grid, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toJpeg } from 'html-to-image';
import { useAuth } from '../contexts/AuthContext';

function ChartCard({ title, icon: Icon, children, subtitle, className, id }: {
  title: string; icon: React.ElementType; children: React.ReactNode; subtitle?: string; className?: string; id?: string;
}) {
  return (
    <div id={id} className={`chart-container ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon size={14} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="chart-title">{title}</h3>
            {subtitle && <p className="text-xs text-surface-400 dark:text-surface-500">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="animate-pulse bg-surface-100 dark:bg-surface-700 rounded-xl h-60" />;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const canExport = user?.role === 'admin' || user?.role === 'manager';
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters('monthly'));
  const [trends,    setTrends]    = useState<TrendData[]>([]);
  const [persons,   setPersons]   = useState<PersonHits[]>([]);
  const [locations, setLocations] = useState<LocationHits[]>([]);
  const [lots,      setLots]      = useState<{ lot_number: string; hits: number }[]>([]);
  const [isoData,   setIsoData]   = useState<{ iso_class: string; hits: number }[]>([]);
  const [lotTrends, setLotTrends] = useState<{ date: string; lot_number: string; hits: number }[]>([]);
  const [viableByLot, setViableByLot] = useState<ViableByLot[]>([]);
  const [viableAll, setViableAll]     = useState<ViableRecord[]>([]);
  const [viableLot, setViableLot]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [drawer,    setDrawer]    = useState<DrillDownData | null>(null);
  const [allRecords, setAllRecords] = useState<ExcursionRecord[]>([]);

  const fetchAll = useCallback(async (force = false) => {
    const cacheKey = `analytics:${JSON.stringify(filters)}`;
    if (!force) {
      const cached = queryCache.get<{
        trends: TrendData[]; persons: PersonHits[]; locations: LocationHits[];
        lots: { lot_number: string; hits: number }[];
        isoData: { iso_class: string; hits: number }[];
        lotTrends: { date: string; lot_number: string; hits: number }[];
        allRecords: ExcursionRecord[]; viableByLot: ViableByLot[]; viableAll: ViableRecord[];
      }>(cacheKey);
      if (cached) {
        setTrends(cached.trends); setPersons(cached.persons); setLocations(cached.locations);
        setLots(cached.lots); setIsoData(cached.isoData); setLotTrends(cached.lotTrends);
        setAllRecords(cached.allRecords); setViableByLot(cached.viableByLot); setViableAll(cached.viableAll);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    try {
      const [trendRes, personRes, locRes, lotRes, isoRes, lotTrendRes, recRes, viableRes, viableAllRes] = await Promise.allSettled([
        analyticsAPI.trends(filters),
        analyticsAPI.byPerson(filters),
        analyticsAPI.byLocation(filters),
        analyticsAPI.byLot(filters),
        analyticsAPI.byIso(filters),
        analyticsAPI.trendsByLot(filters),
        recordsAPI.getAll(filters),
        viableAPI.getByLot(),
        viableAPI.getAll(),
      ]);
      const next = {
        trends:     trendRes.status    === 'fulfilled' ? trendRes.value.data          : trends,
        persons:    personRes.status   === 'fulfilled' ? personRes.value.data         : persons,
        locations:  locRes.status      === 'fulfilled' ? locRes.value.data            : locations,
        lots:       lotRes.status      === 'fulfilled' ? lotRes.value.data            : lots,
        isoData:    isoRes.status      === 'fulfilled' ? isoRes.value.data            : isoData,
        lotTrends:  lotTrendRes.status === 'fulfilled' ? lotTrendRes.value.data       : lotTrends,
        allRecords: recRes.status      === 'fulfilled' ? recRes.value.data.records    : allRecords,
        viableByLot: viableRes.status  === 'fulfilled' ? viableRes.value.data         : viableByLot,
        viableAll:  viableAllRes.status=== 'fulfilled' ? viableAllRes.value.data      : viableAll,
      };
      setTrends(next.trends); setPersons(next.persons); setLocations(next.locations);
      setLots(next.lots); setIsoData(next.isoData); setLotTrends(next.lotTrends);
      setAllRecords(next.allRecords); setViableByLot(next.viableByLot); setViableAll(next.viableAll);
      queryCache.set(cacheKey, next);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDrawer = (type: DrillDownData['type'], label: string, recs: ExcursionRecord[]) =>
    setDrawer({ type, label, records: recs });

  const exportCSV = () => {
    if (!allRecords.length) return;
    const flat = allRecords.map(r => ({
      Name: r.name, LotNumber: r.lot_number, ISOClass: r.iso_class,
      TotalHits: r.total_hits ?? 0, Timestamp: r.timestamp,
    }));
    downloadCSV(flat as any, `analytics-${Date.now()}.csv`);
    toast.success('CSV exported!');
  };

  const exportPDF = async () => {
    const tid = toast.loading('Generating PDF with charts…');
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 14;
      const usableW = W - M * 2;

      // Header
      doc.setFontSize(16); doc.setTextColor(40, 40, 40);
      doc.text('Analytics Report', M, 18);
      doc.setFontSize(9); doc.setTextColor(100, 100, 100);

      // Capture + embed charts
      const chartDefs = [
        { id: 'achart-trends',      wide: true  },
        { id: 'achart-person',      wide: false },
        { id: 'achart-iso',         wide: false },
        { id: 'achart-location',    wide: false },
        { id: 'achart-lot',         wide: false },
        { id: 'achart-heatmap',     wide: true  },
        { id: 'achart-viable-cfu',  wide: false },
        { id: 'achart-particle',    wide: false },
      ];
      const capture = async (elId: string) => {
        const el = document.getElementById(elId);
        if (!el) return null;
        try {
          const dataUrl = await toJpeg(el, {
            quality: 0.8,
            backgroundColor: '#ffffff',
            pixelRatio: 1.5,
          });
          const rect = el.getBoundingClientRect();
          return { dataUrl, w: rect.width * 1.5, h: rect.height * 1.5 };
        } catch (err) {
          console.error(`Failed to capture ${elId}:`, err);
          return null;
        }
      };

      // Capture all elements in parallel
      const images = await Promise.all(
        chartDefs.map(async def => {
          const img = await capture(def.id);
          return { def, img };
        })
      );


      let y = 32;
      const halfW = (usableW - 5) / 2;
      for (let i = 0; i < images.length; i++) {
        const { def, img } = images[i];
        if (!img) continue;
        if (def.wide) {
          const ih = (img.h / img.w) * usableW;
          if (y + ih > H - M) { doc.addPage(); y = M; }
          doc.addImage(img.dataUrl, 'JPEG', M, y, usableW, ih);
          y += ih + 5;
        } else {
          const ih1 = (img.h / img.w) * halfW;
          if (y + ih1 > H - M) { doc.addPage(); y = M; }
          doc.addImage(img.dataUrl, 'JPEG', M, y, halfW, ih1);
          const nxt = images[i + 1];
          if (nxt && !nxt.def.wide && nxt.img) {
            const ih2 = (nxt.img.h / nxt.img.w) * halfW;
            doc.addImage(nxt.img.dataUrl, 'JPEG', M + halfW + 5, y, halfW, ih2);
            y += Math.max(ih1, ih2) + 5;
            i++; // skip next item as it was rendered side-by-side
          } else {
            y += ih1 + 5;
          }
        }
      }

      // Viable / Non-Viable summary table
      if (viableByLot.length > 0) {
        doc.addPage();
        doc.setFontSize(12); doc.setTextColor(40, 40, 40);
        doc.text('Viable & Non-Viable Summary by Lot', M, M + 8);
        autoTable(doc, {
          startY: M + 13,
          head: [['Lot Number', 'Samples', 'ISO 5 CFU', 'ISO 7 CFU', 'Avg 0.5μm', 'Avg 5.0μm']],
          body: viableByLot.map(r => [
            r.lot_number, r.sample_count, r.iso5_total, r.iso7_total,
            Number(r.avg_05um).toFixed(1), Number(r.avg_50um).toFixed(1),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [99, 102, 241] },
        });
      }

      // Personnel table
      if (persons.length > 0) {
        doc.addPage();
        doc.setFontSize(12); doc.setTextColor(40, 40, 40);
        doc.text('Top Personnel by Hit Count', M, M + 8);
        autoTable(doc, {
          startY: M + 13,
          head: [['Name', 'Total Hits', 'ISO 5', 'ISO 7', 'Records']],
          body: [...persons].sort((a, b) => b.hits - a.hits).map(p => [
            p.name, p.hits, p.iso5, p.iso7, p.records,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [99, 102, 241] },
        });
      }

      doc.save(`analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.dismiss(tid);
      toast.success('PDF with charts saved!');
    } catch (err) {
      console.error('PDF error:', err);
      toast.dismiss(tid);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Analytics</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">Deep-dive analytics for excursion hits</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAll(true)} className="btn-secondary btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
          {canExport && (
            <>
              <button onClick={exportCSV} className="btn-secondary btn-sm"><Download size={14} />CSV</button>
              <button onClick={exportPDF} className="btn-secondary btn-sm"><Download size={14} />PDF</button>
            </>
          )}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
          {[
            { label: 'Total Records',  value: allRecords.length,                                                        icon: Activity,  color: 'text-brand-600  bg-brand-50  dark:bg-brand-900/20'  },
            { label: 'Total Hits',     value: allRecords.reduce((s, r) => s + Number(r.total_hits ?? 0), 0),             icon: TrendingUp, color: 'text-red-600    bg-red-50    dark:bg-red-900/20'    },
            { label: 'Persons Tracked',value: persons.length,                                                          icon: Users,     color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Lots Tracked',   value: lots.length,                                                             icon: Package,   color: 'text-purple-600  bg-purple-50  dark:bg-purple-900/20'  },
          ].map(s => (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard id="achart-trends" title="Hits Over Time" icon={TrendingUp} subtitle="Click data points to drill down" className="col-span-1 lg:col-span-2">
          {loading ? <Skeleton /> : <TrendsChart data={trends} onBarClick={d => {
            const recs = allRecords.filter(r => r.hit_date === d.date);
            openDrawer('record', `📅 ${d.date}  —  ${d.hits} hit${d.hits !== 1 ? 's' : ''}`, recs);
          }} />}
        </ChartCard>

        <ChartCard id="achart-person" title="Hits per Person" icon={Users} subtitle="Click bars to view person records">
          {loading ? <Skeleton /> : (
            <PersonChart data={persons} onBarClick={d => openDrawer('person', d.name, allRecords.filter(r => r.name === d.name))} />
          )}
        </ChartCard>

        <ChartCard id="achart-iso" title="ISO Class Distribution" icon={Shield} subtitle="Click slices to filter by class">
          {loading ? <Skeleton /> : (
            <ISOPieChart data={isoData} onSliceClick={iso => openDrawer('iso', iso, allRecords.filter(r => r.iso_class === iso))} />
          )}
        </ChartCard>

        <ChartCard id="achart-location" title="Hits per Location" icon={MapPin} subtitle="Click bars to view location records">
          {loading ? <Skeleton /> : (
            <LocationChart data={locations} onBarClick={d => openDrawer('location', d.location, allRecords.filter(r => r.hit_details?.some(h => h.location === d.location && (h.hit_value ?? 0) > 0)))} />
          )}
        </ChartCard>

        <ChartCard id="achart-lot" title="Hits per Lot Number" icon={Package}>
          {loading ? <Skeleton /> : (
            <LotChart data={lots} onBarClick={lot => openDrawer('lot', lot, allRecords.filter(r => r.lot_number === lot))} />
          )}
        </ChartCard>

        <ChartCard id="achart-heatmap" title="Location Heatmap" icon={Grid} subtitle="Intensity = relative hit frequency" className="col-span-1 lg:col-span-2">
          {loading ? <div className="animate-pulse bg-surface-100 dark:bg-surface-700 rounded-xl h-28" /> : (
            <HeatmapChart data={locations} />
          )}
        </ChartCard>

        <ChartCard id="achart-viable-cfu" title="Viable CFU by Lot" icon={Shield} subtitle="ISO 5 and ISO 7 colony counts per lot">
          {loading ? <Skeleton /> : <ViableCFUChart data={viableByLot} onBarClick={setViableLot} />}
        </ChartCard>

        <ChartCard id="achart-particle" title="Particle Count by Lot" icon={Package} subtitle="Average 0.5μm and 5.0μm per lot">
          {loading ? <Skeleton /> : <ParticleCountChart data={viableByLot} onBarClick={setViableLot} />}
        </ChartCard>
      </div>

      {/* Top performers table */}
      {!loading && persons.length > 0 && (
        <div className="card p-5">
          <h3 className="chart-title mb-4 flex items-center gap-2"><Users size={16} className="text-brand-500" />Top Personnel by Hit Count</h3>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Rank</th><th>Name</th><th>Total Hits</th><th>ISO 5</th><th>ISO 7</th><th>Records</th><th>Hit Rate</th>
                </tr>
              </thead>
              <tbody>
                {[...persons].sort((a, b) => b.hits - a.hits).slice(0, 10).map((p, i) => (
                  <tr key={p.name} onClick={() => openDrawer('person', p.name, allRecords.filter(r => r.name === p.name))} className="cursor-pointer">
                    <td className="font-mono font-bold text-surface-400">#{i + 1}</td>
                    <td className="font-semibold text-surface-800 dark:text-surface-200">{p.name}</td>
                    <td><span className={`badge ${p.hits > 0 ? 'badge-hit' : 'badge-no-hit'}`}>{p.hits}</span></td>
                    <td><span className="badge-iso5">{p.iso5}</span></td>
                    <td><span className="badge-iso7">{p.iso7}</span></td>
                    <td>{p.records}</td>
                    <td className="font-mono text-xs">
                      {p.records > 0 ? (p.hits / p.records).toFixed(1) : '0.0'} hits/rec
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DrillDownDrawer data={drawer} onClose={() => setDrawer(null)} />

      <ViableDrawer
        lot={viableLot}
        records={viableAll.filter(r => r.lot_number === viableLot)}
        onClose={() => setViableLot(null)}
      />
    </div>
  );
}
