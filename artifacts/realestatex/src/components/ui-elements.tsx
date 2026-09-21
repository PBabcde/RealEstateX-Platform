import { AlertCircle, ArrowDownRight, ArrowUpRight, Check, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mono mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#c17b21]">{eyebrow}</p><h2 className="display text-2xl font-bold tracking-[-0.05em] text-foreground sm:text-3xl">{title}</h2>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>;
}

export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-3 rounded-2xl border border-border bg-card p-6" aria-label="Laden" data-testid="status-loading">{Array.from({ length: lines }).map((_, i) => <div key={i} className={`skeleton h-4 rounded-md ${i === 0 ? 'w-1/3' : i === lines - 1 ? 'w-2/3' : 'w-full'}`} />)}</div>;
}

export function ErrorBlock({ message = 'De data kon niet worden geladen.', onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e8b4af] bg-[#fff5f3] p-5 text-[#8d3932]" role="alert" data-testid="status-error"><div className="flex items-start gap-3"><AlertCircle size={19} className="mt-0.5 shrink-0" /><div><p className="text-sm font-bold">Even geen verbinding</p><p className="mt-1 text-xs leading-5 opacity-80">{message}</p></div></div>{onRetry && <button onClick={onRetry} className="flex shrink-0 items-center gap-2 rounded-lg border border-[#e8b4af] px-3 py-2 text-xs font-bold hover:bg-[#fbe9e5]" data-testid="button-retry"><RefreshCw size={14} /> Opnieuw</button>}</div>;
}

export function EmptyBlock({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-[270px] place-items-center rounded-2xl border border-dashed border-border bg-card p-8 text-center" data-testid="status-empty"><div><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#f7eddd] text-[#c17b21]"><span className="display text-xl font-bold">—</span></div><h3 className="display text-lg font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}

export function StatusPill({ status, positive = true }: { status: string; positive?: boolean }) {
  const isGood = positive && !['error', 'failed', 'mislukt'].includes(status.toLowerCase());
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${isGood ? 'bg-[#e3f3ee] text-[#207464]' : 'bg-[#fae7e3] text-[#a4443b]'}`} data-testid={`status-pill-${status}`}><span className={`h-1.5 w-1.5 rounded-full ${isGood ? 'bg-[#3eaf94]' : 'bg-[#c15c52]'}`} />{status || 'bekend'}</span>;
}

export function TrendValue({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-1 font-bold ${positive ? 'text-[#26836f]' : 'text-[#b34d43]'}`}>{positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Math.abs(value).toFixed(1)}{suffix}</span>;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-form">{pending && <Loader2 size={16} className="animate-spin" />}{children}</button>;
}

export function CheckRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="mono text-xs font-medium text-foreground">{value}</span></div>;
}

export const formatEuro = (value?: number) => typeof value === 'number' ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value) : '—';
export const formatNumber = (value?: number) => typeof value === 'number' ? new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(value) : '—';
export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';