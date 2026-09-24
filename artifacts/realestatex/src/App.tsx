import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@workspace/replit-auth-web';
import NotFound from '@/pages/not-found';
import { Calculators, Dashboard, Market, Properties, Suite } from '@/pages/pages';
import { DealingRoom } from '@/pages/enterprise';
import { TrainingRoom } from '@/pages/training-room';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
         <Route path="/" component={Dashboard} />
         <Route path="/properties" component={Properties} />
         <Route path="/calculators" component={Calculators} />
         <Route path="/market" component={Market} />
         <Route path="/suite" component={Suite} />
          <Route path="/dealing-room" component={DealingRoom} />
          <Route path="/training-room" component={TrainingRoom} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">
        <p className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Werkruimte laden…
        </p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background px-5 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <span className="display text-2xl font-bold">R</span>
          </div>
          <p className="mono mt-7 text-[10px] uppercase tracking-[0.2em] text-[#c17b21]">
            RealEstateX
          </p>
          <h1 className="display mt-3 text-3xl font-bold tracking-[-0.06em]">
            Je portefeuille, privé en beschermd.
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Meld je aan om je objecten, scenario’s en gesprekken veilig te bekijken.
          </p>
          <button
            onClick={auth.login}
            className="mt-8 w-full rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            data-testid="button-login"
          >
            Aanmelden
          </button>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
