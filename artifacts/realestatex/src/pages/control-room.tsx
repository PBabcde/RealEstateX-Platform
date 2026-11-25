import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  Layers3,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  getGetControlRoomQueryKey,
  useGetControlRoom,
  type ControlRoomSnapshot,
} from '@workspace/api-client-react';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

type StatusValue = string | null | undefined;

const statusCopy: Record<string, string> = {
  active: 'Actief',
  available: 'Beschikbaar',
  unavailable: 'Niet beschikbaar',
  development: 'In ontwikkeling',
  unknown: 'Onbekend',
  error: 'Fout',
  warning: 'Waarschuwing',
  info: 'Info',
};

function statusStyle(status: StatusValue) {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'available':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'unavailable':
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'development':
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function StatusPill({ status, testId }: { status: StatusValue; testId?: string }) {
  const label = status ? statusCopy[status.toLowerCase()] ?? status : 'Niet beschikbaar';
  const Icon = status === 'active' || status === 'available' ? Check : status === 'unavailable' ? AlertTriangle : CircleHelp;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${statusStyle(status)}`}
      data-testid={testId}
      aria-label={`Status: ${label}`}
    >
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </span>
  );
}

function displayCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Niet gemeten';
  return new Intl.NumberFormat('nl-NL').format(value);
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Niet beschikbaar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Niet beschikbaar';
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function displayDuration(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return 'Niet beschikbaar';
  const seconds = Math.floor(value);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days} d ${hours} u` : hours > 0 ? `${hours} u ${minutes} min` : `${minutes} min`;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function isUnknown(status: StatusValue) {
  return !status || status.toLowerCase() === 'unknown';
}

function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Activity;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#dbe3e9] bg-[#f4f7f8] text-[#3d5b70]">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <p className="mono text-[9px] uppercase tracking-[0.16em] text-[#758797]">{eyebrow}</p>
        <h2 className="text-[15px] font-bold tracking-[-0.02em] text-[#203648]">{title}</h2>
      </div>
    </div>
  );
}

