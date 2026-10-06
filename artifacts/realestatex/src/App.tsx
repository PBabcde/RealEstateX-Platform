import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ApiError, getGetAccountQueryKey, useGetAccount } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Calculators, Dashboard, Market, Properties, Suite } from '@/pages/pages';
import { DealingRoom } from '@/pages/enterprise';
import { TrainingRoom } from '@/pages/training-room';
import { PropertyTransformer } from '@/pages/property-transformer';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#243b53",
    colorForeground: "#182b40",
    colorMutedForeground: "#526579",
    colorDanger: "#a4443b",
    colorBackground: "#ffffff",
    colorInput: "#f7f8fa",
    colorInputForeground: "#182b40",
    colorNeutral: "#526579",
    fontFamily: "Manrope, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#182b40]",
    headerSubtitle: "text-[#526579]",
    socialButtonsBlockButtonText: "text-[#182b40]",
    formFieldLabel: "text-[#182b40]",
    footerActionLink: "text-[#243b53] font-bold",
    footerActionText: "text-[#526579]",
    dividerText: "text-[#526579]",
    identityPreviewEditButton: "text-[#243b53]",
    formFieldSuccessText: "text-[#287b6a]",
    alertText: "text-[#a4443b]",
    logoBox: "mb-5",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-[#d4dce4] bg-white",
    formButtonPrimary: "bg-[#243b53] text-white",
    formFieldInput: "bg-[#f7f8fa] text-[#182b40] border-[#d4dce4]",
    footerAction: "py-4",
    dividerLine: "bg-[#d4dce4]",
    alert: "bg-[#fae7e3]",
    otpCodeFieldInput: "text-[#182b40]",
    formFieldRow: "mb-4",
    main: "gap-5",
  },
};

function Loading() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">Werkruimte laden…</div>;
}

function Home() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-5 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <img src={`${basePath}/logo.svg`} alt="RealEstateX" className="mx-auto h-12" />
        <h1 className="display mt-7 text-3xl font-bold tracking-[-0.06em]">Je portefeuille, privé en beschermd.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Meld je aan om je objecten, scenario’s en gesprekken veilig te bekijken.</p>
        <Link href="/sign-in" className="mt-8 block rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground" data-testid="button-login">Aanmelden</Link>
        <Link href="/sign-up" className="mt-4 block text-sm font-semibold text-foreground">Account aanmaken</Link>
      </div>
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded } = useAuth();
  if (!isLoaded) return <Loading />;
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Home /></Show></>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
  </div>;
}

function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
  </div>;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const account = useGetAccount({ query: {
    queryKey: getGetAccountQueryKey(),
    enabled: isLoaded && Boolean(isSignedIn),
    retry: (count, error) => !(error instanceof ApiError && [401, 403].includes(error.status)) && count < 2,
  } });
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (account.isPending) return <Loading />;
  if (account.isError) return <div className="grid min-h-[100dvh] place-items-center bg-background p-8 text-foreground">
    <div className="text-center" data-testid="account-access-error">
      <h1 className="text-2xl font-bold">Werkruimte niet beschikbaar</h1>
      <p className="my-4">Je bent aangemeld, maar je werkruimte kon niet worden geopend.</p>
      <button onClick={() => account.refetch()} className="mr-5 underline">Opnieuw proberen</button>
      <button onClick={() => signOut({ redirectUrl: basePath || "/" })} className="underline">Afmelden</button>
    </div>
  </div>;
  return <>{children}</>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/dashboard"><ProtectedPage><Dashboard /></ProtectedPage></Route>
    <Route path="/properties"><ProtectedPage><Properties /></ProtectedPage></Route>
    <Route path="/calculators"><ProtectedPage><Calculators /></ProtectedPage></Route>
    <Route path="/market"><ProtectedPage><Market /></ProtectedPage></Route>
    <Route path="/suite"><ProtectedPage><Suite /></ProtectedPage></Route>
    <Route path="/dealing-room"><ProtectedPage><DealingRoom /></ProtectedPage></Route>
    <Route path="/training-room"><ProtectedPage><TrainingRoom /></ProtectedPage></Route>
    <Route path="/property-transformer"><ProtectedPage><PropertyTransformer /></ProtectedPage></Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welkom terug", subtitle: "Meld je aan bij RealEstateX" } },
        signUp: { start: { title: "Maak je account aan", subtitle: "Begin met je vastgoedportefeuille" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider><Router /><Toaster /></TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;
