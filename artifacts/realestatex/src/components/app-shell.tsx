import { BarChart3, Boxes, Calculator, ChevronRight, GraduationCap, Handshake, LayoutDashboard, LogOut, Menu, Plus, Search, Sparkles, X, CircleDot, LineChart } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useState, type ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { useGetAccount } from '@workspace/api-client-react';

const navItems = [
  { href: '/dashboard', label: 'Overzicht', note: 'Portfolio cockpit', icon: LayoutDashboard },
  { href: '/properties', label: 'Objecten', note: 'Je vastgoed', icon: ChevronRight },
  { href: '/calculators', label: 'Rekentools', note: 'Scenario’s', icon: Calculator },
  { href: '/cirkel-1', label: 'Cirkel 1', note: 'Netto BAR-toets', icon: CircleDot },
  { href: '/market', label: 'Markt', note: 'Richting & tempo', icon: BarChart3 },
  { href: '/suite', label: 'Suite', note: '20 verbonden modules', icon: Boxes },
  { href: '/dealing-room', label: 'Dealing Room', note: 'Deals & matching', icon: Handshake },
  { href: '/training-room', label: 'Training Room', note: 'Scenario simulator', icon: GraduationCap },
  { href: '/property-transformer', label: 'Property Transformer', note: 'Foto naar plan', icon: Sparkles },
];
const adminNavItems = [
  { href: '/sales', label: 'Sales & CRM', note: 'Leads & verkeer', icon: LineChart },
];

export function AppShell({ children, onAddProperty }: { children: ReactNode; onAddProperty?: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: account } = useGetAccount();
  const email = user?.primaryEmailAddress?.emailAddress;
  const logout = () => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, '') || "/" });
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNavItems = account?.role === 'admin' ? [...navItems, ...adminNavItems] : navItems;
  const current = visibleNavItems.find((item) => item.href === location) ?? navItems[0];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col overflow-y-auto bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <span className="display text-lg font-bold">R</span>
            </span>
            <span>
              <span className="block font-bold tracking-[-0.04em] text-white">RealEstate<span className="text-sidebar-primary">X</span></span>
              <span className="mono text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">Intelligence workspace</span>
            </span>
          </Link>
          <button className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Sluit navigatie" data-testid="button-close-menu"><X size={18} /></button>
        </div>

        <div className="mt-14 px-2">
          <p className="mono mb-3 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Werkruimte</p>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'}`} data-testid={`link-nav-${item.label.toLowerCase()}`}>
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.8} className={active ? '' : 'text-sidebar-foreground/50 group-hover:text-sidebar-primary'} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`block text-[10px] ${active ? 'text-sidebar-primary-foreground/70' : 'text-sidebar-foreground/40'}`}>{item.note}</span>
                  </span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Dataverbinding</span>
            <span className="h-2 w-2 rounded-full bg-[#64d7bd] shadow-[0_0_0_4px_rgba(100,215,189,.12)]" />
          </div>
          <p className="text-sm font-semibold text-white">Alles gesynchroniseerd</p>
          <p className="mt-1 text-xs leading-5 text-sidebar-foreground/55">Je dashboard gebruikt de laatste markt- en objectdata.</p>
        </div>
        <div className="mt-5 flex items-center gap-3 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#37506b] text-xs font-bold text-white">
            {(user?.firstName?.[0] ?? email?.[0] ?? 'U').toUpperCase()}
            {(user?.lastName?.[0] ?? '').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">
              {user?.firstName || email || 'Gebruiker'}
            </p>
            <p className="truncate text-[10px] text-sidebar-foreground/45">
              {account?.role === 'admin' ? 'Beheerder' : account?.role === 'member' ? 'Lid' : 'Eigenaar'}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
            aria-label="Afmelden"
            data-testid="button-logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-[#101a2b]/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Sluit menu" data-testid="button-overlay-menu" />}

      <main className="lg:pl-[270px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-border bg-card p-2.5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigatie" data-testid="button-open-menu"><Menu size={19} /></button>
            <div>
              <p className="mono hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">RealEstateX / 2025</p>
              <h1 className="display text-xl font-bold tracking-[-0.04em] sm:text-2xl">{current.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-muted-foreground sm:flex">
              <Search size={15} />
              <input className="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" placeholder="Zoeken..." aria-label="Globaal zoeken" data-testid="input-global-search" />
              <span className="mono rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground/60">⌘K</span>
            </div>
            {onAddProperty && <button onClick={onAddProperty} className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-header-add-property"><Plus size={16} /> <span className="hidden sm:inline">Object toevoegen</span></button>}
            <div className="grid h-9 w-9 place-items-center rounded-full border-2 border-card bg-[#37506b] text-[10px] font-bold text-white shadow-sm" title={email ?? 'Gebruiker'}>
              {(user?.firstName?.[0] ?? email?.[0] ?? 'U').toUpperCase()}
              {(user?.lastName?.[0] ?? '').toUpperCase()}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-12 lg:py-9">{children}</div>
      </main>
    </div>
  );
}