function Value({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-4 text-[#718292]">{label}</dt>
      <dd className="mt-1 break-words text-[13px] font-semibold leading-5 text-[#233b4e]" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8ec] bg-[#fafcfc] px-3.5 py-3">
      <p className="text-[11px] text-[#718292]">{label}</p>
      <p className="mt-1.5 text-xl font-bold tracking-[-0.04em] text-[#203648]" data-testid={testId}>{value}</p>
    </div>
  );
}

function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-2xl border border-[#dfe6e9] bg-white p-5 shadow-[0_2px_10px_rgba(33,55,71,0.035)] sm:p-6 ${className}`}>{children}</section>;
}

function LoadingState() {
  return (
    <AppShell>
      <div className="space-y-6" aria-label="Control Room wordt geladen" data-testid="control-room-loading">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
        <div className="skeleton h-56 rounded-2xl" />
      </div>
    </AppShell>
  );
}

function AccessError({ onRetry }: { onRetry: () => void }) {
  return (
    <AppShell>
      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-amber-200 bg-[#fffaf0] p-7 sm:p-9" data-testid="control-room-no-access">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
          <ShieldCheck size={21} aria-hidden="true" />
        </div>
        <p className="mono mt-5 text-[10px] uppercase tracking-[0.17em] text-amber-800">Beheerdersomgeving</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#263c4c]">Geen toegang tot de Control Room</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-[#647586]">
          Deze operationele omgeving is alleen beschikbaar voor beheerders. Neem contact op met een beheerder als je denkt dat dit niet klopt.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#c8d3d9] bg-white px-4 text-sm font-semibold text-[#29475b] transition-colors hover:bg-[#f4f7f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52778d]"
          data-testid="button-retry-control-room"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Opnieuw controleren
        </button>
      </div>
    </AppShell>
  );
}

function GenericError({ onRetry }: { onRetry: () => void }) {
  return (
    <AppShell>
      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50/70 p-7 sm:p-9" role="alert" data-testid="control-room-error">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-100 text-rose-800">
          <AlertTriangle size={20} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.04em] text-[#263c4c]">Statusoverzicht niet beschikbaar</h1>
        <p className="mt-3 text-sm leading-6 text-[#647586]">
          De Control Room kon de actuele platformstatus niet ophalen. Probeer het opnieuw.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#29475b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#203a4b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52778d]"
          data-testid="button-retry-control-room"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Opnieuw proberen
        </button>
      </div>
    </AppShell>
  );
}

export function ControlRoom() {
  const query = useGetControlRoom({
    query: {
      queryKey: getGetControlRoomQueryKey(),
      refetchInterval: 60000,
    },
  });

  if (query.isPending) return <LoadingState />;
  const httpStatus = getErrorStatus(query.error);
  if (query.isError && httpStatus === 403) return <AccessError onRetry={() => query.refetch()} />;
  if (query.isError && !query.data) return <GenericError onRetry={() => query.refetch()} />;

  const data = query.data as ControlRoomSnapshot | undefined;
  if (!data) return <GenericError onRetry={() => query.refetch()} />;

  const platform = data.platform;
  const api = data.api;
  const database = data.database;
  const authentication = data.authentication;
  const ai = data.ai;
  const sales = data.salesCrm;
  const energy = data.energyx;
  const realEstate = data.realEstateX;
  const hasPartialData = [
    platform?.status,
    platform?.build,
    platform?.tests,
    platform?.deployment,
    api?.status,
    api?.health,
    database?.status,
    authentication?.status,
    ai?.status,
    sales?.status,
    energy?.status,
    realEstate?.status,
  ].some(isUnknown) || [
    database?.accountCount,
    database?.propertyCount,
    authentication?.activeSessions,
    data.accounts?.total,
    data.accounts?.activeUsers,
    sales?.leads,
    sales?.deals,
    sales?.contacts,
    sales?.pageViews24h,
    sales?.sessions24h,
    energy?.syncedProperties,
    realEstate?.properties,
  ].some((value) => value === null || value === undefined);

  return (
    <AppShell>
      <div className="space-y-6 pb-8">
        <header className="overflow-hidden rounded-2xl border border-[#cfdae0] bg-[#f8faf9]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#708493]">RealEstateX / beheer</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.055em] text-[#203648] sm:text-[36px]">Control Room</h1>
              <p className="mt-2 text-sm leading-6 text-[#667b8a]">
                Operationeel overzicht van platform, gegevens en aangesloten diensten.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-[#dce4e7] bg-white px-3.5 py-2.5">
                <p className="mono text-[9px] uppercase tracking-[0.12em] text-[#81909b]">Laatste momentopname</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#334f61]" data-testid="text-generated-at">
                  <Clock3 size={13} aria-hidden="true" />
                  {displayDate(data.generatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                aria-label={query.isFetching ? 'Status wordt vernieuwd' : 'Status nu vernieuwen'}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#29475b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#203a4b] disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52778d]"
                data-testid="button-refresh-control-room"
              >
                <RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                <span>{query.isFetching ? 'Vernieuwen…' : 'Ververs status'}</span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e1e8ea] bg-white/70 px-5 py-3 text-[11px] text-[#718292] sm:px-7">
            <span data-testid="text-refresh-cadence">Automatische vernieuwing elke 60 seconden</span>
            {hasPartialData ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800" role="status" data-testid="status-partial-data">
                <AlertTriangle size={13} aria-hidden="true" />
                Gedeeltelijke gegevens — onbekende waarden blijven onbekend
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5" role="status" data-testid="status-data-ready">
                <span className="h-1.5 w-1.5 rounded-full bg-[#568477]" aria-hidden="true" />
                Momentopname geladen
              </span>
            )}
          </div>
        </header>

        <Panel>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
              <AlertTriangle size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-[#30495b]">Systeemmeldingen</h2>
              {platform?.alerts?.length ? (
                <ul className="mt-3 space-y-2" data-testid="list-system-alerts">
                  {platform.alerts.map((alert, index) => (
                    <li key={`${index}-${alert}`} className="rounded-lg bg-amber-50/70 px-3.5 py-2.5 text-xs leading-5 text-amber-950" data-testid={`text-system-alert-${index}`}>
                      {alert}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[#718292]" data-testid="empty-system-alerts">Geen systeemmeldingen in deze momentopname.</p>
              )}
            </div>
          </div>
        </Panel>

        {query.isError && query.data && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert" data-testid="status-refresh-error">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Vernieuwen is niet gelukt. Hieronder staat de laatst ontvangen momentopname.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kernstatus">
          <article className="rounded-2xl border border-[#dfe6e9] bg-white p-4 shadow-[0_2px_10px_rgba(33,55,71,0.035)]">
            <div className="flex items-start justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff4f5] text-[#45697a]"><Server size={17} aria-hidden="true" /></span>
              <StatusPill status={platform?.status} testId="status-platform" />
            </div>
            <p className="mt-4 text-[11px] text-[#718292]">Platform</p>
            <p className="mt-1 text-[15px] font-bold text-[#233b4e]" data-testid="text-platform-runtime">{platform?.runtime || 'Niet beschikbaar'}</p>
            <p className="mt-1 text-xs text-[#7b8b97]" data-testid="text-platform-uptime">Actief sinds {displayDuration(platform?.uptimeSeconds)}</p>
          </article>
          <article className="rounded-2xl border border-[#dfe6e9] bg-white p-4 shadow-[0_2px_10px_rgba(33,55,71,0.035)]">
            <div className="flex items-start justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff4f5] text-[#45697a]"><Activity size={17} aria-hidden="true" /></span>
              <StatusPill status={api?.status} testId="status-api" />
            </div>
            <p className="mt-4 text-[11px] text-[#718292]">API &amp; gezondheid</p>
            <p className="mt-1 text-[15px] font-bold text-[#233b4e]" data-testid="text-api-health">{api?.health ? statusCopy[api.health] ?? api.health : 'Niet beschikbaar'}</p>
            <p className="mt-1 text-xs text-[#7b8b97]">{displayCount(api?.services?.length)} diensten geregistreerd</p>
          </article>
          <article className="rounded-2xl border border-[#dfe6e9] bg-white p-4 shadow-[0_2px_10px_rgba(33,55,71,0.035)]">
            <div className="flex items-start justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff4f5] text-[#45697a]"><Database size={17} aria-hidden="true" /></span>
              <StatusPill status={database?.status} testId="status-database" />
            </div>
            <p className="mt-4 text-[11px] text-[#718292]">Database</p>
            <p className="mt-1 text-[15px] font-bold text-[#233b4e]" data-testid="text-database-connection">{database?.connection || 'Niet beschikbaar'}</p>
            <p className="mt-1 text-xs text-[#7b8b97]">Verbinding en aantallen</p>
          </article>
          <article className="rounded-2xl border border-[#dfe6e9] bg-white p-4 shadow-[0_2px_10px_rgba(33,55,71,0.035)]">
            <div className="flex items-start justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff4f5] text-[#45697a]"><ShieldCheck size={17} aria-hidden="true" /></span>
              <StatusPill status={authentication?.status} testId="status-authentication" />
            </div>
            <p className="mt-4 text-[11px] text-[#718292]">Authenticatie</p>
            <p className="mt-1 text-[15px] font-bold text-[#233b4e]" data-testid="text-auth-provider">{authentication?.provider || 'Niet beschikbaar'}</p>
            <p className="mt-1 text-xs text-[#7b8b97]">Inloggen: {authentication?.login ? statusCopy[authentication.login] ?? authentication.login : 'Niet beschikbaar'}</p>
          </article>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <SectionHeading eyebrow="Runtime & verbindingen" title="Platformstatus" icon={Server} />
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Value label="Omgeving" value={platform?.environment || 'Niet beschikbaar'} testId="text-platform-environment" />
              <Value label="Runtime" value={platform?.runtime || 'Niet beschikbaar'} testId="text-platform-runtime-detail" />
              <Value label="Uptime" value={displayDuration(platform?.uptimeSeconds)} testId="text-platform-uptime-detail" />
              <Value label="Databaseverbinding" value={database?.connection || 'Niet beschikbaar'} testId="text-database-connection-detail" />
            </div>
            <div className="my-5 border-t border-[#e8edef]" />
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#637989]">Leveringscontroles</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Build', platform?.build],
                ['Tests', platform?.tests],
                ['Deployment', platform?.deployment],
              ].map(([label, status]) => (
                <div key={label as string} className="flex items-center justify-between gap-2 rounded-xl bg-[#f7f9f9] px-3.5 py-3">
                  <span className="text-xs font-medium text-[#536b7a]">{label}</span>
                  <StatusPill status={status as string} testId={`status-platform-${String(label).toLowerCase()}`} />
                </div>
              ))}
            </div>
            <div className="my-5 border-t border-[#e8edef]" />
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#637989]">API-diensten</h3>
            {api?.services?.length ? (
              <div className="divide-y divide-[#edf0f1]">
                {api.services.map((service) => (
                  <div key={service.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0" data-testid={`row-api-service-${service.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#30495b]">{service.name}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#7b8b97]">{service.detail || 'Geen aanvullende details'}</p>
                    </div>
                    <StatusPill status={service.status} testId={`status-api-service-${service.id}`} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#f7f9f9] px-4 py-3 text-xs text-[#748592]" data-testid="empty-api-services">Geen API-diensten beschikbaar in deze momentopname.</p>
            )}
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Diensten & afhankelijkheden" title="Toegang en intelligentie" icon={Cpu} />
            <div className="space-y-4">
              <div className="rounded-xl border border-[#e6ebed] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#30495b]">Authenticatie</h3>
                  <StatusPill status={authentication?.status} testId="status-authentication-detail" />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <Value label="Provider" value={authentication?.provider || 'Niet beschikbaar'} testId="text-auth-provider-detail" />
                  <Value label="Inloggen" value={authentication?.login ? statusCopy[authentication.login] ?? authentication.login : 'Niet beschikbaar'} testId="text-auth-login" />
                  <Value label="Actieve sessies" value={displayCount(authentication?.activeSessions)} testId="text-active-sessions" />
                  <Value label="Detail" value={authentication?.detail || 'Niet beschikbaar'} testId="text-auth-detail" />
                </dl>
              </div>
              <div className="rounded-xl border border-[#e6ebed] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#30495b]">AI &amp; zoekfuncties</h3>
                  <StatusPill status={ai?.status} testId="status-ai" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f9f9] px-3 py-2.5 text-xs text-[#607584]"><span>Assistent</span><StatusPill status={ai?.assistant} testId="status-ai-assistant" /></div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f9f9] px-3 py-2.5 text-xs text-[#607584]"><span>RAG</span><StatusPill status={ai?.rag} testId="status-ai-rag" /></div>
                  <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg bg-[#f7f9f9] px-3 py-2.5 text-xs text-[#607584]"><span>Externe provider</span><StatusPill status={ai?.externalProvider} testId="status-ai-external-provider" /></div>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#7b8b97]" data-testid="text-ai-detail">{ai?.detail || 'Niet beschikbaar'}</p>
              </div>
            </div>
          </Panel>
        </div>

        <Panel>
          <SectionHeading eyebrow="Domeinstatus" title="Vastgoed, energie en CRM" icon={Building2} />
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-[#e6ebed] p-4" data-testid="card-realestatex-status">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#30495b]">RealEstateX</p>
                  <p className="mt-1 text-xs text-[#7b8b97]">Vastgoedbeheer &amp; rekentools</p>
                </div>
                <StatusPill status={realEstate?.status} testId="status-realestatex" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="Objecten" value={displayCount(realEstate?.properties)} testId="metric-realestatex-properties" />
                <div className="rounded-xl border border-[#e2e8ec] bg-[#fafcfc] px-3.5 py-3">
                  <p className="text-[11px] text-[#718292]">Rapportages</p>
                  <div className="mt-2"><StatusPill status={realEstate?.reports} testId="status-realestatex-reports" /></div>
                </div>
                <div className="rounded-xl border border-[#e2e8ec] bg-[#fafcfc] px-3.5 py-3">
                  <p className="text-[11px] text-[#718292]">Rekentools</p>
                  <div className="mt-2"><StatusPill status={realEstate?.calculators} testId="status-realestatex-calculators" /></div>
                </div>
                <div className="rounded-xl border border-[#e2e8ec] bg-[#fafcfc] px-3.5 py-3">
                  <p className="text-[11px] text-[#718292]">Transformaties</p>
                  <div className="mt-2"><StatusPill status={realEstate?.transformations} testId="status-realestatex-transformations" /></div>
                </div>
              </div>
            </article>
            <article className="rounded-xl border border-[#e6ebed] p-4" data-testid="card-energyx-status">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#30495b]">EnergyX</p>
                  <p className="mt-1 text-xs text-[#7b8b97]">Energiegegevens &amp; synchronisatie</p>
                </div>
                <StatusPill status={energy?.status} testId="status-energyx" />
              </div>
              <div className="mt-4">
                <Metric label="Gesynchroniseerde objecten" value={displayCount(energy?.syncedProperties)} testId="metric-energyx-synced-properties" />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#7b8b97]" data-testid="text-energyx-detail">{energy?.detail || 'Niet beschikbaar'}</p>
            </article>
            <article className="rounded-xl border border-[#e6ebed] p-4" data-testid="card-sales-crm-status">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#30495b]">Sales &amp; CRM</p>
                  <p className="mt-1 text-xs text-[#7b8b97]">Relaties, deals en bezoek</p>
                </div>
                <StatusPill status={sales?.status} testId="status-sales-crm" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="Leads" value={displayCount(sales?.leads)} testId="metric-sales-leads" />
                <Metric label="Deals" value={displayCount(sales?.deals)} testId="metric-sales-deals" />
                <Metric label="Contacten" value={displayCount(sales?.contacts)} testId="metric-sales-contacts" />
                <Metric label="Paginaweergaven · 24 uur" value={displayCount(sales?.pageViews24h)} testId="metric-sales-pageviews-24h" />
                <div className="col-span-2">
                  <Metric label="Sessies · 24 uur" value={displayCount(sales?.sessions24h)} testId="metric-sales-sessions-24h" />
                </div>
              </div>
            </article>
          </div>
        </Panel>

        <div className="grid items-start gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Panel>
            <SectionHeading eyebrow="Databereik" title="Accounts & opslag" icon={Users} />
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Accounts" value={displayCount(data.accounts?.total)} testId="metric-accounts-total" />
              <Metric label="Actieve gebruikers" value={displayCount(data.accounts?.activeUsers)} testId="metric-accounts-active-users" />
              <Metric label="Accounts in database" value={displayCount(database?.accountCount)} testId="metric-database-account-count" />
              <Metric label="Objecten in database" value={displayCount(database?.propertyCount)} testId="metric-database-property-count" />
            </div>
            <div className="mt-5 border-t border-[#e8edef] pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#637989]">Recente accounts</h3>
                <span className="text-[10px] text-[#82919a]">{displayCount(data.accounts?.recent?.length)} getoond</span>
              </div>
              {data.accounts?.recent?.length ? (
                <div className="space-y-2">
                  {data.accounts.recent.map((account) => (
                    <div key={account.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-[#f7f9f9] px-3.5 py-3" data-testid={`row-recent-account-${account.id}`}>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#30495b]" data-testid={`text-account-email-${account.id}`}>{account.email || 'E-mailadres niet beschikbaar'}</p>
                        <p className="mt-0.5 text-[10px] text-[#85939d]">Aangemaakt {displayDate(account.createdAt)}</p>
                      </div>
                      <span className="shrink-0 rounded-md border border-[#dce4e7] bg-white px-2 py-1 text-[10px] font-semibold text-[#647987]" data-testid={`text-account-role-${account.id}`}>{account.role || 'Rol niet beschikbaar'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#d8e1e4] bg-[#fafcfc] px-4 py-5 text-center" data-testid="empty-recent-accounts">
                  <Users size={18} className="mx-auto text-[#8b9ba4]" aria-hidden="true" />
                  <p className="mt-2 text-xs text-[#718292]">Geen recente accounts beschikbaar.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Modules" title="Aangesloten onderdelen" icon={Layers3} />
            {data.modules?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.modules.map((module) => (
                  <article key={module.id} className="rounded-xl border border-[#e6ebed] p-3.5" data-testid={`card-module-${module.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#30495b]" data-testid={`text-module-name-${module.id}`}>{module.name}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#83929c]" data-testid={`text-module-category-${module.id}`}>{module.category || 'Categorie niet beschikbaar'}</p>
                      </div>
                      <StatusPill status={module.status} testId={`status-module-${module.id}`} />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#718292]" data-testid={`text-module-detail-${module.id}`}>{module.detail || 'Geen aanvullende details'}</p>
                    {module.status === 'development' && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
                        <Zap size={11} aria-hidden="true" /> Beschrijvende placeholder; geen actieve dienst
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#d8e1e4] bg-[#fafcfc] px-4 py-7 text-center" data-testid="empty-modules">
                <Layers3 size={19} className="mx-auto text-[#8b9ba4]" aria-hidden="true" />
                <p className="mt-2 text-xs text-[#718292]">Geen modules beschikbaar in deze momentopname.</p>
              </div>
            )}
          </Panel>
        </div>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeading eyebrow="Operationele gebeurtenissen" title="Recente API-fouten" icon={Activity} />
            <p className="max-w-sm text-right text-[10px] leading-4 text-[#85939d]">
              Alleen generieke foutmeldingen uit het huidige API-proces. Deze registratie wordt niet historisch bewaard.
            </p>
          </div>
          {data.events?.length ? (
            <div className="overflow-hidden rounded-xl border border-[#e6ebed]">
              <div className="hidden grid-cols-[120px_140px_1fr_160px] gap-4 bg-[#f7f9f9] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#7b8b97] md:grid">
                <span>Niveau</span><span>Bron</span><span>Gebeurtenis</span><span>Moment</span>
              </div>
              <div className="divide-y divide-[#edf0f1]">
                {data.events.map((event) => {
                  return (
                    <div key={event.id} className="grid gap-2 px-4 py-3.5 md:grid-cols-[120px_140px_1fr_160px] md:items-center md:gap-4" data-testid={`row-event-${event.id}`}>
                      <div><StatusPill status={event.level} testId={`status-event-${event.id}`} /></div>
                      <p className="text-xs font-semibold text-[#526b7b]" data-testid={`text-event-source-${event.id}`}>{event.source || 'Bron niet beschikbaar'}</p>
                      <p className="text-xs leading-5 text-[#334d5e]" data-testid={`text-event-message-${event.id}`}>{event.message || 'Bericht niet beschikbaar'}</p>
                      <p className="text-[10px] text-[#82919a]" data-testid={`text-event-time-${event.id}`}>{displayDate(event.occurredAt)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d8e1e4] bg-[#fafcfc] px-4 py-7 text-center" data-testid="empty-events">
              <Activity size={19} className="mx-auto text-[#8b9ba4]" aria-hidden="true" />
              <p className="mt-2 text-xs font-semibold text-[#5f7482]">Geen recente API-fouten</p>
              <p className="mt-1 text-[11px] text-[#87949d]">Er zijn geen foutmeldingen opgenomen sinds de start van dit API-proces.</p>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

export default ControlRoom;
