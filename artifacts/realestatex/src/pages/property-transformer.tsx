import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useDeclutterPropertyImage, useStagePropertyImage, useMakeoverPropertyImage, useConvertPropertyImageToDusk, useJoinPropertyProBetaWaitlist } from '@workspace/api-client-react';
import { ArrowLeftRight, ArrowRight, Check, CircleHelp, Download, FileText, FlipHorizontal2, ImagePlus, Info, Layers3, LoaderCircle, Pencil, Plus, Printer, Scissors, Search, Sparkles, Split, SunMedium, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { EnergyXScenarioHistory } from '@/components/energyx-scenario-history';
import { createPropertyProjectStorage, getPropertyPhotoSaveFailureKind, PropertyPhotoStorageSaveError, subscribeLegacyProjectClaimChanges, subscribePropertyProjectSortOrderPreferenceChanges, dataUrlToBlob, blobToObjectUrl, sortPropertyProjects, readPropertyProjectSortOrderPreference, savePropertyProjectSortOrderPreference, type LegacyProjectClaimStatus, type PropertyAction, type PropertyImageRecord, type PropertyProject, type PropertyProjectPhotoHealth, type PropertyProjectSortOrder, type PropertyStyle, type PropertyUnit } from '@/lib/property-transformer-db';

type ResultMeta = { key: string; label: string; imageUrl: string; isConcept: boolean; disclaimer: string };
type ProjectForm = Pick<PropertyProject, 'address' | 'municipality' | 'projectName' | 'notes' | 'selectedStyle' | 'purchasePrice' | 'renovationCost' | 'acquisitionCost' | 'estimatedValue' | 'monthlyRent'>;

const styles: { id: PropertyStyle; name: string; note: string }[] = [
  { id: 'japandi', name: 'Japandi', note: 'Zacht, rustig, natuurlijk' },
  { id: 'modern', name: 'Modern', note: 'Strak, helder, verkoopbaar' },
  { id: 'industrial', name: 'Industrial', note: 'Karakter, staal, textuur' },
];
const actions: { id: PropertyAction; label: string; note: string; icon: typeof Sparkles }[] = [
  { id: 'declutter', label: 'Declutter', note: 'Haal losse objecten uit beeld', icon: Scissors },
  { id: 'stage', label: 'Virtual stage', note: 'Voeg meubels toe als concept', icon: Layers3 },
  { id: 'makeover', label: 'Style makeover', note: 'Test een interieur-richting', icon: WandSparkles },
  { id: 'dusk', label: 'Day to dusk', note: 'Maak een avondconcept', icon: SunMedium },
];
const defaultChecklist = [
  { id: 'scope', label: 'Transformatie-scope afstemmen', done: false },
  { id: 'contractor', label: 'Offertes en aannemer vergelijken', done: false },
  { id: 'photography', label: 'Nieuwe fotografie inplannen', done: false },
  { id: 'valuation', label: 'Marktwaarde laten toetsen', done: false },
];

const emptyForm: ProjectForm = { address: '', municipality: '', projectName: 'Nieuwe transformatiescan', notes: '', selectedStyle: 'japandi', purchasePrice: 325000, renovationCost: 28500, acquisitionCost: 9200, estimatedValue: 415000, monthlyRent: 1850 };
const sourcePhotoSaveErrorMessages = {
  quota: 'De browseropslag is vol. Maak ruimte vrij in je browseropslag, maar wis de gegevens van deze site niet. Probeer daarna opnieuw. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven.',
  access: 'Toegang tot lokale browseropslag is geblokkeerd. Sta lokale opslag toe voor deze website in je browserinstellingen en probeer opnieuw. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven.',
  unknown: 'De foto kon niet worden opgeslagen. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven. Controleer de browseropslag en probeer opnieuw.',
} satisfies Record<'quota' | 'access' | 'unknown', string>;

function sourcePhotoSaveErrorMessage(error: unknown): string {
  if (error instanceof PropertyPhotoStorageSaveError) {
    return sourcePhotoSaveErrorMessages[error.failureKind];
  }
  if (error instanceof DOMException) {
    return sourcePhotoSaveErrorMessages[getPropertyPhotoSaveFailureKind(error)];
  }
  return error instanceof Error ? error.message : 'Upload mislukt. Probeer een andere afbeelding.';
}

function makeProject(originalKey = ''): PropertyProject {
  return { id: crypto.randomUUID(), ...emptyForm, originalKey, resultKeys: {}, selectedResult: null, splitRatio: 50, flipHorizontal: false, roiFields: { purchasePrice: emptyForm.purchasePrice, renovationCost: emptyForm.renovationCost, acquisitionCost: emptyForm.acquisitionCost, estimatedValue: emptyForm.estimatedValue, monthlyRent: emptyForm.monthlyRent }, units: [{ id: crypto.randomUUID(), label: 'Unit A', area: 42, value: 219000, flipped: false }, { id: crypto.randomUUID(), label: 'Unit B', area: 38, value: 196000, flipped: false }], checklist: defaultChecklist, updatedAt: new Date().toISOString() };
}

async function compressImage(file: File): Promise<{ dataUrl: string; blob: Blob }> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
    throw new Error('Alleen JPEG- en PNG-afbeeldingen worden ondersteund.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Deze afbeelding kan niet worden gelezen. Kies een geldige JPEG- of PNG-afbeelding.');
  }
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Deze afbeelding kan niet worden gelezen.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 620 * 1024 && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > 620 * 1024) throw new Error('Kies een kleinere afbeelding; deze blijft groter dan 620 KB.');
  return { dataUrl, blob: await dataUrlToBlob(dataUrl) };
}

function euro(value: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);
}

function number(value: number): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value || 0);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function Field({ label, value, onChange, type = 'text', placeholder, prefix }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; prefix?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span><div className="relative">{prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}<input value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} className={`w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/50 focus:border-[#b87145] focus:ring-4 focus:ring-[#b87145]/10 ${prefix ? 'pl-8' : ''}`} /></div></label>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card shadow-[0_9px_30px_rgba(51,59,76,.05)] ${className}`}>{children}</section>;
}

function CardHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6"><div><p className="mono text-[9px] uppercase tracking-[0.18em] text-[#a95f39]">{eyebrow}</p><h2 className="display mt-1.5 text-xl font-bold tracking-[-0.05em]">{title}</h2>{detail && <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function ConceptBadge() {
  return <span className="inline-flex items-center gap-1.5 rounded-md bg-[#fff0df] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#9d5a2e]"><Sparkles size={11} /> AI-concept</span>;
}

function BeforeAfter({ originalUrl, result, splitRatio, setSplitRatio, flipped }: { originalUrl: string; result?: ResultMeta; splitRatio: number; setSplitRatio: (value: number) => void; flipped: boolean }) {
  if (!result) return <div><div className="property-grid flex h-[330px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-[#f3f1ed] p-4"><img src={originalUrl} alt="Originele woningfoto" className="h-full w-full object-contain" /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">De originele foto blijft lokaal in deze browser. Er is nog geen conceptresultaat beschikbaar.</p></div>;
  return <div className="overflow-hidden rounded-xl border border-[#d9d4cb] bg-[#ebe7e0]"><div className="relative aspect-[4/3] overflow-hidden" style={{ transform: flipped ? 'scaleX(-1)' : undefined }}><img src={originalUrl} alt="Originele woningfoto" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 overflow-hidden" style={{ width: `${splitRatio}%` }}><img src={result.imageUrl} alt={`${result.label} concept`} className="h-full w-full object-cover" style={{ width: `${10000 / (splitRatio || 100)}%`, maxWidth: 'none' }} /></div><div className="absolute inset-y-0 z-10 w-px bg-[#f8f5ef] shadow-[0_0_0_1px_rgba(32,39,51,.24)]" style={{ left: `${splitRatio}%` }}><div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[#f8f5ef] bg-[#24324b] text-white shadow-lg"><ArrowLeftRight size={14} /></div></div><span className="absolute left-3 top-3 rounded bg-[#24324b]/85 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#f7f3ec]">Concept</span><span className="absolute right-3 top-3 rounded bg-[#f7f3ec]/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#24324b]">Origineel</span></div><div className="border-t border-[#d9d4cb] bg-card px-4 py-3"><div className="flex items-center justify-between text-[10px] font-bold"><span>Resultaat</span><span className="mono text-muted-foreground">{splitRatio}% concept</span></div><input type="range" min="0" max="100" value={splitRatio} onChange={(event) => setSplitRatio(Number(event.target.value))} className="mt-1 h-5 w-full cursor-ew-resize accent-[#a95f39]" aria-label="Voor en na vergelijking" data-testid="input-before-after-split" /><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Gebruik de schuif met toetsenbord. AI-visualisatie: geen feitelijke representatie van de woning.</p></div></div>;
}

function ActionButton({ action, disabled, pending, onClick }: { action: typeof actions[number]; disabled: boolean; pending: boolean; onClick: () => void }) {
  const Icon = action.icon;
  return <button onClick={onClick} disabled={disabled || pending} className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:border-[#b87145] hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-45" data-testid={`button-transform-${action.id}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3e7da] text-[#a95f39] transition-transform group-hover:scale-105">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Icon size={16} />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{action.label}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{action.note}</span></span><ArrowRight size={14} className="text-muted-foreground" /></button>;
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error !== null
    && typeof error === 'object'
    && 'status' in error
    && error.status === status;
}

