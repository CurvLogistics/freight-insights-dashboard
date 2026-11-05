import { Card, CardContent } from '@/components/ui/card';
import InfoTip from '@/components/InfoTip';
import type { MetricInfo } from '@/lib/metricInfo';

interface CardProps {
  label: string;
  value: string;
  good?: boolean;
  emphasis?: boolean;
  /** Shows an "i" icon next to the label explaining the metric and its data source. */
  info?: MetricInfo;
  /** Overrides the value color (e.g. on-time thresholds). */
  valueClassName?: string;
}

const valueColor = ({ good, emphasis, valueClassName }: CardProps) =>
  valueClassName ?? `${good === true ? 'text-success' : good === false ? 'text-destructive' : ''} ${emphasis ? 'text-primary' : ''}`;

function Label({ label, info }: Pick<CardProps, 'label' | 'info'>) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {info && <InfoTip text={info.text} source={info.source} />}
    </span>
  );
}

/** Big KPI card used in the scorecard summary bar. */
export function KPICard(props: CardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground"><Label label={props.label} info={props.info} /></div>
        <div className={`text-xl font-bold font-mono mt-1 ${valueColor(props)}`}>{props.value}</div>
      </CardContent>
    </Card>
  );
}

/** Small card used inside a scorecard row's detail panel. */
export function MiniCard(props: CardProps) {
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2">
      <div className="text-[10px] text-muted-foreground"><Label label={props.label} info={props.info} /></div>
      <div className={`text-sm font-bold font-mono ${valueColor(props)}`}>{props.value}</div>
    </div>
  );
}

/** On-time % color: green ≥ 95, yellow ≥ 90, red below. */
export const otpColor = (v: number | null | undefined) =>
  v == null ? '' : v >= 95 ? 'text-green-600' : v >= 90 ? 'text-yellow-600' : 'text-red-600';
