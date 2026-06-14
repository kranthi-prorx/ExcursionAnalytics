import { useState, useEffect, useCallback } from 'react';
import type { KPISummary, TrendData, PersonHits, LocationHits, FilterState, DrillDownData, ExcursionRecord } from '../types';
import { analyticsAPI, recordsAPI, viableAPI } from '../lib/api';
import { queryCache } from '../lib/queryCache';
import type { ViableByLot, ViableRecord } from '../lib/api';
import KPICards from '../components/KPICards';
import FilterBar from '../components/FilterBar';
import DrillDownDrawer from '../components/DrillDownDrawer';
import ViableDrawer from '../components/ViableDrawer';
import {
  TrendsChart, PersonChart, LocationChart, ISOPieChart, HeatmapChart, LotChart, LotTrendsChart,
  ViableCFUChart, ParticleCountChart
} from '../components/Charts';
import { getDefaultFilters } from '../lib/utils';
import { Download, RefreshCw, TrendingUp, Users, MapPin, Shield, Package, Grid } from 'lucide-react';
import { downloadCSV } from '../lib/utils';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toJpeg } from 'html-to-image';
import { useAuth } from '../contexts/AuthContext';

function ChartCard({ title, icon: Icon, children, className, id }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <div id={id} className={`chart-container ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon size={14} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h3 className="chart-title">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-100 dark:bg-surface-700 rounded-xl ${className}`} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canExport = user?.role === 'admin' || user?.role === 'manager';
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters('monthly'));
  const [kpi, setKpi] = useState<KPISummary | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [persons, setPersons] = useState<PersonHits[]>([]);
  const [locations, setLocations] = useState<LocationHits[]>([]);
  const [lots, setLots] = useState<{ lot_number: string; hits: number }[]>([]);
  const [isoData, setIsoData] = useState<{ iso_class: string; hits: number }[]>([]);
  const [lotTrends, setLotTrends] = useState<{ date: string; lot_number: string; hits: number }[]>([]);
  const [viableByLot, setViableByLot] = useState<ViableByLot[]>([]);
  const [viableAll, setViableAll]     = useState<ViableRecord[]>([]);
  const [viableLot, setViableLot]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrillDownData | null>(null);
  const [allRecords, setAllRecords] = useState<ExcursionRecord[]>([]);

  const fetchAll = useCallback(async (force = false) => {
    // Build a stable cache key from the active filters
    const cacheKey = `dashboard:${JSON.stringify(filters)}`;

    // Serve from cache instantly on tab switch (skip loading flash)
    if (!force) {
      const cached = queryCache.get<{
        kpi: KPISummary; trends: TrendData[]; persons: PersonHits[];
        locations: LocationHits[]; lots: { lot_number: string; hits: number }[];
        isoData: { iso_class: string; hits: number }[];
        lotTrends: { date: string; lot_number: string; hits: number }[];
        allRecords: ExcursionRecord[]; viableByLot: any[]; viableAll: any[];
      }>(cacheKey);
      if (cached) {
        setKpi(cached.kpi);
        setTrends(cached.trends);
        setPersons(cached.persons);
        setLocations(cached.locations);
        setLots(cached.lots);
        setIsoData(cached.isoData);
        setLotTrends(cached.lotTrends);
        setAllRecords(cached.allRecords);
        setViableByLot(cached.viableByLot);
        setViableAll(cached.viableAll);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [kpiRes, trendRes, personRes, locRes, lotRes, isoRes, lotTrendRes, recRes, viableRes, viableAllRes] = await Promise.allSettled([
        analyticsAPI.kpi(filters),
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
        kpi:        kpiRes.status        === 'fulfilled' ? kpiRes.value.data                   : kpi,
        trends:     trendRes.status      === 'fulfilled' ? trendRes.value.data                 : trends,
        persons:    personRes.status     === 'fulfilled' ? personRes.value.data                : persons,
        locations:  locRes.status        === 'fulfilled' ? locRes.value.data                   : locations,
        lots:       lotRes.status        === 'fulfilled' ? lotRes.value.data                   : lots,
        isoData:    isoRes.status        === 'fulfilled' ? isoRes.value.data                   : isoData,
        lotTrends:  lotTrendRes.status   === 'fulfilled' ? lotTrendRes.value.data              : lotTrends,
        allRecords: recRes.status        === 'fulfilled' ? recRes.value.data.records           : allRecords,
        viableByLot: viableRes.status    === 'fulfilled' ? viableRes.value.data                : viableByLot,
        viableAll:  viableAllRes.status  === 'fulfilled' ? viableAllRes.value.data             : viableAll,
      };
      if (next.kpi)        setKpi(next.kpi);
      if (next.trends)     setTrends(next.trends);
      if (next.persons)    setPersons(next.persons);
      if (next.locations)  setLocations(next.locations);
      if (next.lots)       setLots(next.lots);
      if (next.isoData)    setIsoData(next.isoData);
      if (next.lotTrends)  setLotTrends(next.lotTrends);
      if (next.allRecords) setAllRecords(next.allRecords);
      if (next.viableByLot) setViableByLot(next.viableByLot);
      if (next.viableAll)  setViableAll(next.viableAll);
      queryCache.set(cacheKey, next);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDrawer = (type: DrillDownData['type'], label: string, records: ExcursionRecord[]) => {
    setDrawer({ type, label, records });
  };

  const handlePersonClick = (d: PersonHits) => {
    const recs = allRecords.filter(r => r.name === d.name);
    openDrawer('person', d.name, recs);
  };

  const handleTrendClick = (d: TrendData) => {
    // Match records whose hit_date matches the clicked date
    const recs = allRecords.filter(r => r.hit_date === d.date);
    openDrawer('record', `📅 ${d.date}  —  ${d.hits} hit${d.hits !== 1 ? 's' : ''}`, recs);
  };

  const handleLocationClick = (d: LocationHits) => {
    const recs = allRecords.filter(r =>
      r.hit_details?.some(h => h.location === d.location && (h.hit_value ?? 0) > 0)
    );
    openDrawer('location', d.location, recs);
  };

  const handleISOClick = (iso: string) => {
    const recs = allRecords.filter(r => r.iso_class === iso);
    openDrawer('iso', iso, recs);
  };

  const handleLotClick = (lot: string) => {
    const recs = allRecords.filter(r => r.lot_number === lot);
    openDrawer('lot', lot, recs);
  };

  const exportCSV = () => {
    if (!allRecords.length) return toast.error('No data to export');
    const flat = allRecords.map(r => ({
      Name: r.name,
      LotNumber: r.lot_number,
      JobFunction: r.job_function,
      PersonnelType: r.personnel_type,
      ISOClass: r.iso_class,
      AlertLevel: r.alert_level,
      ActionLevel: r.action_level,
      Timestamp: r.timestamp,
      TotalHits: r.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0,
      ...Object.fromEntries(
        (r.hit_details ?? []).map(h => [h.location.replace(/\s/g, '_'), h.hit_value])
      ),
    }));
    downloadCSV(flat as any, `excursion-hits-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success('CSV exported!');
  };

  const exportPDF = async () => {
    if (!allRecords.length) return toast.error('No data to export');
    const tid = toast.loading('Generating PDF with charts…');
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 14;
      const usableW = W - M * 2;

      // Header
      doc.setFontSize(16); doc.setTextColor(40, 40, 40);
      doc.text('Excursion Hit Analytics Report', M, 18);
      doc.setFontSize(9); doc.setTextColor(100, 100, 100);

      // KPI boxes
      if (kpi) {
        const kpiItems = [
          ['Total Hits', String(kpi.total_hits)], ['ISO 5', String(kpi.iso5_hits)],
          ['ISO 7', String(kpi.iso7_hits)],       ['Records', String(kpi.total_records)],
          ['Personnel', String(kpi.unique_persons)], ['Lots', String(kpi.unique_lots)],
          ['Alerts', String(kpi.alert_count)],    ['Actions', String(kpi.action_count)],
        ];
        const boxW = usableW / kpiItems.length;
        kpiItems.forEach(([label, value], idx) => {
          const x = M + idx * boxW;
          doc.setFillColor(245, 245, 250);
          doc.roundedRect(x, 30, boxW - 2, 14, 1, 1, 'F');
          doc.setFontSize(13); doc.setTextColor(40, 40, 40);
          doc.text(value, x + boxW / 2 - 1, 39, { align: 'center' });
          doc.setFontSize(6.5); doc.setTextColor(120, 120, 120);
          doc.text(label, x + boxW / 2 - 1, 43, { align: 'center' });
        });
      }

      // Capture + embed charts
      const chartDefs = [
        { id: 'chart-trends',     wide: true  },
        { id: 'chart-person',     wide: false },
        { id: 'chart-iso',        wide: false },
        { id: 'chart-location',   wide: false },
        { id: 'chart-lot',        wide: false },
        { id: 'chart-heatmap',    wide: true  },
        { id: 'chart-viable-cfu', wide: false },
        { id: 'chart-particle',   wide: false },
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


      let y = 51;
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

      // Records table
      doc.addPage();
      doc.setFontSize(12); doc.setTextColor(40, 40, 40);
      doc.text('Records Detail', M, M + 8);
      autoTable(doc, {
        startY: M + 13,
        head: [['Name', 'Lot #', 'Type', 'ISO', 'Hits', 'Date']],
        body: allRecords.map(r => [
          r.name, r.lot_number, r.personnel_type, r.iso_class,
          r.hit_details?.reduce((s, h) => s + (h.hit_value ?? 0), 0) ?? 0,
          r.hit_date,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] },
      });

      doc.save(`excursion-hits-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.dismiss(tid);
      toast.success('PDF with charts saved!');
    } catch (err) {
      console.error('PDF error:', err);
      toast.dismiss(tid);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Excursion hit analytics & trend monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAll(true)} className="btn-secondary btn-sm" disabled={loading} title="Refresh data">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canExport && (
            <>
              <button onClick={exportCSV}  className="btn-secondary btn-sm"><Download size={14} />CSV</button>
              <button onClick={exportPDF}  className="btn-secondary btn-sm"><Download size={14} />PDF</button>
            </>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* KPIs */}
      <KPICards data={kpi} loading={loading} />

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard id="chart-trends" title="Hits Over Time" icon={TrendingUp} className="col-span-1 lg:col-span-2">
          {loading ? <Skeleton className="h-60" /> : <TrendsChart data={trends} onBarClick={handleTrendClick} />}
        </ChartCard>

        {/* By Person */}
        <ChartCard id="chart-person" title="Hits per Person" icon={Users}>
          {loading ? <Skeleton className="h-60" /> : <PersonChart data={persons} onBarClick={handlePersonClick} />}
        </ChartCard>

        {/* ISO Pie */}
        <ChartCard id="chart-iso" title="ISO Class Distribution" icon={Shield}>
          {loading ? <Skeleton className="h-60" /> : <ISOPieChart data={isoData} onSliceClick={handleISOClick} />}
        </ChartCard>

        {/* By Location */}
        <ChartCard id="chart-location" title="Hits per Location" icon={MapPin}>
          {loading ? <Skeleton className="h-60" /> : <LocationChart data={locations} onBarClick={handleLocationClick} />}
        </ChartCard>

        {/* By Lot */}
        <ChartCard id="chart-lot" title="Hits per Lot Number" icon={Package}>
          {loading ? <Skeleton className="h-60" /> : <LotChart data={lots} onBarClick={handleLotClick} />}
        </ChartCard>

        {/* Heatmap */}
        <ChartCard id="chart-heatmap" title="Location Hit Heatmap" icon={Grid} className="col-span-1 lg:col-span-2">
          {loading ? <Skeleton className="h-28" /> : <HeatmapChart data={locations} />}
        </ChartCard>

        {/* Viable CFU by Lot */}
        <ChartCard id="chart-viable-cfu" title="Viable CFU by Lot" icon={Shield}>
          {loading ? <Skeleton className="h-60" /> : <ViableCFUChart data={viableByLot} onBarClick={setViableLot} />}
        </ChartCard>

        {/* Particle Count by Lot */}
        <ChartCard id="chart-particle" title="Particle Count by Lot" icon={Package}>
          {loading ? <Skeleton className="h-60" /> : <ParticleCountChart data={viableByLot} onBarClick={setViableLot} />}
        </ChartCard>
      </div>

      {/* Drill-down drawer */}
      <DrillDownDrawer data={drawer} onClose={() => setDrawer(null)} />

      {/* Viable lot detail drawer */}
      <ViableDrawer
        lot={viableLot}
        records={viableAll.filter(r => r.lot_number === viableLot)}
        onClose={() => setViableLot(null)}
      />
    </div>
  );
}
