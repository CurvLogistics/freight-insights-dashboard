import { useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { finRev, finCost } from '@/lib/computeLoads';
import { formatUSDate } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Target, Eye, Info, CircleAlert } from 'lucide-react';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';

const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toLocaleString('en-US')}`;
const signed = (n: number) => n >= 0 ? `+${n.toLocaleString('en-US')}` : n.toLocaleString('en-US');
const signedFmt = (n: number) => n >= 0 ? `+${fmt(Math.abs(n))}` : `-${fmt(Math.abs(n))}`;


/** Title-case a lane, strip state codes: "SANTA MARIA, CA → CHICAGO, IL" → "Santa Maria → Chicago" */
function cleanLane(lane: string) {
  return lane
    .replace(/,\s*[A-Z]{2}/g, '')
    .split(' → ')
    .map(part => part.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' → ');
}

/** Clean customer name: title-case, drop suffixes like INC., LLC */
function cleanCustomer(raw: string) {
  return raw
    .replace(/\b(INC\.?|LLC\.?|CORP\.?|CO\.?|LTD\.?)\s*$/i, '')
    .trim()
    .replace(/\w\S*/g, w => {
      const lower = w.toLowerCase();
      if (['of', 'the', 'and', 'for'].includes(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export default function InsightsView() {
  const { loads, prevLoads: prevPeriodLoads, compWindow: comp, filters, comparisonMode, timeframePreset } = useData();

  const insights = useMemo(() => {
    const curLoads = loads;

    const hasComp = comp.covered && !!comp.range;
    const vsLabel = comparisonMode === 'yoy' ? 'vs last year' : 'vs prior period';
    const prevLoads = prevPeriodLoads;

    const curCount = curLoads.length;
    const curRev = curLoads.reduce((s, l) => s + (l.revenue || 0), 0);
    const curFinRev = curLoads.reduce((s, l) => s + finRev(l), 0);
    const curCost = curLoads.reduce((s, l) => s + finCost(l), 0);
    const curProfit = curFinRev - curCost;
    const curMargin = curFinRev > 0 ? (curProfit / curFinRev) * 100 : 0;

    const prevCount = prevLoads.length;
    const prevRev = prevLoads.reduce((s, l) => s + (l.revenue || 0), 0);
    const prevFinRev = prevLoads.reduce((s, l) => s + finRev(l), 0);
    const prevCost = prevLoads.reduce((s, l) => s + finCost(l), 0);
    const prevProfit = prevFinRev - prevCost;
    const prevMargin = prevFinRev > 0 ? (prevProfit / prevFinRev) * 100 : 0;

    const dLoads = curCount - prevCount;
    const dRev = curRev - prevRev;
    const dProfit = curProfit - prevProfit;
    const dMargin = curMargin - prevMargin;

    // Top customers by profit
    const custMap = new Map<string, { rev: number; cost: number; loads: number }>();
    curLoads.forEach(l => {
      const name = l.customerName || 'Unknown';
      const e = custMap.get(name) || { rev: 0, cost: 0, loads: 0 };
      e.rev += finRev(l); e.cost += finCost(l); e.loads++;
      custMap.set(name, e);
    });
    const topCusts = [...custMap.entries()]
      .map(([name, d]) => ({ name: cleanCustomer(name), profit: d.rev - d.cost, margin: d.rev > 0 ? ((d.rev - d.cost) / d.rev) * 100 : 0, loads: d.loads }))
      .sort((a, b) => b.profit - a.profit);

    // Lane analysis
    const laneMap = new Map<string, { curRev: number; curCost: number; curLoads: number; prevRev: number; prevCost: number; prevLoads: number }>();
    curLoads.forEach(l => {
      const key = l.lane || 'Unknown';
      const e = laneMap.get(key) || { curRev: 0, curCost: 0, curLoads: 0, prevRev: 0, prevCost: 0, prevLoads: 0 };
      e.curRev += finRev(l); e.curCost += finCost(l); e.curLoads++;
      laneMap.set(key, e);
    });
    prevLoads.forEach(l => {
      const key = l.lane || 'Unknown';
      const e = laneMap.get(key) || { curRev: 0, curCost: 0, curLoads: 0, prevRev: 0, prevCost: 0, prevLoads: 0 };
      e.prevRev += finRev(l); e.prevCost += finCost(l); e.prevLoads++;
      laneMap.set(key, e);
    });
    const lanes = [...laneMap.entries()].map(([lane, d]) => {
      const curM = d.curRev > 0 ? ((d.curRev - d.curCost) / d.curRev) * 100 : 0;
      const prevM = d.prevRev > 0 ? ((d.prevRev - d.prevCost) / d.prevRev) * 100 : 0;
      const avgCurCost = d.curLoads > 0 ? d.curCost / d.curLoads : 0;
      const avgPrevCost = d.prevLoads > 0 ? d.prevCost / d.prevLoads : 0;
      return { lane: cleanLane(lane), curMargin: curM, prevMargin: prevM, marginDelta: curM - prevM, curLoads: d.curLoads, costDelta: avgCurCost - avgPrevCost, hasPrev: d.prevLoads > 0 };
    });
        const compressed = lanes.filter(l => l.hasPrev && l.marginDelta < -2 && l.curLoads > 0)
.sort((a, b) => a.marginDelta - b.marginDelta).slice(0, 2);
    const costRisers = lanes.filter(l => l.curLoads > 0 && l.hasPrev && l.costDelta > 0).sort((a, b) => b.costDelta - a.costDelta).slice(0, 2);

    // Biggest Issue — single sentence, max 12 words
    let biggestIssue = '';
    if (!hasComp) {
      biggestIssue = topCusts.length > 0
        ? `No ${comparisonMode === 'yoy' ? 'last-year' : 'prior-period'} data to compare — showing current period only`
        : 'No loads in the selected period';
    } else if (dMargin < -1 && compressed.length > 0) {
      biggestIssue = `Margin down ${Math.abs(dMargin).toFixed(1)}pp driven by ${compressed[0].lane}`;
    } else if (dProfit < 0 && dLoads > 0) {
      biggestIssue = 'More loads but less profit — pricing or cost issue';
    } else if (dProfit < 0) {
      biggestIssue = `Profit down ${fmt(Math.abs(dProfit))} ${vsLabel}`;
    } else if (dLoads < 0) {
      biggestIssue = `Volume down ${Math.abs(dLoads)} loads ${vsLabel}`;

    } else if (costRisers.length > 0) {
      biggestIssue = `Carrier costs rising on ${costRisers[0].lane}`;
    } else {
      biggestIssue = 'No major issues — performance stable';
    }

    // What Changed — short, signal-focused
    const highlights: string[] = [];
    if (!hasComp) { /* no comparative highlights without comparison data */ }
    else {
      // Describe volume and revenue separately, using the actual direction of each.
      // "Flat" only when revenue moved less than 2% vs the comparison period.
      const revPct = prevRev > 0 ? (dRev / prevRev) * 100 : 0;
      const volPart = dLoads > 0 ? `Volume up ${dLoads} loads` : dLoads < 0 ? `Volume down ${Math.abs(dLoads)} loads` : 'Volume flat';
      const revPart = Math.abs(revPct) < 2 ? 'revenue flat'
        : `revenue ${dRev > 0 ? 'up' : 'down'} ${fmt(Math.abs(dRev))} (${revPct > 0 ? '+' : ''}${revPct.toFixed(0)}%)`;
      highlights.push(`${volPart}, ${revPart}`);
      if (dLoads > 0 && dProfit < 0) highlights.push(`More loads but profit down ${fmt(Math.abs(dProfit))}`);
    }

    if (hasComp && Math.abs(dMargin) >= 1) highlights.push(`Margin ${dMargin > 0 ? 'up' : 'down'} ${Math.abs(dMargin).toFixed(1)}pp ${vsLabel}`);
    if (compressed.length > 0) highlights.push(`Compression on ${compressed.map(c => c.lane).join(', ')}`);
    if (costRisers.length > 0) highlights.push(`Cost pressure on ${costRisers.map(c => c.lane).join(', ')}`);
    if (topCusts.length >= 2) {
      highlights.push(`Top profit: ${topCusts.slice(0, 2).map(c => c.name).join(', ')}`);
    }
    if (highlights.length === 0) highlights.push('No significant changes');

    // Actions — natural, operator-driven
    const actions: string[] = [];
    if (compressed.length > 0) actions.push(`Review pricing on ${compressed[0].lane} (margin compression)`);
    if (costRisers.length > 0) actions.push(`Re-engage carriers on ${costRisers[0].lane} (cost increase)`);
    const lowMarginCusts = topCusts.filter(c => c.loads >= 2 && c.margin < 8).slice(0, 1);
    if (lowMarginCusts.length > 0) actions.push(`Review ${lowMarginCusts[0].name} pricing (margin <8%)`);
    if (actions.length === 0) actions.push('No urgent actions identified');

    // Warnings
    const warnings: string[] = [];
    const missingCount = curLoads.filter(l => !l.revenue || !l.carrierCost).length;
    if (missingCount > 0) warnings.push(`${missingCount} loads missing revenue or cost`);
        if (!hasComp && comp.reason) warnings.push(comp.reason);
    else if (prevCount === 0) warnings.push(`No loads in the comparison period (${formatUSDate(comp.range?.start)}–${formatUSDate(comp.range?.end)})`);
    warnings.push('Service metrics limited — missing appointment data');

    return { curCount, curRev, curProfit, curMargin, dLoads, dRev, dProfit, dMargin, biggestIssue, highlights, actions, warnings, hasComp };
  }, [loads, prevPeriodLoads, comp, comparisonMode]);

  const presetLabels: Record<string, string> = { rolling7: 'Rolling 7', rolling30: 'Rolling 30', mtd: 'MTD', qtd: 'QTD', ytd: 'YTD', custom: 'Custom' };
  const compLabels: Record<string, string> = { prior: 'vs Prior', yoy: 'vs YoY' };
  const ctx = [presetLabels[timeframePreset] || 'Custom', compLabels[comparisonMode] || 'vs Prior'];
  if (filters.owner !== 'all') ctx.push(filters.owner);
  if (filters.excludedTeams.length > 0) ctx.push(`Excl. ${filters.excludedTeams.join(', ')}`);
  if (filters.equipmentType !== 'all') ctx.push(filters.equipmentType);

    const Delta = ({ val, display }: { val: number; display: string }) => !insights.hasComp ? null : (
    <span className={val < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}>({display})</span>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header + Biggest Issue */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">Insights</h1>
          <DataTrustBadge
            level={insights.warnings.length <= 1 ? 'partial' : 'incomplete'}
            tooltip="Insights are derived from available data. Check warnings below for gaps."
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{ctx.join(' · ')}</p>
        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
          <CircleAlert className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm font-medium text-foreground">{insights.biggestIssue}</p>
        </div>
      </div>

      {/* Financial Snapshot */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Financial Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Loads</span>
            <span>{insights.curCount.toLocaleString('en-US')} <Delta val={insights.dLoads} display={signed(insights.dLoads)} /></span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Revenue</span>
            <span>{fmt(insights.curRev)} <Delta val={insights.dRev} display={signedFmt(insights.dRev)} /></span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">Gross Profit <InfoTip text="Revenue minus carrier cost" /></span>
            <span>{fmt(insights.curProfit)} <Delta val={insights.dProfit} display={signedFmt(insights.dProfit)} /></span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">Margin <InfoTip text="Gross profit as a percentage of revenue. Change shown in percentage points (pp)." /></span>
            <span>{insights.curMargin.toFixed(1)}% <Delta val={insights.dMargin} display={`${insights.dMargin >= 0 ? '+' : ''}${insights.dMargin.toFixed(1)}pp`} /></span>
          </div>
        </CardContent>
      </Card>

      {/* What Changed */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-primary" />
            What Changed
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1 text-sm">
            {insights.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-foreground">{h}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1.5 text-sm">
            {insights.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5 font-semibold">{i + 1}</Badge>
                <span className="text-foreground">{a}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Data Warnings */}
      {insights.warnings.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              Data Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {insights.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