function ProBetaWaitlistDialog({ initialEmail, returnFocusTarget, onClose }: { initialEmail: string; returnFocusTarget: HTMLElement | null; onClose: () => void }) {
  const joinWaitlist = useJoinPropertyProBetaWaitlist();
  const [email, setEmail] = useState(initialEmail);
  const [consent, setConsent] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current = returnFocusTarget?.isConnected
      ? returnFocusTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const getFocusableElements = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if (focusIsOutsideDialog
        || (event.shiftKey && document.activeElement === first)
        || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const preferredReturnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        const candidates = [
          preferredReturnTarget,
          document.querySelector<HTMLElement>('button[data-testid^="button-transform-"]:not(:disabled)'),
          document.querySelector<HTMLElement>('[data-testid="button-open-projects"]'),
        ];
        const returnTarget = candidates.find((candidate) => candidate?.isConnected
          && !candidate.matches(':disabled')
          && candidate.getAttribute('aria-disabled') !== 'true');
        returnTarget?.focus();
        if (returnFocusRef.current === preferredReturnTarget) {
          returnFocusRef.current = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const preferredTarget = registered
      ? dialog.querySelector<HTMLElement>('[data-testid="button-close-beta-success"]')
      : dialog.querySelector<HTMLElement>('[data-testid="input-pro-beta-email"]');
    const focusableTarget = preferredTarget
      ?? dialog.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')
      ?? dialog;
    focusableTarget.focus();
  }, [registered]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      await joinWaitlist.mutateAsync({ data: { email: email.trim(), consent: true } });
      setRegistered(true);
    } catch (cause) {
      setError(isHttpStatus(cause, 429)
        ? 'Je hebt dit formulier kort geleden al verstuurd. Probeer het later opnieuw.'
        : 'Je aanmelding kon niet worden opgeslagen. Probeer het opnieuw.');
    }
  };

  return <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#1c2739]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="property-pro-beta-title" data-testid="dialog-pro-beta">
    <div className="my-6 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
        <div><p className="mono text-[9px] uppercase tracking-[.18em] text-[#a95f39]">RealEstateX Pro</p><h2 id="property-pro-beta-title" className="display mt-1 text-2xl font-bold tracking-[-.05em]">{registered ? 'Je staat op de lijst' : 'Pro-bèta aanvragen'}</h2></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Sluit Pro-bèta-aanmelding"><X size={18} /></button>
      </div>
      {registered ? <div className="space-y-5 px-5 py-6 sm:px-7">
        <p className="text-sm leading-6 text-muted-foreground">Je aanmelding is opgeslagen. Alleen je contactadres en toestemmingsregistratie zijn hiervoor vastgelegd; vastgoedprojecten en foto’s zijn niet meegestuurd.</p>
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec]" data-testid="button-close-beta-success">Gereed</button>
      </div> : <form onSubmit={(event) => void submit(event)} className="space-y-5 px-5 py-6 sm:px-7">
        <p className="text-sm leading-6 text-muted-foreground">Je hebt de drie gratis vastgoedanalyses gebruikt. Schrijf je in voor nieuws over de Pro-bèta.</p>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">E-mailadres</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:border-[#b87145] focus:ring-4 focus:ring-[#b87145]/10" data-testid="input-pro-beta-email" /></label>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5 text-xs leading-5">
          <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-[#a95f39]" data-testid="checkbox-pro-beta-consent" />
          <span>Ik geef RealEstateX toestemming om mijn e-mailadres en deze toestemming te bewaren en mij over de Pro-bèta te benaderen. Mijn vastgoedprojecten en foto’s worden niet meegestuurd met deze aanmelding.</span>
        </label>
        <p className="text-[10px] leading-4 text-muted-foreground">Je toestemming wordt met datum en versie vastgelegd. Je kunt je later afmelden.</p>
        {error && <p className="rounded-lg bg-[#fff1ee] px-3 py-2 text-[10px] font-semibold leading-4 text-[#9e4336]" role="alert" data-testid="status-pro-beta-error">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary">Niet nu</button>
          <button type="submit" disabled={!consent || joinWaitlist.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-pro-beta">{joinWaitlist.isPending && <LoaderCircle size={14} className="animate-spin" />} Aanmelden voor de bèta</button>
        </div>
      </form>}
    </div>
  </div>;
}

function PropertyTransformer({ accountId, userEmail }: { accountId: string; userEmail: string }) {
  const storage = useMemo(() => createPropertyProjectStorage(accountId), [accountId]);
  const [project, setProject] = useState<PropertyProject | null>(null);
  const [projects, setProjects] = useState<PropertyProject[]>([]);
  const [photoHealthByProject, setPhotoHealthByProject] = useState<Record<string, PropertyProjectPhotoHealth>>({});
  const [legacyClaimStatus, setLegacyClaimStatus] = useState<LegacyProjectClaimStatus>({ status: 'none', projectCount: 0 });
  const [originalUrl, setOriginalUrl] = useState('');
  const [results, setResults] = useState<Partial<Record<PropertyAction, ResultMeta>>>({});
  const [loading, setLoading] = useState(true);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [isProjectSwitching, setIsProjectSwitching] = useState(false);
  const [isProjectTransferring, setIsProjectTransferring] = useState(false);
  const [isLegacyClaiming, setIsLegacyClaiming] = useState(false);
  const [projectTransferError, setProjectTransferError] = useState('');
  const [photoHealthError, setPhotoHealthError] = useState('');
  const [projectTransferNotice, setProjectTransferNotice] = useState('');
  const [pendingDuplicateImport, setPendingDuplicateImport] = useState<{ archive: unknown; existing: PropertyProject } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [photoCleanupKeys, setPhotoCleanupKeys] = useState<string[]>([]);
  const [photoCleanupError, setPhotoCleanupError] = useState('');
  const [isPhotoCleanupRunning, setIsPhotoCleanupRunning] = useState(false);
  const [proBetaDialogOpen, setProBetaDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [missingOriginalPhoto, setMissingOriginalPhoto] = useState(false);
  const [missingConceptActions, setMissingConceptActions] = useState<PropertyAction[]>([]);
  const [splitRatio, setSplitRatio] = useState(50);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'studio' | 'split' | 'roi'>('studio');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletedProjectName, setDeletedProjectName] = useState<string | null>(null);
  const proBetaDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectListRefreshSequence = useRef(0);
  const projectManagerReturnFocusRef = useRef<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const transferFileRef = useRef<HTMLInputElement>(null);
  const portfolioTransferFileRef = useRef<HTMLInputElement>(null);
  const duplicateImportDialogRef = useRef<HTMLElement>(null);
  const duplicateImportReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectRef = useRef<PropertyProject | null>(project);
  const originalPreviewRef = useRef(originalUrl);
  const resultPreviewsRef = useRef(results);
  const activePreviewRefreshSequence = useRef(0);
  const externallyDeletedProjectIdRef = useRef<string | null>(null);
  const objectUrls = useRef(new Set<string>());
  const declutter = useDeclutterPropertyImage();
  const stage = useStagePropertyImage();
  const makeover = useMakeoverPropertyImage();
  const dusk = useConvertPropertyImageToDusk();

  const createObjectUrl = (blob: Blob) => {
    const url = blobToObjectUrl(blob);
    objectUrls.current.add(url);
    return url;
  };
  const revokeObjectUrl = (url: string) => {
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  };
  const revokeAllObjectUrls = () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  };
  const createProjectPreviewUrls = async (
    projectImages: Awaited<ReturnType<typeof storage.loadPropertyProjectImages>>,
  ) => {
    const createdUrls: string[] = [];
    try {
      let loadedOriginalUrl = '';
      if (projectImages.original) {
        loadedOriginalUrl = createObjectUrl(projectImages.original.blob);
        createdUrls.push(loadedOriginalUrl);
      }
      const loadedResults: Partial<Record<PropertyAction, ResultMeta>> = {};
      for (const [action, image] of Object.entries(projectImages.results)) {
        const imageUrl = createObjectUrl(image.blob);
        createdUrls.push(imageUrl);
        loadedResults[action as PropertyAction] = { key: image.key, label: image.label, imageUrl, isConcept: image.isConcept, disclaimer: image.disclaimer };
      }
      return { originalUrl: loadedOriginalUrl, results: loadedResults, missingSource: projectImages.missingOriginal, missingConcepts: projectImages.missingConcepts };
    } catch (error) {
      for (const url of createdUrls) revokeObjectUrl(url);
      throw error;
    }
  };
  const loadProjectPreviews = async (target: PropertyProject) =>
    createProjectPreviewUrls(await storage.loadPropertyProjectImages(target));

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    originalPreviewRef.current = originalUrl;
  }, [originalUrl]);

  useEffect(() => {
    resultPreviewsRef.current = results;
  }, [results]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedList = await storage.loadPropertyProjectsWithPhotoHealth();
        const pendingPhotoCleanup = await storage.loadPendingPropertyPhotoCleanup().catch(() => []);
        let claimStatus: LegacyProjectClaimStatus;
        try {
          claimStatus = await storage.getLegacyProjectClaimStatus();
        } catch {
          claimStatus = { status: 'error', projectCount: 0 };
        }
        if (!active) return;
        let existing = storedList.projects[0];
        let projectList = storedList;
        if (!existing && claimStatus.status !== 'available') {
          existing = makeProject();
          await storage.savePropertyProject(existing);
          projectList = await storage.loadPropertyProjectsWithPhotoHealth();
          if (!active) return;
        }
        setProjects(projectList.projects);
        setPhotoHealthByProject(projectList.photoHealthById);
        setPhotoCleanupKeys(pendingPhotoCleanup);
        setLegacyClaimStatus(claimStatus);
        if (!existing) return;
        try {
          const loaded = await loadProjectPreviews(existing);
          if (!active) {
            for (const url of [loaded.originalUrl, ...Object.values(loaded.results).map((item) => item?.imageUrl ?? '')]) {
              if (url) revokeObjectUrl(url);
            }
            return;
          }
          setProject(existing);
          setSplitRatio(existing.splitRatio);
          setOriginalUrl(loaded.originalUrl);
          setResults(loaded.results);
          setMissingOriginalPhoto(loaded.missingSource);
          setMissingConceptActions(loaded.missingConcepts);
        } catch (error) {
          if (active) {
            setProject(existing);
            setSplitRatio(existing.splitRatio);
            setUploadError(error instanceof Error ? error.message : 'De projectfoto’s konden niet uit de lokale opslag worden geladen.');
          }
        }
      } catch {
        if (active) {
          setProject(makeProject());
          setUploadError('Lokale browseropslag is niet beschikbaar. Controleer de opslaginstellingen van deze browser.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [storage]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) return;

    let active = true;
    const refreshActivePhotoPreviews = async () => {
      const sequence = ++activePreviewRefreshSequence.current;
      let loaded: Awaited<ReturnType<typeof loadProjectPreviews>> | undefined;
      try {
        const photoState = await storage.loadPropertyProjectPhotoState(projectId);
        const latestProject = photoState?.project;
        if (!latestProject) {
          const currentProject = projectRef.current;
          if (!active || sequence !== activePreviewRefreshSequence.current || currentProject?.id !== projectId) return;
          externallyDeletedProjectIdRef.current = projectId;
          setDeletedProjectName(currentProject.projectName || 'Transformatiescan');
          activePreviewRefreshSequence.current += 1;
          revokeAllObjectUrls();
          projectRef.current = null;
          originalPreviewRef.current = '';
          resultPreviewsRef.current = {};
          setProject(null);
          setOriginalUrl('');
          setResults({});
          setMissingOriginalPhoto(false);
          setMissingConceptActions([]);
          setSplitRatio(50);
          setProjectManagerOpen(false);
          setTransferOpen(false);
          setUploadError('');
          setNotice('');
          return;
        }
        loaded = await createProjectPreviewUrls(photoState);
        const currentProject = projectRef.current;
        if (!active || sequence !== activePreviewRefreshSequence.current || currentProject?.id !== projectId) {
          for (const url of [loaded.originalUrl, ...Object.values(loaded.results).map((item) => item?.imageUrl ?? '')]) {
            if (url) revokeObjectUrl(url);
          }
          return;
        }

        projectRef.current = {
          ...currentProject,
          originalKey: latestProject.originalKey,
          resultKeys: latestProject.resultKeys,
        };
        setProject((current) => {
          if (!current || current.id !== projectId) return current;
          const refreshed = {
            ...current,
            originalKey: latestProject.originalKey,
            resultKeys: latestProject.resultKeys,
          };
          projectRef.current = refreshed;
          return refreshed;
        });

        const nextUrls = new Set([
          loaded.originalUrl,
          ...Object.values(loaded.results).map((item) => item?.imageUrl ?? ''),
        ]);
        for (const url of [
          originalPreviewRef.current,
          ...Object.values(resultPreviewsRef.current).map((item) => item?.imageUrl ?? ''),
        ]) {
          if (url && !nextUrls.has(url)) revokeObjectUrl(url);
        }

        originalPreviewRef.current = loaded.originalUrl;
        resultPreviewsRef.current = loaded.results;
        setOriginalUrl(loaded.originalUrl);
        setResults(loaded.results);
        setMissingOriginalPhoto(loaded.missingSource);
        setMissingConceptActions(loaded.missingConcepts);
      } catch (error) {
        if (active && sequence === activePreviewRefreshSequence.current && projectRef.current?.id === projectId) {
          setUploadError(error instanceof Error ? error.message : 'De projectfoto’s konden niet opnieuw uit de lokale opslag worden geladen.');
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshActivePhotoPreviews();
    };
    const unsubscribe = storage.subscribePropertyStorageChanges(() => {
      void refreshActivePhotoPreviews();
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', refreshActivePhotoPreviews);
    void refreshActivePhotoPreviews();
    return () => {
      active = false;
      activePreviewRefreshSequence.current += 1;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', refreshActivePhotoPreviews);
    };
  }, [project?.id, storage]);

  const form = project ?? makeProject();
  const updateProject = (patch: Partial<PropertyProject>) => setProject((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current);
  const updateForm = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
    const next = { ...form, [key]: value, updatedAt: new Date().toISOString() };
    updateProject(next);
    void save(next);
  };
  const save = async (nextProject = project) => {
    if (!nextProject || externallyDeletedProjectIdRef.current === nextProject.id) return;
    setIsSaving(true);
    try {
      await storage.updatePropertyProject(nextProject);
    } catch {
      setUploadError('Opslaan in deze browser is mislukt. Maak ruimte vrij en probeer opnieuw.');
    } finally {
      setIsSaving(false);
    }
  };
  const refreshPhotoState = async (projectId: string) => {
    const sequence = ++activePreviewRefreshSequence.current;
    const photoState = await storage.loadPropertyProjectPhotoState(projectId);
    if (!photoState) return;
    const latestProject = photoState.project;
    const loaded = await createProjectPreviewUrls(photoState);
    if (sequence !== activePreviewRefreshSequence.current || projectRef.current?.id !== projectId) {
      for (const url of [loaded.originalUrl, ...Object.values(loaded.results).map((item) => item?.imageUrl ?? '')]) {
        if (url) revokeObjectUrl(url);
      }
      return;
    }

    const nextUrls = new Set([
      loaded.originalUrl,
      ...Object.values(loaded.results).map((item) => item?.imageUrl ?? ''),
    ]);
    for (const url of [
      originalPreviewRef.current,
      ...Object.values(resultPreviewsRef.current).map((item) => item?.imageUrl ?? ''),
    ]) {
      if (url && !nextUrls.has(url)) revokeObjectUrl(url);
    }

    projectRef.current = latestProject;
    originalPreviewRef.current = loaded.originalUrl;
    resultPreviewsRef.current = loaded.results;
    setProject(latestProject);
    setOriginalUrl(loaded.originalUrl);
    setResults(loaded.results);
    setMissingOriginalPhoto(loaded.missingSource);
    setMissingConceptActions(loaded.missingConcepts);
  };
  const result = project?.selectedResult ? results[project.selectedResult] : undefined;
  const activeMutation = declutter.isPending || stage.isPending || makeover.isPending || dusk.isPending;
  const totalInvestment = form.purchasePrice + form.renovationCost + form.acquisitionCost;
  const valueCreation = form.estimatedValue - totalInvestment;
  const roi = totalInvestment ? (valueCreation / totalInvestment) * 100 : 0;
  const yieldValue = totalInvestment > 0 ? ((form.monthlyRent * 12) / totalInvestment) * 100 : 0;
  const totalArea = form.units.reduce((sum, unit) => sum + unit.area, 0);
  const isActionPending = (action: PropertyAction) => (
    (action === 'declutter' && declutter.isPending)
    || (action === 'stage' && stage.isPending)
    || (action === 'makeover' && makeover.isPending)
    || (action === 'dusk' && dusk.isPending)
  );

  const refreshProjects = useCallback(async () => {
    const refreshSequence = ++projectListRefreshSequence.current;
    setProjectListLoading(true);
    try {
      const projectList = await storage.loadPropertyProjectsWithPhotoHealth();
      let claimStatus: LegacyProjectClaimStatus;
      try {
        claimStatus = await storage.getLegacyProjectClaimStatus();
      } catch {
        claimStatus = { status: 'error', projectCount: 0 };
      }
      if (refreshSequence === projectListRefreshSequence.current) {
        setProjects(projectList.projects);
        setPhotoHealthByProject(projectList.photoHealthById);
        setLegacyClaimStatus(claimStatus);
        setPhotoHealthError('');
      }
    } catch (error) {
      if (refreshSequence === projectListRefreshSequence.current) {
        setPhotoHealthError('De foto-status kon niet uit de lokale browseropslag worden gelezen. Controleer of browseropslag beschikbaar is en probeer het opnieuw.');
      }
      throw error;
    } finally {
      if (refreshSequence === projectListRefreshSequence.current) setProjectListLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    if (!projectManagerOpen) return;
    const refresh = () => {
      void refreshProjects().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const unsubscribe = storage.subscribePropertyStorageChanges(refresh);
    const unsubscribeLegacyClaim = subscribeLegacyProjectClaimChanges(refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      unsubscribe();
      unsubscribeLegacyClaim();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [projectManagerOpen, refreshProjects, storage]);
  const openProjectManager = (trigger?: HTMLElement) => {
    projectManagerReturnFocusRef.current = trigger
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setProjectTransferError('');
    setProjectTransferNotice('');
    setProjectManagerOpen(true);
    void refreshProjects().catch(() => {});
  };
  const openProjectImport = () => {
    duplicateImportReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    transferFileRef.current?.click();
  };
  const closeDuplicateImport = () => {
    setPendingDuplicateImport(null);
    setProjectTransferError('');
  };

  useEffect(() => {
    if (!pendingDuplicateImport) return;

    const dialog = duplicateImportDialogRef.current;
    const getFocusableButtons = () => Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    );
    const initialFocus = getFocusableButtons()[0] ?? dialog;
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;
      if (event.key === 'Escape') {
        if (dialog.querySelector<HTMLButtonElement>('[data-testid="button-cancel-duplicate-import"]')?.disabled) return;
        event.preventDefault();
        closeDuplicateImport();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableButtons = getFocusableButtons();
      if (focusableButtons.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusableButtons[0];
      const last = focusableButtons[focusableButtons.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if ((event.shiftKey && (document.activeElement === first || focusIsOutsideDialog))
        || (!event.shiftKey && (document.activeElement === last || focusIsOutsideDialog))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const preferredReturnTarget = duplicateImportReturnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (document.querySelector('[data-testid="dialog-duplicate-import"]')) return;
        const candidates = [
          preferredReturnTarget,
          document.querySelector<HTMLElement>('[data-testid="button-import-project"]'),
          document.querySelector<HTMLElement>('[data-testid="button-open-projects"]'),
        ];
        const returnTarget = candidates.find((candidate) => candidate?.isConnected
          && !(candidate instanceof HTMLButtonElement && candidate.disabled));
        if (returnTarget) {
          returnTarget.focus();
        }
        if (duplicateImportReturnFocusRef.current === preferredReturnTarget) {
          duplicateImportReturnFocusRef.current = null;
        }
      });
    };
  }, [pendingDuplicateImport]);
  const openSavedProject = async (id: string) => {
    setIsProjectSwitching(true);
    setUploadError('');
    try {
      const selected = await storage.loadPropertyProject(id);
      if (!selected) throw new Error('Dit project bestaat niet meer in de browseropslag. Vernieuw de projectlijst.');
      const loaded = await loadProjectPreviews(selected);
      revokeAllObjectUrls();
      externallyDeletedProjectIdRef.current = null;
      setDeletedProjectName(null);
      projectRef.current = selected;
      setProject(selected);
      setOriginalUrl(loaded.originalUrl);
      setResults(loaded.results);
      setMissingOriginalPhoto(loaded.missingSource);
      setMissingConceptActions(loaded.missingConcepts);
      setSplitRatio(selected.splitRatio);
      setActiveTab('studio');
      setTransferOpen(false);
      setProjectManagerOpen(false);
      setNotice('');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Het project kon niet uit de browseropslag worden geopend.');
    } finally {
      setIsProjectSwitching(false);
    }
  };
  const createProject = async () => {
    setIsProjectSwitching(true);
    setUploadError('');
    const created = makeProject();
    try {
      await storage.savePropertyProject(created);
      revokeAllObjectUrls();
      externallyDeletedProjectIdRef.current = null;
      setDeletedProjectName(null);
      projectRef.current = created;
      setProject(created);
      setOriginalUrl('');
      setResults({});
      setMissingOriginalPhoto(false);
      setMissingConceptActions([]);
      setSplitRatio(created.splitRatio);
      setActiveTab('studio');
      setTransferOpen(false);
      setProjectManagerOpen(false);
      setNotice('');
      await refreshProjects();
    } catch {
      setUploadError('Het nieuwe project kon niet in deze browser worden opgeslagen.');
    } finally {
      setIsProjectSwitching(false);
    }
  };
  const removeSavedProject = async (target: PropertyProject) => {
    if (!window.confirm(`Verwijder "${target.projectName || 'Transformatiescan'}" en alleen foto’s die niet bij andere projecten horen uit deze browser?`)) return;
    setIsProjectSwitching(true);
    setUploadError('');
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      await storage.deletePropertyProject(target);
      if (projectRef.current?.id === target.id) {
        revokeAllObjectUrls();
        projectRef.current = null;
        setProject(null);
        setOriginalUrl('');
        setResults({});
        setMissingOriginalPhoto(false);
        setMissingConceptActions([]);
        setSplitRatio(50);
        setTransferOpen(false);
      }
      await refreshProjects();
      setNotice('Project verwijderd uit deze browser.');
    } catch {
      setProjectTransferError('Het project en de bijbehorende foto’s konden niet worden verwijderd. Er is niets verwijderd; het project blijft in de lijst. Controleer de browseropslag en probeer opnieuw.');
    } finally {
      setIsProjectSwitching(false);
    }
  };

  const claimLegacyProjects = async () => {
    if (legacyClaimStatus.status !== 'available' || isLegacyClaiming) return;
    setIsLegacyClaiming(true);
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      const result = await storage.claimLegacyPropertyProjects();
      if (result.status === 'claimed') {
        setProjectTransferNotice(`${result.importedCount} oudere ${result.importedCount === 1 ? 'project is' : 'projecten zijn'} aan deze account gekoppeld. De originelen blijven lokaal bewaard.`);
      } else if (result.status === 'unavailable') {
        setProjectTransferNotice('Deze oudere projecten zijn al aan een andere account gekoppeld en worden hier niet getoond.');
      } else if (result.status === 'in-progress') {
        setProjectTransferNotice('Het koppelen van de oudere projecten is al bezig in een ander tabblad.');
      }
      await refreshProjects();
    } catch (error) {
      setProjectTransferError(error instanceof Error ? error.message : 'De oudere projecten konden niet veilig aan deze account worden gekoppeld.');
    } finally {
      setIsLegacyClaiming(false);
    }
  };

  const exportSavedProject = async (target: PropertyProject) => {
    setIsProjectTransferring(true);
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      const current = projectRef.current?.id === target.id ? projectRef.current : target;
      await storage.updatePropertyProject(current);
      const archive = await storage.exportPropertyProject(current);
      const file = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(current.projectName || 'vastgoedproject').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vastgoedproject'}.realestatex.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setProjectTransferNotice('Projectbestand met foto’s en concepten gedownload.');
    } catch (error) {
      setProjectTransferError(error instanceof Error ? error.message : 'Het projectbestand kon niet worden gemaakt.');
    } finally {
      setIsProjectTransferring(false);
    }
  };

  const exportSavedPortfolio = async () => {
    setIsProjectTransferring(true);
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      const current = projectRef.current;
      if (current) await storage.updatePropertyProject(current);
      const savedProjects = await storage.loadPropertyProjects();
      const archive = await storage.exportPropertyPortfolio(savedProjects);
      const file = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `realestatex-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setProjectTransferNotice(`Back-up met ${archive.projects.length} ${archive.projects.length === 1 ? 'project' : 'projecten'}, bronfoto’s en concepten gedownload.`);
    } catch (error) {
      setProjectTransferError(error instanceof Error ? error.message : 'De volledige portfolio-back-up kon niet worden gemaakt. Controleer de browseropslag en probeer opnieuw.');
    } finally {
      setIsProjectTransferring(false);
    }
  };

  const restoreImportedProject = async (archive: unknown, allowDuplicate = false) => {
    const result = allowDuplicate
      ? { status: 'imported' as const, project: await storage.importPropertyProject(archive) }
      : await storage.importPropertyProjectUnlessDuplicate(archive);
    if (result.status === 'duplicate') {
      setPendingDuplicateImport({ archive, existing: result.existing });
      setProjectTransferError('');
      return;
    }
    const restored = result.project;
    const loaded = await loadProjectPreviews(restored);
    revokeAllObjectUrls();
    externallyDeletedProjectIdRef.current = null;
    setDeletedProjectName(null);
    projectRef.current = restored;
    setProject(restored);
    setOriginalUrl(loaded.originalUrl);
    setResults(loaded.results);
    setMissingOriginalPhoto(loaded.missingSource);
    setMissingConceptActions(loaded.missingConcepts);
    setSplitRatio(restored.splitRatio);
    setActiveTab('studio');
    setTransferOpen(false);
    setProjectManagerOpen(false);
    setPendingDuplicateImport(null);
    setProjectTransferError('');
    setUploadError('');
    setNotice(`“${restored.projectName || 'Transformatiescan'}” is in deze browser hersteld, inclusief de aanwezige foto’s en concepten.`);
    await refreshProjects();
  };

  const importProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setIsProjectTransferring(true);
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      let archive: unknown;
      try {
        archive = JSON.parse(await file.text());
      } catch {
        throw new Error('Import afgewezen: dit bestand bevat geen geldige JSON-projectexport.');
      }
      await restoreImportedProject(archive);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Het projectbestand kon niet worden geïmporteerd.';
      setProjectTransferError(reason.startsWith('Import afgewezen:')
        ? `${reason} Er is niets toegevoegd; je opgeslagen projecten zijn ongewijzigd. Controleer het bestand en probeer het opnieuw.`
        : reason);
    } finally {
      setIsProjectTransferring(false);
    }
  };

  const importPortfolioFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setIsProjectTransferring(true);
    setProjectTransferError('');
    setProjectTransferNotice('');
    try {
      let portfolio: unknown;
      try {
        portfolio = JSON.parse(await file.text());
      } catch {
        throw new Error('De portfolio-back-up is niet hersteld: het bestand kan niet als geldige JSON worden gelezen. Er is niets toegevoegd.');
      }
      const imported = await storage.importPropertyPortfolio(portfolio);
      setProjectTransferNotice(`${imported.length} ${imported.length === 1 ? 'project' : 'projecten'} met foto’s en concepten hersteld als nieuwe projecten. Bestaande projecten zijn ongewijzigd.`);
      try {
        await refreshProjects();
      } catch {
        setProjectTransferError('De portfolio-back-up is wel hersteld, maar de projectlijst kon niet opnieuw worden geladen. Sluit en open deze lijst opnieuw.');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Controleer het bestand en of browseropslag beschikbaar is.';
      setProjectTransferError(/er is niets toegevoegd/i.test(reason)
        ? reason
        : `De portfolio-back-up is niet hersteld; er is niets toegevoegd. ${reason}`);
    } finally {
      setIsProjectTransferring(false);
    }
  };

  const openExistingDuplicate = async () => {
    if (!pendingDuplicateImport) return;
    const existingId = pendingDuplicateImport.existing.id;
    duplicateImportReturnFocusRef.current = document.querySelector<HTMLElement>('[data-testid="button-open-projects"]');
    setPendingDuplicateImport(null);
    await openSavedProject(existingId);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="button-open-projects"]')?.focus();
    });
  };

  const importAnotherCopy = async () => {
    if (!pendingDuplicateImport) return;
    setIsProjectTransferring(true);
    setProjectTransferError('');
    try {
      await restoreImportedProject(pendingDuplicateImport.archive, true);
    } catch (error) {
      setProjectTransferError(error instanceof Error ? error.message : 'Het projectbestand kon niet worden geïmporteerd.');
    } finally {
      setIsProjectTransferring(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (activeMutation || isUploading) {
      setUploadError('Wacht tot de huidige bewerking klaar is voordat je de foto vervangt.');
      return;
    }
    setUploadError('');
    setIsUploading(true);
    try {
      const projectAtUploadStart = projectRef.current ?? form;
      const projectSnapshot = await storage.loadPropertyProject(projectAtUploadStart.id) ?? projectAtUploadStart;
      const compressed = await compressImage(file);
      const key = `${projectSnapshot.id}-original-${crypto.randomUUID()}`;
      const image: PropertyImageRecord = { key, blob: compressed.blob, label: 'Originele foto', mimeType: compressed.blob.type, isConcept: false, disclaimer: 'Originele foto, lokaal opgeslagen in deze browser.', createdAt: new Date().toISOString() };
      const recoveringMissingSource = missingOriginalPhoto;
      const replacement = await storage.replacePropertySourceImage(
        projectSnapshot.id,
        image,
        recoveringMissingSource,
        projectSnapshot.resultKeys,
      );
      await refreshPhotoState(replacement.project.id);
      await refreshProjects().catch(() => setUploadError('De foto is opgeslagen, maar de status in de projectlijst kon niet worden bijgewerkt.'));
      const cleanupKeys = [...new Set([...photoCleanupKeys, ...replacement.cleanupKeys])];
      try {
        await storage.cleanupPendingPropertyImages(cleanupKeys);
        setPhotoCleanupKeys([]);
        setPhotoCleanupError('');
      } catch {
        const pendingKeys = await storage.loadPendingPropertyPhotoCleanup().catch(() => []);
        setPhotoCleanupKeys([...new Set([...pendingKeys, ...cleanupKeys])]);
        setPhotoCleanupError('');
      }
    } catch (error) {
      setUploadError(sourcePhotoSaveErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  const retryPhotoCleanup = async () => {
    if (isPhotoCleanupRunning || photoCleanupKeys.length === 0) return;
    setIsPhotoCleanupRunning(true);
    setPhotoCleanupError('');
    try {
      await storage.cleanupPendingPropertyImages(photoCleanupKeys);
      setPhotoCleanupKeys([]);
      setNotice('Oude fotokopieën zijn gecontroleerd. Foto’s die nog bij een opgeslagen project horen, zijn behouden.');
    } catch {
      const pendingKeys = await storage.loadPendingPropertyPhotoCleanup().catch(() => []);
      setPhotoCleanupKeys([...new Set([...pendingKeys, ...photoCleanupKeys])]);
      setPhotoCleanupError('De oude foto kon nog niet worden verwijderd. Je nieuwe foto en project zijn opgeslagen; probeer de veilige opruiming opnieuw.');
    } finally {
      setIsPhotoCleanupRunning(false);
    }
  };

  const runAction = (action: PropertyAction) => {
    if (!originalUrl || !project) {
      if (missingOriginalPhoto) setUploadError('Herstel eerst de bronfoto voordat je een ontbrekend concept opnieuw maakt.');
      return;
    }
    proBetaDialogReturnFocusRef.current = document.querySelector<HTMLElement>(
      `[data-testid="button-transform-${action}"]`,
    );
    setUploadError('');
    void (async () => {
      try {
        const sourceProject = await storage.loadPropertyProject(project.id) ?? project;
        const image = await storage.loadPropertyImage(sourceProject.originalKey);
        if (!image) {
          setUploadError('De bronfoto ontbreekt in deze browser. Upload de foto opnieuw.');
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => setUploadError('De bronfoto kon niet worden gelezen.');
        reader.onload = () => {
          const imageDataUrl = String(reader.result);
          const onSuccess = async (response: { imageDataUrl: string; mimeType: string; isConcept: true; disclaimer: string }) => {
            try {
              const key = `${project.id}-${action}-${crypto.randomUUID()}`;
              const blob = await dataUrlToBlob(response.imageDataUrl);
              const imageRecord: PropertyImageRecord = { key, blob, label: actions.find((item) => item.id === action)?.label ?? action, mimeType: response.mimeType, isConcept: response.isConcept, disclaimer: response.disclaimer, createdAt: new Date().toISOString() };
              const next = await storage.savePropertyConceptImage(project.id, action, imageRecord, splitRatio);
              await refreshPhotoState(next.id);
              await refreshProjects().catch(() => setUploadError('Het concept is opgeslagen, maar de status in de projectlijst kon niet worden bijgewerkt.'));
              setNotice(`${imageRecord.label} concept is lokaal opgeslagen.`);
              setTimeout(() => setNotice(''), 3500);
            } catch {
              setUploadError('Het concept is gegenereerd, maar kon niet in deze browser worden opgeslagen. Je opgeslagen project en foto’s zijn ongewijzigd gebleven en het nieuwe concept is niet bewaard. Controleer de browseropslag en probeer opnieuw.');
            }
          };
          const onError = (error: unknown) => {
            if (isHttpStatus(error, 402)) {
              setProBetaDialogOpen(true);
              return;
            }
            setUploadError('De AI-transformatie is niet gelukt. Probeer het opnieuw.');
          };
          if (action === 'declutter') declutter.mutate({ data: { imageDataUrl } }, { onSuccess, onError });
          if (action === 'stage') stage.mutate({ data: { imageDataUrl } }, { onSuccess, onError });
          if (action === 'makeover') makeover.mutate({ data: { imageDataUrl, style: form.selectedStyle } }, { onSuccess, onError });
          if (action === 'dusk') dusk.mutate({ data: { imageDataUrl } }, { onSuccess, onError });
        };
        reader.readAsDataURL(image.blob);
      } catch {
        setUploadError('De bronfoto kon niet uit de lokale browseropslag worden geladen.');
      }
    })();
  };

  const patchUnit = (id: string, patch: Partial<PropertyUnit>) => {
    const units = form.units.map((unit) => unit.id === id ? { ...unit, ...patch } : unit);
    updateProject({ units });
    void save({ ...form, units, updatedAt: new Date().toISOString() });
  };
  const patchCosts = (key: ProjectProjectRoi, value: number) => {
    const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
    const next = { ...form, [key]: amount, roiFields: { ...form.roiFields, [key]: amount }, updatedAt: new Date().toISOString() };
    updateProject(next);
    void save(next);
  };
  const printDossier = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      setNotice('Sta pop-ups toe om het dossier af te drukken of als PDF op te slaan.');
      return;
    }
    printWindow.opener = null;
    void (async () => {
      try {
        const conceptImage = result ? await storage.loadPropertyImage(result.key).then((image) => image ? blobToDataUrl(image.blob) : '') : '';
        const html = safeDossierHtml(form, result, roi, yieldValue, totalInvestment, valueCreation, conceptImage);
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
        await Promise.all(Array.from(printWindow.document.images).map((image) => image.decode().catch(() => undefined)));
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      } catch {
        printWindow.close();
        setNotice('Het dossier kon niet worden voorbereid om af te drukken.');
      }
    })();
  };
  const downloadHtml = async () => {
    let downloadUrl = '';
    try {
      const conceptImage = result ? await storage.loadPropertyImage(result.key).then((image) => image ? blobToDataUrl(image.blob) : '') : '';
      const html = safeDossierHtml(form, result, roi, yieldValue, totalInvestment, valueCreation, conceptImage);
      const blob = new Blob([html], { type: 'text/html' });
      const link = document.createElement('a');
      downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = `${(form.projectName || 'property-dossier').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'property-dossier'}.html`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 10_000);
    } catch {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setNotice('Het dossier kon niet worden geëxporteerd vanuit de lokale opslag.');
    }
  };

  if (loading) return <AppShell><div className="space-y-4"><div className="skeleton h-10 w-1/3 rounded-xl" /><div className="skeleton h-56 rounded-2xl" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-44 rounded-2xl" /><div className="skeleton h-44 rounded-2xl" /><div className="skeleton h-44 rounded-2xl" /></div></div></AppShell>;

  if (!project) return <AppShell><div className="property-noise mx-auto max-w-3xl py-12">
    <input ref={transferFileRef} type="file" accept=".json,application/json" onChange={importProjectFile} className="hidden" data-testid="input-import-project" />
   <input ref={portfolioTransferFileRef} type="file" accept=".json,application/json" onChange={importPortfolioFile} className="hidden" data-testid="input-import-portfolio" />
    <Card className="p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f3e7da] text-[#a95f39]"><Layers3 size={23} /></div>
      <p className="mono mt-5 text-[9px] uppercase tracking-[.18em] text-[#a95f39]">Local-first studio</p>
      <h1 className="display mt-2 text-3xl font-bold tracking-[-.06em]">Geen actief project</h1>
      {deletedProjectName
        ? <div className="mx-auto mt-4 max-w-lg rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-left text-xs leading-5 text-[#9e4336]" role="alert" data-testid="status-project-deleted-elsewhere">
          <p className="font-bold">“{deletedProjectName}” is in een ander tabblad verwijderd.</p>
          <p className="mt-1">Dit project is niet automatisch hersteld. Open een ander opgeslagen project of maak een nieuw project aan.</p>
        </div>
        : <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Maak een nieuw vastgoedproject of open een eerder opgeslagen project. Projectgegevens en foto’s blijven in deze browser.</p>}
      {uploadError && <p className="mt-5 rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-xs text-[#9e4336]" role="alert">{uploadError}</p>}
      {photoCleanupKeys.length > 0 && <div className="mx-auto mt-4 flex max-w-lg flex-col gap-3 rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-left text-xs leading-5 text-[#9e4336]" role="alert" data-testid="status-photo-cleanup-error">
        <p>{photoCleanupError || 'Een of meer oude foto’s konden niet worden verwijderd. Je nieuwe foto en project zijn opgeslagen. Probeer de veilige opruiming opnieuw.'}</p>
        <button type="button" onClick={() => void retryPhotoCleanup()} disabled={isPhotoCleanupRunning} className="self-start rounded-lg border border-[#e7b4a8] px-3 py-2 text-[10px] font-bold hover:bg-[#fbe9e5] disabled:cursor-wait disabled:opacity-60" data-testid="button-retry-photo-cleanup">{isPhotoCleanupRunning ? 'Oude foto’s controleren…' : 'Oude foto’s opnieuw opruimen'}</button>
      </div>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={() => void createProject()} disabled={isProjectSwitching} className="inline-flex items-center gap-2 rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec] disabled:opacity-50" data-testid="button-create-project"><Plus size={15} /> Nieuw project</button>
        <button onClick={(event) => openProjectManager(event.currentTarget)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-open-projects"><Layers3 size={15} /> Opgeslagen projecten ({projects.length})</button>
      </div>
    </Card>
    {projectManagerOpen && <ProjectManager accountId={accountId} returnFocusTarget={projectManagerReturnFocusRef.current} legacyClaimStatus={legacyClaimStatus} legacyClaimBusy={isLegacyClaiming} onClaimLegacy={() => void claimLegacyProjects()} projects={projects} photoHealthByProject={photoHealthByProject} photoHealthError={photoHealthError} onRetryPhotoHealth={() => void refreshProjects().catch(() => {})} loading={projectListLoading} busy={isProjectSwitching || isProjectTransferring || isLegacyClaiming} activeProjectId={null} transferError={projectTransferError} transferNotice={projectTransferNotice} onClose={() => setProjectManagerOpen(false)} onCreate={() => void createProject()} onOpen={(id) => void openSavedProject(id)} onDelete={(target) => void removeSavedProject(target)} onExport={(target) => void exportSavedProject(target)} onExportPortfolio={() => void exportSavedPortfolio()} onImport={openProjectImport} onImportPortfolio={() => portfolioTransferFileRef.current?.click()} />}
  </div></AppShell>;

  return <AppShell><div className="property-noise animate-rise">
    <header className="mb-7 flex flex-col justify-between gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end">
      <div><div className="mb-3 flex items-center gap-2"><span className="mono rounded bg-[#e4eee9] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#287b6a]">Local-first studio</span><span className="text-[10px] text-muted-foreground">Geen projecten verlaten je browser</span></div><h1 className="display max-w-3xl text-4xl font-bold leading-[.98] tracking-[-0.07em] sm:text-6xl">Van foto naar een <span className="text-[#a95f39]">bespreekbaar plan.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Maak transformatiekeuzes zichtbaar voor je team, zonder te doen alsof een AI-beeld de werkelijkheid voorspelt.</p></div>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><button onClick={(event) => openProjectManager(event.currentTarget)} disabled={isUploading || activeMutation || isSaving || isProjectSwitching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold transition-colors hover:border-[#b87145] hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-open-projects"><Layers3 size={16} /> Projecten ({projects.length})</button><button onClick={() => fileRef.current?.click()} disabled={isUploading || activeMutation || isProjectSwitching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold transition-colors hover:border-[#b87145] hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-upload-property"><ImagePlus size={16} /> {isUploading ? 'Foto voorbereiden…' : 'Foto vervangen'}</button><button onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec] shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-open-dossier"><FileText size={16} /> Dossier</button></div>
    </header>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={onFile} className="hidden" data-testid="input-property-image" />
      <input ref={transferFileRef} type="file" accept=".json,application/json" onChange={importProjectFile} className="hidden" data-testid="input-import-project" />
      <input ref={portfolioTransferFileRef} type="file" accept=".json,application/json" onChange={importPortfolioFile} className="hidden" data-testid="input-import-portfolio" />
      {(missingOriginalPhoto || missingConceptActions.length > 0) && <div className="mb-5 flex flex-col gap-2 rounded-xl border border-[#e7c98a] bg-[#fff8e7] px-4 py-3 text-xs text-[#76551c]" role="alert" data-testid="status-missing-project-images">
       {missingOriginalPhoto && <div className="flex flex-wrap items-center justify-between gap-2"><p><strong>De bronfoto ontbreekt.</strong> Je project, financiële aannames, units en checklist zijn behouden.</p><button onClick={() => fileRef.current?.click()} disabled={isUploading || activeMutation} className="shrink-0 rounded-lg bg-[#8d6320] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50" data-testid="button-restore-source-photo">{isUploading ? 'Foto voorbereiden…' : 'Bronfoto toevoegen'}</button></div>}
        {missingConceptActions.length > 0 && <div>
          <p><strong>Conceptfoto ontbreekt:</strong> {missingConceptActions.map((action) => actions.find((item) => item.id === action)?.label ?? action).join(', ')}.</p>
          <p className="mt-1">Het gekozen scenario blijft {actions.find((item) => item.id === project.selectedResult)?.label ?? 'ongewijzigd'} zolang een vervangend concept niet succesvol is opgeslagen.</p>
          {missingOriginalPhoto
            ? <p className="mt-2 font-semibold" data-testid="status-restore-source-before-concept">Herstel eerst de bronfoto met ‘Bronfoto toevoegen’; daarna kun je elk ontbrekend concept hier opnieuw maken.</p>
            : <div className="mt-2 flex flex-wrap gap-2">{missingConceptActions.map((action) => {
              const label = actions.find((item) => item.id === action)?.label ?? action;
              return <button key={action} onClick={() => { setActiveTab('studio'); setUploadError(''); runAction(action); }} disabled={isUploading || activeMutation || isProjectSwitching} className="rounded-lg border border-[#b78643] bg-white/70 px-3 py-2 text-[10px] font-bold text-[#76551c] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50" data-testid={`button-repair-concept-${action}`} aria-label={`${label} opnieuw maken`}>{isActionPending(action) ? `${label} maken…` : `${label} opnieuw maken`}</button>;
            })}</div>}
        </div>}
     </div>}
     {uploadError && <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-xs text-[#9e4336]" role="alert" data-testid="status-upload-error"><Info size={16} className="mt-0.5 shrink-0" /><span>{uploadError}</span></div>}
     {photoCleanupKeys.length > 0 && <div className="mb-5 flex flex-col items-start gap-3 rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-xs leading-5 text-[#9e4336] sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="status-photo-cleanup-error">
       <p>{photoCleanupError || 'Een of meer oude foto’s konden niet worden verwijderd. Je nieuwe foto en project zijn opgeslagen. Probeer de veilige opruiming opnieuw.'}</p>
       <button type="button" onClick={() => void retryPhotoCleanup()} disabled={isPhotoCleanupRunning || isUploading} className="shrink-0 rounded-lg border border-[#e7b4a8] px-3 py-2 text-[10px] font-bold hover:bg-[#fbe9e5] disabled:cursor-wait disabled:opacity-60" data-testid="button-retry-photo-cleanup">{isPhotoCleanupRunning ? 'Oude foto’s controleren…' : 'Oude foto’s opnieuw opruimen'}</button>
     </div>}
    {notice && <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#b7ddd0] bg-[#eef8f4] px-4 py-3 text-xs font-semibold text-[#287b6a]" role="status" data-testid="status-transform-success"><Check size={15} />{notice}</div>}
    {pendingDuplicateImport && <div className="fixed inset-0 z-[100] grid place-items-center bg-[#172033]/50 p-4" data-testid="dialog-duplicate-import">
      <section ref={duplicateImportDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="duplicate-import-title" aria-describedby="duplicate-import-description" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <p className="mono text-[9px] uppercase tracking-[.16em] text-[#a95f39]">Projectbestand importeren</p>
        <h2 id="duplicate-import-title" className="display mt-2 text-2xl font-bold tracking-[-.05em]">Dit project staat al in deze browser</h2>
        <p id="duplicate-import-description" className="mt-3 text-sm leading-6 text-muted-foreground">“{pendingDuplicateImport.existing.projectName || 'Transformatiescan'}” komt overeen met een opgeslagen project. Open het bestaande project, of importeer bewust nog een kopie.</p>
        {projectTransferError && <p role="alert" className="mt-4 rounded-lg bg-[#fff1ee] px-3 py-2 text-xs text-[#9e4336]" data-testid="status-duplicate-import-error">{projectTransferError}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={closeDuplicateImport} disabled={isProjectTransferring} className="rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary disabled:opacity-50" data-testid="button-cancel-duplicate-import">Annuleren</button>
          <button onClick={() => void importAnotherCopy()} disabled={isProjectTransferring} className="rounded-xl border border-[#a95f39]/50 px-4 py-3 text-xs font-bold text-[#8c4d2d] hover:bg-[#fff8ef] disabled:opacity-50" data-testid="button-import-another-copy">{isProjectTransferring ? 'Importeren…' : 'Toch een extra kopie importeren'}</button>
          <button onClick={() => void openExistingDuplicate()} disabled={isProjectTransferring} className="rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec] hover:bg-[#30425f] disabled:opacity-50" data-testid="button-open-existing-duplicate">Bestaand project openen</button>
        </div>
      </section>
    </div>}
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1" aria-label="Transformer onderdelen">{[{ id: 'studio', label: 'Studio', icon: WandSparkles }, { id: 'split', label: 'Split & flip', icon: Split }, { id: 'roi', label: 'ROI & yield', icon: CircleHelp }].map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id as typeof activeTab)} className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${activeTab === id ? 'bg-[#24324b] text-[#f7f3ec]' : 'text-muted-foreground hover:bg-secondary'}`} data-testid={`button-tab-${id}`}><Icon size={15} />{label}</button>)}</nav>
    {activeTab === 'studio' && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,.75fr)]">
      <div className="space-y-6"><Card><CardHeader eyebrow="01 / beeld" title={result ? `${result.label} naast het origineel` : 'Start met één listingfoto'} detail="Selecteer een actie rechts. De vergelijking blijft lokaal beschikbaar zodat je keuzes kunt bespreken." action={result && <ConceptBadge />} /><div className="p-5 sm:p-6">{originalUrl ? <><BeforeAfter originalUrl={originalUrl} result={result} splitRatio={splitRatio} setSplitRatio={(value) => { const next = { ...form, splitRatio: value, updatedAt: new Date().toISOString() }; setSplitRatio(value); updateProject(next); void save(next); }} flipped={form.flipHorizontal} /><div className="mt-3 flex justify-end"><button onClick={() => { const next = { ...form, flipHorizontal: !form.flipHorizontal, updatedAt: new Date().toISOString() }; updateProject(next); void save(next); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px] font-bold text-muted-foreground hover:bg-secondary" data-testid="button-flip-preview"><FlipHorizontal2 size={14} /> {form.flipHorizontal ? 'Spiegeling uit' : 'Spiegel voorbeeld'}</button></div></> : <button onClick={() => fileRef.current?.click()} disabled={isUploading || activeMutation} className="property-grid flex min-h-[330px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#cfc8be] bg-[#f3f1ed] p-8 text-center transition-colors hover:border-[#b87145] hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-empty-upload"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-card text-[#a95f39] shadow-sm"><ImagePlus size={22} /></div><p className="mt-4 text-sm font-bold">{isUploading ? 'Foto wordt lokaal voorbereid…' : 'Upload de huidige woningfoto'}</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">JPEG of PNG. We verkleinen de foto lokaal tot minder dan 620 KB voor de conceptactie.</p><span className="mt-5 rounded-lg bg-[#a95f39] px-3 py-2 text-[10px] font-bold text-[#fff8ef]">{isUploading ? 'Bezig…' : 'Foto kiezen'}</span></button>}</div></Card>
        <Card><CardHeader eyebrow="02 / stijl" title="Kies de richting" detail="De stijl stuurt alleen de makeover-actie. Het is geen bouwadvies of toezegging." /><div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">{styles.map((style) => <button key={style.id} onClick={() => { updateForm('selectedStyle', style.id); void save({ ...form, selectedStyle: style.id, updatedAt: new Date().toISOString() }); }} className={`rounded-xl border p-4 text-left transition-colors ${form.selectedStyle === style.id ? 'border-[#a95f39] bg-[#fff8ef] ring-2 ring-[#a95f39]/10' : 'border-border bg-background hover:border-[#c79b7d]'}`} data-testid={`button-style-${style.id}`}><div className={`mb-6 h-2 w-14 rounded-full ${style.id === 'japandi' ? 'bg-[#b5a185]' : style.id === 'modern' ? 'bg-[#24324b]' : 'bg-[#7d756c]'}`} /><p className="text-xs font-bold">{style.name}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{style.note}</p></button>)}</div></Card>
      </div>
      <div className="space-y-6"><Card><CardHeader eyebrow="03 / acties" title="Maak een concept" detail="Elke actie gebruikt dezelfde verkleinde bronfoto. Resultaten worden alleen lokaal opgeslagen." /><div className="space-y-2.5 p-5 sm:p-6">{actions.map((action) => <ActionButton key={action.id} action={action} disabled={!originalUrl || isUploading || activeMutation} pending={(action.id === 'declutter' && declutter.isPending) || (action.id === 'stage' && stage.isPending) || (action.id === 'makeover' && makeover.isPending) || (action.id === 'dusk' && dusk.isPending)} onClick={() => runAction(action.id)} />)}{[declutter, stage, makeover, dusk].some((mutation) => mutation.isError && !isHttpStatus(mutation.error, 402)) && <p className="rounded-lg bg-[#fff1ee] px-3 py-2 text-[10px] font-semibold leading-4 text-[#9e4336]" role="alert" data-testid="status-transform-error">De conceptactie kon niet worden voltooid. Controleer je verbinding en probeer opnieuw. Er is niets op de server opgeslagen.</p>}</div></Card>
        <Card className="overflow-hidden border-[#d7e6e0]"><div className="bg-[#eef8f4] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#d4ece4] text-[#287b6a]"><Info size={17} /></div><div><p className="text-xs font-bold text-[#287b6a]">Eerlijk over AI-concepten</p><p className="mt-1.5 text-xs leading-5 text-[#47736b]">Deze beelden zijn richtinggevende visualisaties. Ze tonen geen feitelijke materialen, maatvoering, kosten, vergunningen of gegarandeerde marktwaarde.</p></div></div></div><div className="grid grid-cols-2 divide-x divide-border border-t border-border px-5 py-4 sm:px-6"><div><p className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">Resultaten lokaal</p><p className="mt-1 text-sm font-bold">{Object.keys(results).length} / 4</p></div><div className="pl-5"><p className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">Actieve stijl</p><p className="mt-1 text-sm font-bold capitalize">{form.selectedStyle}</p></div></div></Card>
        <Card><CardHeader eyebrow="04 / project" title="Context voor het dossier" action={<Pencil size={15} className="text-muted-foreground" />} /><div className="space-y-4 p-5 sm:p-6"><Field label="Projectnaam" value={form.projectName} onChange={(value) => updateForm('projectName', value)} placeholder="Nieuwe transformatiescan" /><div className="grid gap-4 sm:grid-cols-2"><Field label="Adres" value={form.address} onChange={(value) => updateForm('address', value)} placeholder="Wibautstraat 12" /><Field label="Plaats" value={form.municipality} onChange={(value) => updateForm('municipality', value)} placeholder="Amsterdam" /></div><label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Notitie</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} placeholder="Wat wil je met de client bespreken?" className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-[#b87145] focus:ring-4 focus:ring-[#b87145]/10" data-testid="input-project-notes" /></label><button onClick={() => void save()} disabled={isSaving} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a95f39] disabled:opacity-50" data-testid="button-save-project">{isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />} {isSaving ? 'Opslaan…' : 'Wijzigingen lokaal bewaren'}</button></div></Card>
      </div>
    </div>}
    {activeTab === 'split' && <SplitVisualizer project={form} updateProject={updateProject} patchUnit={patchUnit} totalArea={totalArea} save={save} />}
    {activeTab === 'roi' && <div className="space-y-6"><RoiPanel project={form} patchCosts={patchCosts} roi={roi} yieldValue={yieldValue} totalInvestment={totalInvestment} valueCreation={valueCreation} /><EnergyXScenarioHistory accountId={accountId} projectId={project.id} projectName={form.projectName} /></div>}
    <div className="mt-6 flex flex-col justify-between gap-3 border-t border-border/70 pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center"><p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#287b6a]" /> Browser-only workspace · IndexedDB · {activeMutation ? 'conceptactie loopt…' : 'klaar voor de volgende keuze'}</p><button onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-2 font-bold text-[#a95f39] hover:text-[#24324b]" data-testid="button-footer-dossier">Open client transfer dossier <ArrowRight size={13} /></button></div>
    {transferOpen && <TransferDossier project={form} result={result} roi={roi} yieldValue={yieldValue} totalInvestment={totalInvestment} valueCreation={valueCreation} onClose={() => setTransferOpen(false)} onPrint={printDossier} onDownload={downloadHtml} onChecklistChange={(checklist) => { const next = { ...form, checklist, updatedAt: new Date().toISOString() }; updateProject(next); void save(next); }} />}
    {projectManagerOpen && <ProjectManager accountId={accountId} returnFocusTarget={projectManagerReturnFocusRef.current} legacyClaimStatus={legacyClaimStatus} legacyClaimBusy={isLegacyClaiming} onClaimLegacy={() => void claimLegacyProjects()} projects={projects} photoHealthByProject={photoHealthByProject} photoHealthError={photoHealthError} onRetryPhotoHealth={() => void refreshProjects().catch(() => {})} loading={projectListLoading} busy={isProjectSwitching || isProjectTransferring || isLegacyClaiming} activeProjectId={project.id} transferError={projectTransferError} transferNotice={projectTransferNotice} onClose={() => setProjectManagerOpen(false)} onCreate={() => void createProject()} onOpen={(id) => void openSavedProject(id)} onDelete={(target) => void removeSavedProject(target)} onExport={(target) => void exportSavedProject(target)} onExportPortfolio={() => void exportSavedPortfolio()} onImport={openProjectImport} onImportPortfolio={() => portfolioTransferFileRef.current?.click()} />}
  </div>{proBetaDialogOpen && <ProBetaWaitlistDialog
    initialEmail={userEmail}
    returnFocusTarget={proBetaDialogReturnFocusRef.current}
    onClose={() => {
      setProBetaDialogOpen(false);
      proBetaDialogReturnFocusRef.current = null;
    }}
  />}</AppShell>;
}

function formatProjectUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Bijwerktijd onbekend' : `Bijgewerkt ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

function projectPhotoHealthLabel(health: PropertyProjectPhotoHealth): { label: string; missing: boolean; notAdded: boolean } {
  const missingLabels = health.missingConcepts.map((action) => actions.find((item) => item.id === action)?.label ?? action);
  const missing = health.sourcePhoto === 'missing' || missingLabels.length > 0;
  const details = [
    health.sourcePhoto === 'missing' ? 'Bronfoto ontbreekt' : health.sourcePhoto === 'not-added' ? 'Bronfoto niet toegevoegd' : '',
    missingLabels.length ? `Conceptfoto${missingLabels.length > 1 ? '’s' : ''} ontbreken: ${missingLabels.join(', ')}` : '',
  ].filter(Boolean);
  return {
    label: details.join(' · ') || 'Geen ontbrekende foto’s',
    missing,
    notAdded: health.sourcePhoto === 'not-added' && !missing,
  };
}

export function ProjectManager({ accountId, returnFocusTarget, legacyClaimStatus, legacyClaimBusy, onClaimLegacy, projects, photoHealthByProject, photoHealthError, onRetryPhotoHealth, loading, busy, activeProjectId, transferError, transferNotice, onClose, onCreate, onOpen, onDelete, onExport, onExportPortfolio, onImport, onImportPortfolio }: {
  accountId: string;
  returnFocusTarget: HTMLElement | null;
  legacyClaimStatus: LegacyProjectClaimStatus;
  legacyClaimBusy: boolean;
  onClaimLegacy: () => void;
  projects: PropertyProject[];
  photoHealthByProject: Record<string, PropertyProjectPhotoHealth>;
  photoHealthError: string;
  onRetryPhotoHealth: () => void;
  loading: boolean;
  busy: boolean;
  activeProjectId: string | null;
  transferError: string;
  transferNotice: string;
  onClose: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (project: PropertyProject) => void;
  onExport: (project: PropertyProject) => void;
  onExportPortfolio: () => void;
  onImport: () => void;
  onImportPortfolio: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusAppliedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusTargetRef = useRef(returnFocusTarget);
  returnFocusTargetRef.current = returnFocusTarget;
  const [searchQuery, setSearchQuery] = useState('');
  const [storedSortPreference, setStoredSortPreference] = useState(() => ({
    accountId,
    preference: readPropertyProjectSortOrderPreference(accountId),
  }));
  const sortPreference = storedSortPreference.accountId === accountId
    ? storedSortPreference.preference
    : readPropertyProjectSortOrderPreference(accountId);
  const sortOrder = sortPreference.order;
  const updateSortOrder = (order: PropertyProjectSortOrder) => {
    const storageAvailable = savePropertyProjectSortOrderPreference(order, accountId);
    setStoredSortPreference({ accountId, preference: { order, storageAvailable } });
  };
  useEffect(() => {
    const refreshSortPreference = () => {
      setStoredSortPreference({
        accountId,
        preference: readPropertyProjectSortOrderPreference(accountId),
      });
    };
    refreshSortPreference();
    return subscribePropertyProjectSortOrderPreferenceChanges(refreshSortPreference, accountId);
  }, [accountId]);
  useEffect(() => {
    if (initialFocusAppliedRef.current) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (loading) {
      dialog.focus();
      return;
    }
    const initialFocus = dialog.querySelector<HTMLElement>('[data-testid="input-search-projects"]')
      ?? dialog.querySelector<HTMLElement>('button:not(:disabled)')
      ?? dialog;
    initialFocus.focus();
    initialFocusAppliedRef.current = true;
  }, [loading]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector = [
      'a[href]',
      'button:not(:disabled)',
      'input:not(:disabled):not([type="hidden"])',
      'select:not(:disabled)',
      'textarea:not(:disabled)',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const getFocusableElements = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => element.tabIndex >= 0
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0);
    const hasHigherPriorityDialog = () => Boolean(
      document.querySelector('[data-testid="dialog-duplicate-import"]'),
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasHigherPriorityDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if ((event.shiftKey && (document.activeElement === first || focusIsOutsideDialog))
        || (!event.shiftKey && (document.activeElement === last || focusIsOutsideDialog))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.requestAnimationFrame(() => {
        if (hasHigherPriorityDialog()) return;
        const candidates = [
          returnFocusTargetRef.current,
          ...Array.from(document.querySelectorAll<HTMLElement>('[data-testid="button-open-projects"]')),
        ];
        const returnTarget = candidates.find((candidate) => candidate?.isConnected
          && candidate.tabIndex >= 0
          && !(candidate instanceof HTMLButtonElement && candidate.disabled));
        returnTarget?.focus();
      });
    };
  }, []);
  const queryTerms = searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('nl-NL').trim().split(/\s+/).filter(Boolean);
  const matchingProjects = sortPropertyProjects(projects.filter((item) => {
    const searchableText = [item.projectName || 'Transformatiescan', item.address, item.municipality]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('nl-NL');
    return queryTerms.every((term) => searchableText.includes(term));
  }), sortOrder);

  return <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-[#1c2739]/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="property-project-list-title" data-testid="dialog-project-manager">
    <div className="mx-auto my-6 max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
        <div><p className="mono text-[9px] uppercase tracking-[.18em] text-[#a95f39]">Browser-only opslag</p><h2 id="property-project-list-title" className="display mt-1 text-2xl font-bold tracking-[-.05em]">Vastgoedprojecten</h2><p className="mt-1 text-xs text-muted-foreground">Projectdetails en foto’s worden alleen in deze browser bewaard.</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Sluit projectenlijst" data-testid="button-close-projects"><X size={18} /></button>
      </div>
      <div className="space-y-3 p-5 sm:p-7">
        <button onClick={onCreate} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#24324b] px-4 py-3 text-xs font-bold text-[#f7f3ec] transition-colors hover:bg-[#34435b] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-create-project"><Plus size={15} /> Nieuw vastgoedproject</button>
        {legacyClaimStatus.status === 'available' && <section className="rounded-xl border border-[#d8bea0] bg-[#fff8ef] px-4 py-4" aria-labelledby="legacy-project-claim-title" data-testid="legacy-project-claim">
          <h3 id="legacy-project-claim-title" className="text-xs font-bold">Oudere projecten in deze browser</h3>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{legacyClaimStatus.projectCount} {legacyClaimStatus.projectCount === 1 ? 'project is' : 'projecten zijn'} nog niet aan een account gekoppeld. Ze zijn niet zichtbaar in de lijst. Koppel ze alleen als dit jouw projectgegevens zijn; daarna zijn ze alleen beschikbaar in deze account.</p>
          <button onClick={onClaimLegacy} disabled={busy || legacyClaimBusy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#a95f39]/50 bg-card px-3 py-2.5 text-[10px] font-bold text-[#8c4d2d] hover:border-[#a95f39] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-claim-legacy-projects">
            {legacyClaimBusy ? <LoaderCircle size={13} className="animate-spin" /> : <Layers3 size={13} />}
            {legacyClaimBusy ? 'Oudere projecten koppelen…' : 'Oudere projecten aan deze account koppelen'}
          </button>
        </section>}
        {legacyClaimStatus.status === 'in-progress' && <p className="rounded-xl border border-border bg-secondary px-4 py-3 text-[10px] leading-4 text-muted-foreground" role="status" data-testid="status-legacy-project-claim">Het koppelen van oudere browserprojecten is al bezig in een ander tabblad.</p>}
        {legacyClaimStatus.status === 'error' && <p className="rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-[10px] leading-4 text-[#9e4336]" role="alert" data-testid="status-legacy-project-claim-error">Oudere browserprojecten konden niet veilig worden gecontroleerd. Sluit oudere RealEstateX-tabbladen en open deze lijst opnieuw; er is niets gekoppeld.</p>}
        <button onClick={onImport} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#a95f39]/40 bg-[#fff8ef] px-4 py-3 text-xs font-bold text-[#8c4d2d] transition-colors hover:border-[#a95f39] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-import-project"><Upload size={15} /> Projectbestand importeren</button>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={onExportPortfolio} disabled={busy || projects.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-export-portfolio"><Download size={15} /> Portfolio-back-up downloaden</button>
          <button onClick={onImportPortfolio} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-import-portfolio"><Upload size={15} /> Portfolio-back-up herstellen</button>
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">De portfolio-back-up bevat alle opgeslagen projectgegevens, bronfoto’s en concepten in één JSON-bestand. Herstellen voegt de projecten als nieuwe kopieën toe; bij een ongeldig onderdeel wordt niets toegevoegd. Alles blijft in deze browser.</p>
        {transferError && <p className="rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 text-xs text-[#9e4336]" role="alert" data-testid="status-project-transfer-error">{transferError}</p>}
        {transferNotice && <p className="rounded-xl border border-[#b7ddd0] bg-[#eef8f4] px-4 py-3 text-xs text-[#287b6a]" role="status" data-testid="status-project-transfer-notice">{transferNotice}</p>}
        {photoHealthError && <div className="flex flex-col gap-3 rounded-xl border border-[#e7b4a8] bg-[#fff1ee] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="status-project-photo-health-error">
          <p className="text-xs leading-5 text-[#9e4336]">{photoHealthError}</p>
          <button type="button" onClick={onRetryPhotoHealth} disabled={loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#e7b4a8] px-3 py-2 text-[10px] font-bold text-[#9e4336] hover:bg-[#fbe9e5] disabled:cursor-wait disabled:opacity-60" data-testid="button-retry-project-photo-health">
            {loading ? <LoaderCircle size={13} className="animate-spin" /> : null}
            {loading ? 'Opnieuw controleren…' : 'Foto-status opnieuw controleren'}
          </button>
        </div>}
        {!loading && (projects.length > 0 || queryTerms.length > 0) && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Zoek opgeslagen projecten</span><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Naam, adres of gemeente" aria-label="Zoek op projectnaam, adres of gemeente" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition-shadow placeholder:text-muted-foreground/50 focus:border-[#b87145] focus:ring-4 focus:ring-[#b87145]/10" data-testid="input-search-projects" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary" aria-label="Wis zoekopdracht" data-testid="button-clear-project-search"><X size={14} /></button>}</div></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Volgorde</span><select value={sortOrder} onChange={(event) => updateSortOrder(event.target.value as PropertyProjectSortOrder)} aria-label="Sorteer opgeslagen projecten" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-shadow focus:border-[#b87145] focus:ring-4 focus:ring-[#b87145]/10" data-testid="select-project-sort-order"><option value="recent">Meest recent bijgewerkt</option><option value="name">Projectnaam A–Z</option><option value="municipality">Gemeente A–Z</option></select></label>
        </div>}
        {!sortPreference.storageAvailable && <p className="rounded-xl border border-[#e7c98b] bg-[#fff8e8] px-4 py-3 text-xs text-[#76551c]" role="status" data-testid="status-project-sort-not-saved">Browseropslag voor je sorteerkeuze is geblokkeerd. De volgorde werkt nu wel, maar wordt niet bewaard na vernieuwen.</p>}
        {loading ? <p className="py-8 text-center text-xs text-muted-foreground" role="status">Projecten laden…</p> : projects.length === 0 && queryTerms.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-9 text-center"><p className="text-sm font-bold">Nog geen opgeslagen projecten</p><p className="mt-1 text-xs text-muted-foreground">Maak een project aan om woningfoto’s en scenario’s lokaal te bewaren.</p></div> : matchingProjects.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-9 text-center" role="status" data-testid="empty-project-search"><p className="text-sm font-bold">Geen opgeslagen projecten gevonden</p><p className="mt-1 text-xs text-muted-foreground">Geen projectnaam, adres of gemeente komt overeen met “{searchQuery.trim()}”. Pas je zoekopdracht aan of wis deze om alle projecten te zien.</p></div> : <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
           {matchingProjects.map((item) => {
             const health = photoHealthByProject[item.id];
             const photoLabel = health ? projectPhotoHealthLabel(health) : null;
             return <li key={item.id} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${item.id === activeProjectId ? 'border-[#a95f39]/50 bg-[#fff8ef]' : 'border-border bg-background'}`} data-testid={`project-row-${item.id}`}>
             <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{item.projectName || 'Transformatiescan'}</p>{item.id === activeProjectId && <span className="rounded bg-[#e4eee9] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[.1em] text-[#287b6a]">Actief</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{item.address || 'Adres nog toevoegen'}{item.municipality ? ` · ${item.municipality}` : ''}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatProjectUpdatedAt(item.updatedAt)}</p><p className={`mt-1 text-[10px] font-semibold ${photoLabel?.missing ? 'text-[#9e4336]' : photoLabel?.notAdded ? 'text-[#76551c]' : 'text-[#287b6a]'}`} role="status" data-testid={`status-project-photo-health-${item.id}`}>{photoLabel?.label ?? 'Foto status nog niet beschikbaar'}</p></div>
             <div className="flex shrink-0 flex-wrap gap-2"><button onClick={() => onOpen(item.id)} disabled={busy || item.id === activeProjectId} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45" data-testid={`button-open-project-${item.id}`}>{item.id === activeProjectId ? 'Geopend' : 'Openen'}</button><button onClick={() => onExport(item)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45" data-testid={`button-export-project-${item.id}`}><Download size={13} /> Exporteren</button><button onClick={() => onDelete(item)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7b4a8] px-3 py-2 text-[10px] font-bold text-[#9e4336] hover:bg-[#fff1ee] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`Verwijder ${item.projectName || 'Transformatiescan'}`} data-testid={`button-delete-project-${item.id}`}><Trash2 size={13} /> Verwijderen</button></div>
           </li>;
           })}
        </ul>}
      </div>
    </div>
  </div>;
}

type ProjectProjectRoi = 'purchasePrice' | 'renovationCost' | 'acquisitionCost' | 'estimatedValue' | 'monthlyRent';

function SplitVisualizer({ project, updateProject, patchUnit, totalArea, save }: { project: PropertyProject; updateProject: (patch: Partial<PropertyProject>) => void; patchUnit: (id: string, patch: Partial<PropertyUnit>) => void; totalArea: number; save: (project?: PropertyProject) => Promise<void> }) {
  const addUnit = () => { const unit = { id: crypto.randomUUID(), label: `Unit ${String.fromCharCode(65 + project.units.length)}`, area: 30, value: 165000, flipped: false }; const units = [...project.units, unit]; updateProject({ units }); void save({ ...project, units }); };
  const removeUnit = (id: string) => { const units = project.units.filter((unit) => unit.id !== id); updateProject({ units }); void save({ ...project, units }); };
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><Card><CardHeader eyebrow="Split / flip" title="Maak de verdeling bespreekbaar" detail="Teken geen juridisch plan. Gebruik units om scenario’s over oppervlak, waarde en oriëntatie te bespreken." action={<button onClick={addUnit} className="inline-flex items-center gap-1.5 rounded-lg bg-[#24324b] px-3 py-2 text-[10px] font-bold text-[#f7f3ec]" data-testid="button-add-unit"><Plus size={13} /> Unit</button>} /><div className="p-5 sm:p-6"><div className="property-grid relative min-h-[290px] overflow-hidden rounded-xl border border-[#d2cbc2] bg-[#f3f1ed] p-4"><div className="absolute left-1/2 top-1/2 h-[66%] w-[76%] -translate-x-1/2 -translate-y-1/2 rotate-[-1deg] border-2 border-[#24324b]/50 bg-[#ebe5dc] p-2 shadow-[7px_8px_0_#d8d0c4]">{project.units.map((unit, index) => <div key={unit.id} className={`absolute flex flex-col items-center justify-center border border-[#a95f39]/65 bg-[#fff8ef]/75 text-center transition-transform ${index === 0 ? 'inset-y-2 left-2 w-[48%]' : index === 1 ? 'inset-y-2 right-2 w-[48%]' : `bottom-2 left-2 top-[${(index - 1) * 19 + 4}%] right-2`}`} style={index > 1 ? { top: `${(index - 1) * 20 + 4}%`, right: '8px', bottom: '8px' } : undefined}><span className="mono text-[10px] font-bold text-[#a95f39]">{unit.label}</span><span className="mt-1 text-[9px] text-muted-foreground">{number(unit.area)} m²</span><span className="mt-1 text-[9px] text-muted-foreground">{unit.flipped ? 'spiegelbeeld' : 'oriëntatie origineel'}</span></div>)}</div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-[#eef8f4] px-4 py-3 text-xs"><span className="font-bold text-[#287b6a]">Scenario totaal</span><span className="mono font-bold text-[#287b6a]">{number(totalArea)} m² · {project.units.length} units</span></div></div></Card>
    <Card><CardHeader eyebrow="Units" title="Oppervlak & waarde" detail="Pas de aannames aan; de visualizer blijft in deze browser." /><div className="divide-y divide-border">{project.units.map((unit) => <div key={unit.id} className="space-y-3 p-5 sm:p-6"><div className="flex items-center justify-between"><input value={unit.label} onChange={(event) => patchUnit(unit.id, { label: event.target.value })} className="w-32 border-b border-border bg-transparent pb-1 text-sm font-bold outline-none focus:border-[#a95f39]" aria-label={`Naam ${unit.label}`} data-testid={`input-unit-label-${unit.id}`} /><div className="flex items-center gap-1"><button onClick={() => patchUnit(unit.id, { flipped: !unit.flipped })} className={`rounded-lg p-2 ${unit.flipped ? 'bg-[#f3e7da] text-[#a95f39]' : 'text-muted-foreground hover:bg-secondary'}`} aria-label={`Spiegel ${unit.label}`} data-testid={`button-flip-unit-${unit.id}`}><FlipHorizontal2 size={15} /></button><button onClick={() => removeUnit(unit.id)} disabled={project.units.length < 2} className="rounded-lg p-2 text-muted-foreground hover:bg-[#fff1ee] hover:text-[#9e4336] disabled:opacity-30" aria-label={`Verwijder ${unit.label}`} data-testid={`button-delete-unit-${unit.id}`}><Trash2 size={15} /></button></div></div><div className="grid grid-cols-2 gap-3"><Field label="Oppervlak (m²)" value={unit.area} type="number" onChange={(value) => patchUnit(unit.id, { area: Number(value) })} /><Field label="Indicatieve waarde" value={unit.value} type="number" prefix="€" onChange={(value) => patchUnit(unit.id, { value: Number(value) })} /></div></div>)}</div></Card></div>;
}

function RoiPanel({ project, patchCosts, roi, yieldValue, totalInvestment, valueCreation }: { project: PropertyProject; patchCosts: (key: ProjectProjectRoi, value: number) => void; roi: number; yieldValue: number; totalInvestment: number; valueCreation: number }) {
  return <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><Card><CardHeader eyebrow="ROI / yield" title="Toets het plan" detail="Een lokale rekenlaag voor scenario’s, niet een taxatie. Werk de aannames bij met je team." /><div className="space-y-4 p-5 sm:p-6"><Field label="Aankoopprijs" value={project.purchasePrice} type="number" prefix="€" onChange={(value) => patchCosts('purchasePrice', Number(value))} /><Field label="Renovatie" value={project.renovationCost} type="number" prefix="€" onChange={(value) => patchCosts('renovationCost', Number(value))} /><Field label="Acquisitie & kosten" value={project.acquisitionCost} type="number" prefix="€" onChange={(value) => patchCosts('acquisitionCost', Number(value))} /><div className="my-2 border-t border-border" /><Field label="Geschatte marktwaarde" value={project.estimatedValue} type="number" prefix="€" onChange={(value) => patchCosts('estimatedValue', Number(value))} /><Field label="Geschatte maandhuur" value={project.monthlyRent} type="number" prefix="€" onChange={(value) => patchCosts('monthlyRent', Number(value))} /></div></Card>
    <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2"><Metric label="Totale investering" value={euro(totalInvestment)} detail="Aankoop + renovatie + acquisitie" /><Metric label="Waardecreatie" value={euro(valueCreation)} detail="Geschatte waarde minus investering" positive={valueCreation >= 0} /></div><Card className="overflow-hidden"><div className="grid gap-0 sm:grid-cols-2"><div className="bg-[#24324b] p-7 text-[#f7f3ec]"><p className="mono text-[10px] uppercase tracking-[.16em] text-[#d8ad82]">Plan-ROI</p><p className="display mt-3 text-5xl font-bold tracking-[-.08em]">{number(roi)}<span className="text-2xl text-[#d8ad82]">%</span></p><p className="mt-3 max-w-xs text-xs leading-5 text-[#c0c7ce]">Op basis van de huidige browser-aannames. Niet inclusief financiering, belasting of leegstand.</p></div><div className="bg-[#eef8f4] p-7 text-[#24324b]"><p className="mono text-[10px] uppercase tracking-[.16em] text-[#287b6a]">Bruto huurrendement op investering</p><p className="display mt-3 text-5xl font-bold tracking-[-.08em]">{number(yieldValue)}<span className="text-2xl text-[#287b6a]">%</span></p><p className="mt-3 max-w-xs text-xs leading-5 text-[#47736b]">{euro(project.monthlyRent)} per maand; jaarlijkse huur gedeeld door totale investering.</p></div></div><div className="border-t border-border bg-card px-6 py-4 text-[10px] leading-4 text-muted-foreground"><Info size={13} className="mr-1 inline" /> Alle bedragen zijn editable aannames en worden alleen in IndexedDB van deze browser bewaard.</div></Card></div></div>;
}

function Metric({ label, value, detail, positive = true }: { label: string; value: string; detail: string; positive?: boolean }) {
  return <Card className="p-5"><p className="mono text-[9px] uppercase tracking-[.15em] text-muted-foreground">{label}</p><p className={`display mt-3 text-2xl font-bold tracking-[-.06em] ${positive ? 'text-[#287b6a]' : 'text-[#9e4336]'}`}>{value}</p><p className="mt-2 text-[10px] leading-4 text-muted-foreground">{detail}</p></Card>;
}

function TransferDossier({ project, result, roi, yieldValue, totalInvestment, valueCreation, onClose, onPrint, onDownload, onChecklistChange }: { project: PropertyProject; result?: ResultMeta; roi: number; yieldValue: number; totalInvestment: number; valueCreation: number; onClose: () => void; onPrint: () => void; onDownload: () => void; onChecklistChange: (checklist: PropertyProject['checklist']) => void }) {
  const [checklist, setChecklist] = useState(project.checklist);
  const [newItem, setNewItem] = useState('');
  const updateChecklist = (next: typeof checklist) => { setChecklist(next); onChecklistChange(next); };
  const addItem = () => { if (!newItem.trim()) return; updateChecklist([...checklist, { id: crypto.randomUUID(), label: newItem.trim(), done: false }]); setNewItem(''); };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1c2739]/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="dialog-transfer-dossier"><div className="mx-auto my-4 max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:my-10"><div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 sm:px-8"><div><p className="mono text-[9px] uppercase tracking-[.18em] text-[#a95f39]">Client transfer dossier</p><h2 className="display mt-1 text-2xl font-bold tracking-[-.05em]">{project.projectName || 'Transformatiescan'}</h2><p className="mt-1 text-xs text-muted-foreground">{project.address || 'Adres nog toevoegen'}{project.municipality ? ` · ${project.municipality}` : ''}</p></div><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Sluit dossier" data-testid="button-close-dossier"><X size={18} /></button></div><div className="grid gap-6 p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[#e4eee9] px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#287b6a]">Browser-only dossier</span><span className="rounded-md bg-[#f3e7da] px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#a95f39]">Style · {project.selectedStyle}</span>{result && <ConceptBadge />}</div><div className="grid gap-3 sm:grid-cols-3"><DossierMetric label="Totale investering" value={euro(totalInvestment)} /><DossierMetric label="Waardecreatie" value={euro(valueCreation)} /><DossierMetric label="ROI · yield" value={`${number(roi)}% · ${number(yieldValue)}%`} /></div><div className="grid gap-6 sm:grid-cols-[1.1fr_.9fr]"><div><h3 className="text-sm font-bold">Bespreekpunten</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Een praktische checklist voor de volgende klantstap.</p><div className="mt-4 space-y-2">{checklist.map((item) => <label key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-xs"><input type="checkbox" checked={item.done} onChange={(event) => updateChecklist(checklist.map((row) => row.id === item.id ? { ...row, done: event.target.checked } : row))} className="h-4 w-4 accent-[#a95f39]" data-testid={`checkbox-dossier-${item.id}`} /><span className={item.done ? 'text-muted-foreground line-through' : 'font-medium'}>{item.label}</span></label>)}</div><div className="mt-3 flex gap-2"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addItem(); }} placeholder="Nieuw actiepunt" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[#b87145]" aria-label="Nieuw actiepunt" data-testid="input-dossier-checklist" /><button onClick={addItem} className="rounded-lg bg-[#24324b] px-3 text-xs font-bold text-[#f7f3ec]" aria-label="Voeg actiepunt toe" data-testid="button-add-checklist"><Plus size={14} /></button></div></div><div className="rounded-xl border border-[#d7e6e0] bg-[#eef8f4] p-4"><p className="mono text-[9px] uppercase tracking-[.14em] text-[#287b6a]">Belangrijk voor de client</p><p className="mt-3 text-xs leading-5 text-[#47736b]">Alle previewbeelden zijn AI-concepten. Ze zijn niet feitelijk, niet op schaal en geen toezegging over ontwerp, uitvoering, waarde of rendement.</p><div className="mt-5 border-t border-[#cde1d8] pt-4"><p className="text-[10px] font-bold text-[#287b6a]">Bronfoto</p><p className="mt-1 text-xs text-[#47736b]">{project.originalKey ? 'Lokaal in deze browser' : 'Nog niet toegevoegd'}</p></div></div></div>{project.notes && <div className="rounded-xl bg-[#f3f1ed] p-4"><p className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">Projectnotitie</p><p className="mt-2 text-xs leading-5">{project.notes}</p></div>}<div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end"><button onClick={onClose} className="rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-cancel-dossier">Sluiten</button><button onClick={onDownload} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-download-dossier"><Download size={15} /> HTML downloaden</button><button onClick={onPrint} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#a95f39] px-4 py-3 text-xs font-bold text-[#fff8ef]" data-testid="button-print-dossier"><Printer size={15} /> Print / PDF</button></div></div></div></div>;
}

function DossierMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-4"><p className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>;
}

function dossierHtml(project: PropertyProject, result: ResultMeta | undefined, roi: number, yieldValue: number, totalInvestment: number, valueCreation: number, conceptImage = ''): string {
  const checklist = project.checklist.map((item) => `<li>${item.done ? '&#9745;' : '&#9744;'} ${item.label}</li>`).join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${project.projectName}</title><style>body{font:15px system-ui,sans-serif;color:#24324b;max-width:780px;margin:48px auto;padding:0 22px;line-height:1.6}h1{font-size:36px;line-height:1.1}h2{margin-top:34px;border-bottom:1px solid #ddd5cc;padding-bottom:8px}.tag{display:inline-block;background:#e4eee9;padding:4px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.12em}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #e5e0d8}small{color:#687483}.warning{background:#eef8f4;padding:18px;border-left:4px solid #287b6a}.concept{max-width:100%;border-radius:12px;border:1px solid #ddd5cc}</style></head><body><span class="tag">RealEstateX · browser dossier</span><h1>${project.projectName || 'Transformatiescan'}</h1><p>${project.address || 'Adres nog toevoegen'}${project.municipality ? ` · ${project.municipality}` : ''}</p><p><b>Stijl:</b> ${project.selectedStyle}${result ? ` · <b>Concept:</b> ${result.label}` : ''}</p>${conceptImage ? `<h2>Geselecteerd concept</h2><img class="concept" src="${conceptImage}" alt="${result?.label ?? 'AI-concept'}"><p><small>Conceptbeeld, niet feitelijk.</small></p>` : ''}<h2>ROI-breekpunt</h2><table><tr><td>Totale investering</td><td>${euro(totalInvestment)}</td></tr><tr><td>Waardecreatie</td><td>${euro(valueCreation)}</td></tr><tr><td>Plan-ROI</td><td>${number(roi)}%</td></tr><tr><td>Bruto huurrendement</td><td>${number(yieldValue)}%</td></tr></table><h2>Actiechecklist</h2><ul>${checklist}</ul>${project.notes ? `<h2>Notitie</h2><p>${project.notes}</p>` : ''}<div class="warning"><b>AI-concept disclaimer</b><br>Previewbeelden zijn richtinggevende AI-visualisaties. Ze zijn geen feitelijke representatie, niet op schaal en geen toezegging over ontwerp, uitvoering, waarde of rendement.</div><p><small>Lokaal gegenereerd op ${new Date().toLocaleString('nl-NL')}. Er zijn geen project- of beeldgegevens via serverroutes opgeslagen.</small></p></body></html>`;
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function safeDossierHtml(project: PropertyProject, result: ResultMeta | undefined, roi: number, yieldValue: number, totalInvestment: number, valueCreation: number, conceptImage = ''): string {
  const safeProject: PropertyProject = {
    ...project,
    projectName: escapeHtml(project.projectName),
    address: escapeHtml(project.address),
    municipality: escapeHtml(project.municipality),
    notes: escapeHtml(project.notes),
    selectedStyle: escapeHtml(project.selectedStyle) as PropertyStyle,
    checklist: project.checklist.map((item) => ({ ...item, label: escapeHtml(item.label) })),
  };
  const safeResult = result ? { ...result, label: escapeHtml(result.label) } : undefined;
  const safeImage = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(conceptImage) ? conceptImage : '';
  return dossierHtml(safeProject, safeResult, roi, yieldValue, totalInvestment, valueCreation, safeImage);
}

export { PropertyTransformer };