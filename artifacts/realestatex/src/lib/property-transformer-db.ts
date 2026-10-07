export type PropertyStyle = 'japandi' | 'modern' | 'industrial';
export type PropertyAction = 'declutter' | 'stage' | 'makeover' | 'dusk';
export type PropertyProjectSortOrder = 'recent' | 'name' | 'municipality';

export type PropertyImageRecord = {
  key: string;
  blob: Blob;
  label: string;
  mimeType: string;
  isConcept: boolean;
  disclaimer: string;
  createdAt: string;
};

export type PropertyUnit = {
  id: string;
  label: string;
  area: number;
  value: number;
  flipped: boolean;
};

export type PropertyProject = {
  id: string;
  address: string;
  municipality: string;
  projectName: string;
  notes: string;
  selectedStyle: PropertyStyle;
  originalKey: string;
  resultKeys: Partial<Record<PropertyAction, string>>;
  selectedResult: PropertyAction | null;
  purchasePrice: number;
  renovationCost: number;
  acquisitionCost: number;
  estimatedValue: number;
  monthlyRent: number;
  splitRatio: number;
  flipHorizontal: boolean;
  roiFields: { purchasePrice: number; renovationCost: number; acquisitionCost: number; estimatedValue: number; monthlyRent: number };
  units: PropertyUnit[];
  checklist: { id: string; label: string; done: boolean }[];
  updatedAt: string;
};

export type PropertyProjectPhotoHealth = {
  sourcePhoto: 'available' | 'not-added' | 'missing';
  missingConcepts: PropertyAction[];
};

type ExportedPropertyImage = {
  key: string;
  label: string;
  mimeType: string;
  isConcept: boolean;
  disclaimer: string;
  createdAt: string;
  blobBase64: string;
  sha256: string;
};

export type PropertyProjectArchive = {
  format: 'realestatex-property-project';
  version: 1;
  exportedAt: string;
  project: PropertyProject;
  images: ExportedPropertyImage[];
};

export type PropertyPortfolioArchive = {
  format: 'realestatex-property-portfolio';
  version: 1;
  exportedAt: string;
  projects: PropertyProjectArchive[];
};

const DB_NAME = 'realestatex-property-transformer';
const DB_VERSION = 2;
const PROJECTS = 'projects';
const IMAGES = 'images';
const METADATA = 'metadata';
const LEGACY_CLAIM_KEY = 'legacy-projects-claim';
const ACCOUNT_LEGACY_IMPORT_KEY = 'imported-legacy-projects';
const PROJECT_SORT_ORDER_PREFERENCE_KEY = 'realestatex.property-project-sort-order';
const PROPERTY_ACTIONS: PropertyAction[] = ['declutter', 'stage', 'makeover', 'dusk'];
const PROPERTY_STYLES: PropertyStyle[] = ['japandi', 'modern', 'industrial'];
const PROPERTY_STORAGE_CHANNEL_NAME = 'realestatex-property-storage-changes';
const PROPERTY_PROJECT_IMPORT_LOCK_NAME = 'realestatex-property-project-import';
const PENDING_PHOTO_CLEANUP_KEY = 'pending-property-photo-cleanup';
const LEGACY_CLAIM_STALE_AFTER_MS = 5 * 60 * 1000;

type StorageScope = string | null;
type PendingPhotoCleanupRecord = { key: string; imageKeys: string[] };
type LegacyClaimRecord = {
  key: string;
  accountId: string;
  status: 'claiming' | 'claimed';
  token: string;
  updatedAt: number;
  importedCount?: number;
};
export type LegacyProjectClaimStatus = {
  status: 'none' | 'available' | 'claimed' | 'unavailable' | 'in-progress' | 'error';
  projectCount: number;
};

const propertyStorageSubscribers = new Map<string, Set<() => void>>();
const propertyStorageChannels = new Map<string, BroadcastChannel>();
const legacyClaimSubscribers = new Set<() => void>();
let legacyClaimChannel: BroadcastChannel | null = null;

function getLegacyClaimChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!legacyClaimChannel) {
    legacyClaimChannel = new BroadcastChannel(`${PROPERTY_STORAGE_CHANNEL_NAME}:legacy-claim`);
    legacyClaimChannel.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type !== 'claim-changed') return;
      for (const subscriber of legacyClaimSubscribers) subscriber();
    });
  }
  return legacyClaimChannel;
}

export function subscribeLegacyProjectClaimChanges(subscriber: () => void): () => void {
  if (!getLegacyClaimChannel()) return () => {};
  legacyClaimSubscribers.add(subscriber);
  return () => legacyClaimSubscribers.delete(subscriber);
}

function notifyLegacyProjectClaimChanged(): void {
  for (const subscriber of legacyClaimSubscribers) subscriber();
  getLegacyClaimChannel()?.postMessage({ type: 'claim-changed' });
}

function storageScopeKey(scope: StorageScope): string {
  return scope === null ? 'legacy' : `account:${encodeURIComponent(scope)}`;
}

function getPropertyStorageChannel(scope: StorageScope): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  const key = storageScopeKey(scope);
  let channel = propertyStorageChannels.get(key);
  if (!channel) {
    channel = new BroadcastChannel(`${PROPERTY_STORAGE_CHANNEL_NAME}:${key}`);
    channel.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type !== 'changed') return;
      for (const subscriber of propertyStorageSubscribers.get(key) ?? []) subscriber();
    });
    propertyStorageChannels.set(key, channel);
  }
  return channel;
}

export function subscribePropertyStorageChanges(subscriber: () => void, scope: StorageScope = null): () => void {
  if (!getPropertyStorageChannel(scope)) return () => {};
  const key = storageScopeKey(scope);
  const subscribers = propertyStorageSubscribers.get(key) ?? new Set<() => void>();
  subscribers.add(subscriber);
  propertyStorageSubscribers.set(key, subscribers);
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) propertyStorageSubscribers.delete(key);
  };
}

function notifyPropertyStorageChanged(scope: StorageScope = null): void {
  getPropertyStorageChannel(scope)?.postMessage({ type: 'changed' });
}

function compareProjectText(leftValue: string, rightValue: string): number {
  const left = leftValue.trim();
  const right = rightValue.trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'nl-NL', { numeric: true, sensitivity: 'base' });
}

export function sortPropertyProjects(
  projects: PropertyProject[],
  order: PropertyProjectSortOrder = 'recent',
): PropertyProject[] {
  const recentFirst = (left: PropertyProject, right: PropertyProject) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);

  return [...projects].sort((left, right) => {
    if (order === 'recent') return recentFirst(left, right);

    const leftName = left.projectName || 'Transformatiescan';
    const rightName = right.projectName || 'Transformatiescan';
    const primaryOrder = order === 'name'
      ? compareProjectText(leftName, rightName)
      : compareProjectText(left.municipality, right.municipality);
    if (primaryOrder !== 0) return primaryOrder;

    const secondaryOrder = order === 'name'
      ? compareProjectText(left.municipality, right.municipality)
      : compareProjectText(leftName, rightName);
    return secondaryOrder || recentFirst(left, right);
  });
}

function sortOrderPreferenceKey(scope: StorageScope): string {
  return scope === null
    ? PROJECT_SORT_ORDER_PREFERENCE_KEY
    : `${PROJECT_SORT_ORDER_PREFERENCE_KEY}:${encodeURIComponent(scope)}`;
}

export function loadPropertyProjectSortOrderPreference(scope: StorageScope = null): PropertyProjectSortOrder {
  return readPropertyProjectSortOrderPreference(scope).order;
}

export type PropertyProjectSortOrderPreference = {
  order: PropertyProjectSortOrder;
  storageAvailable: boolean;
};

export function readPropertyProjectSortOrderPreference(
  scope: StorageScope = null,
): PropertyProjectSortOrderPreference {
  if (typeof window === 'undefined') return { order: 'recent', storageAvailable: false };

  try {
    const preference = window.localStorage.getItem(sortOrderPreferenceKey(scope));
    const order = preference === 'recent' || preference === 'name' || preference === 'municipality'
      ? preference
      : 'recent';
    return { order, storageAvailable: true };
  } catch {
    // Keep the project list available when browser preference storage is blocked.
    return { order: 'recent', storageAvailable: false };
  }
}

export function savePropertyProjectSortOrderPreference(order: PropertyProjectSortOrder, scope: StorageScope = null): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(sortOrderPreferenceKey(scope), order);
    return true;
  } catch {
    // Sorting still works for this session if browser preference storage is blocked.
    return false;
  }
}

export function subscribePropertyProjectSortOrderPreferenceChanges(
  subscriber: () => void,
  scope: StorageScope = null,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const preferenceKey = sortOrderPreferenceKey(scope);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey) subscriber();
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function importError(reason: string): never {
  throw new Error(`Import afgewezen: ${reason}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateProject(project: unknown): asserts project is PropertyProject {
  if (!isRecord(project)) importError('projectgegevens ontbreken.');

  const requiredStrings = ['id', 'address', 'municipality', 'projectName', 'notes', 'originalKey', 'updatedAt'];
  for (const field of requiredStrings) {
    if (typeof project[field] !== 'string') importError(`projectveld “${field}” ontbreekt of is ongeldig.`);
  }
  if (!PROPERTY_STYLES.includes(project.selectedStyle as PropertyStyle)) importError('de gekozen stijl is ongeldig.');
  if (project.selectedResult !== null && !PROPERTY_ACTIONS.includes(project.selectedResult as PropertyAction)) {
    importError('het gekozen concept is ongeldig.');
  }
  if (typeof project.flipHorizontal !== 'boolean') importError('de spiegelinstelling ontbreekt of is ongeldig.');

  const numericFields = ['purchasePrice', 'renovationCost', 'acquisitionCost', 'estimatedValue', 'monthlyRent', 'splitRatio'];
  for (const field of numericFields) {
    if (typeof project[field] !== 'number' || !Number.isFinite(project[field])) {
      importError(`projectveld “${field}” ontbreekt of is ongeldig.`);
    }
  }
  if (!isRecord(project.roiFields)) importError('de financiële instellingen ontbreken.');
  for (const field of ['purchasePrice', 'renovationCost', 'acquisitionCost', 'estimatedValue', 'monthlyRent']) {
    if (typeof project.roiFields[field] !== 'number' || !Number.isFinite(project.roiFields[field])) {
      importError(`financiële instelling “${field}” ontbreekt of is ongeldig.`);
    }
  }

  if (!isRecord(project.resultKeys)) importError('de conceptverwijzingen ontbreken.');
  for (const [action, key] of Object.entries(project.resultKeys)) {
    if (!PROPERTY_ACTIONS.includes(action as PropertyAction) || !isNonEmptyString(key)) {
      importError('een conceptverwijzing is ongeldig.');
    }
  }
  if (typeof project.selectedResult === 'string' && !project.resultKeys[project.selectedResult as PropertyAction]) {
    importError('het gekozen concept heeft geen opgeslagen afbeelding.');
  }

  if (!Array.isArray(project.units)) importError('de woningindeling ontbreekt.');
  for (const unit of project.units) {
    if (!isRecord(unit) || !isNonEmptyString(unit.id) || typeof unit.label !== 'string'
      || typeof unit.area !== 'number' || !Number.isFinite(unit.area)
      || typeof unit.value !== 'number' || !Number.isFinite(unit.value)
      || typeof unit.flipped !== 'boolean') {
      importError('een woningdeel is ongeldig of onvolledig.');
    }
  }

  if (!Array.isArray(project.checklist)) importError('de checklist ontbreekt.');
  for (const item of project.checklist) {
    if (!isRecord(item) || !isNonEmptyString(item.id) || typeof item.label !== 'string' || typeof item.done !== 'boolean') {
      importError('een checklistpunt is ongeldig of onvolledig.');
    }
  }
}

function validateArchive(value: unknown): asserts value is PropertyProjectArchive {
  if (!isRecord(value) || value.format !== 'realestatex-property-project') {
    importError('dit is geen RealEstateX-projectexport.');
  }
  if (value.version !== 1) importError('deze versie van het RealEstateX-projectbestand wordt niet ondersteund.');
  if (typeof value.exportedAt !== 'string') importError('de exportdatum ontbreekt.');
  validateProject(value.project);

  if (!Array.isArray(value.images)) importError('de foto’s en concepten ontbreken.');
  const requiredImages = new Map<string, 'original' | 'concept'>();
  if (value.project.originalKey) requiredImages.set(value.project.originalKey, 'original');
  for (const key of Object.values(value.project.resultKeys)) {
    if (typeof key === 'string') {
      if (requiredImages.has(key)) importError('dezelfde foto wordt op meerdere plekken gebruikt.');
      requiredImages.set(key, 'concept');
    }
  }
  if (requiredImages.size > 0 && !value.project.originalKey) {
    importError('de bronfoto ontbreekt terwijl het project concepten bevat.');
  }

  const foundImages = new Set<string>();
  for (const image of value.images) {
    if (!isRecord(image) || !isNonEmptyString(image.key) || !isNonEmptyString(image.label)
      || !isNonEmptyString(image.mimeType) || typeof image.isConcept !== 'boolean'
      || typeof image.disclaimer !== 'string' || typeof image.createdAt !== 'string'
      || typeof image.blobBase64 !== 'string' || !image.blobBase64
      || typeof image.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(image.sha256)) {
      importError('een foto is ongeldig of onvolledig.');
    }
    if (!/^image\/(png|jpeg|webp|avif|gif)$/i.test(image.mimeType)) {
      importError(`foto “${image.label}” heeft een niet-ondersteund bestandstype.`);
    }
    if (!requiredImages.has(image.key)) importError('het bestand bevat een foto die niet bij dit project hoort.');
    if (foundImages.has(image.key)) importError('het bestand bevat een dubbele fotoverwijzing.');
    if (image.isConcept !== (requiredImages.get(image.key) === 'concept')) {
      importError(`foto “${image.label}” is niet als bronfoto of concept gemarkeerd zoals verwacht.`);
    }
    foundImages.add(image.key);
    try {
      const binary = atob(image.blobBase64);
      if (!binary.length || btoa(binary) !== image.blobBase64) importError(`foto “${image.label}” bevat ongeldige afbeeldingsgegevens.`);
    } catch {
      importError(`foto “${image.label}” bevat ongeldige afbeeldingsgegevens.`);
    }
  }
  for (const [key, kind] of requiredImages) {
    if (!foundImages.has(key)) {
      importError(kind === 'original' ? 'de bronfoto ontbreekt in het projectbestand.' : 'een gegenereerd concept ontbreekt in het projectbestand.');
    }
  }
}

function validatePortfolioArchive(value: unknown): asserts value is PropertyPortfolioArchive {
  if (!isRecord(value) || value.format !== 'realestatex-property-portfolio' || value.version !== 1) {
    importError('dit is geen ondersteunde RealEstateX-portfolioback-up.');
  }
  if (typeof value.exportedAt !== 'string') importError('de exportdatum van de portfolioback-up ontbreekt.');
  if (!Array.isArray(value.projects) || value.projects.length === 0) {
    importError('de portfolioback-up bevat geen projecten.');
  }

  const projectIds = new Set<string>();
  for (const [index, projectArchive] of value.projects.entries()) {
    try {
      validateArchive(projectArchive);
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/^Import afgewezen:\s*/, '') : 'projectbestand is ongeldig.';
      importError(`project ${index + 1}: ${reason}`);
    }
    if (projectIds.has(projectArchive.project.id)) {
      importError('dezelfde projectverwijzing komt meerdere keren in de back-up voor.');
    }
    projectIds.add(projectArchive.project.id);
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function blobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function databaseName(scope: StorageScope): string {
  return scope === null ? DB_NAME : `${DB_NAME}:account:${encodeURIComponent(scope)}`;
}

function openDb(scope: StorageScope = null): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(scope), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(METADATA)) db.createObjectStore(METADATA, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Lokale projectopslag wordt nog gebruikt in een ander tabblad. Sluit dat tabblad en probeer opnieuw.'));
  });
}

async function put<T>(storeName: string, value: T, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  notifyPropertyStorageChanged(scope);
}

async function get<T>(storeName: string, key: string, scope: StorageScope = null): Promise<T | undefined> {
  const db = await openDb(scope);
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function savePropertyProject(project: PropertyProject, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECTS, 'readwrite');
      const store = transaction.objectStore(PROJECTS);
      const request = store.get(project.id);
      request.onsuccess = () => {
        const stored = request.result as PropertyProject | undefined;
        if (!stored) {
          store.put(project);
          return;
        }
        const resultKeys = stored.resultKeys ?? {};
        const selectedResult = project.selectedResult && resultKeys[project.selectedResult]
          ? project.selectedResult
          : stored.selectedResult && resultKeys[stored.selectedResult]
            ? stored.selectedResult
            : null;
        store.put({
          ...project,
          originalKey: stored.originalKey,
          resultKeys,
          selectedResult,
        });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  notifyPropertyStorageChanged(scope);
}

export async function updatePropertyProject(project: PropertyProject, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  let missingProject = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECTS, 'readwrite');
      const store = transaction.objectStore(PROJECTS);
      const request = store.get(project.id);
      request.onsuccess = () => {
        const stored = request.result as PropertyProject | undefined;
        if (!stored) {
          missingProject = true;
          transaction.abort();
          return;
        }
        const resultKeys = stored.resultKeys ?? {};
        const selectedResult = project.selectedResult && resultKeys[project.selectedResult]
          ? project.selectedResult
          : stored.selectedResult && resultKeys[stored.selectedResult]
            ? stored.selectedResult
            : null;
        store.put({
          ...project,
          originalKey: stored.originalKey,
          resultKeys,
          selectedResult,
        });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(missingProject
        ? new Error('Het project bestaat niet meer in deze browser.')
        : transaction.error);
    });
  } finally {
    db.close();
  }
  notifyPropertyStorageChanged(scope);
}

export async function savePropertyProjectWithImage(project: PropertyProject, image: PropertyImageRecord, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
        transaction.objectStore(PROJECTS).put(project);
        transaction.objectStore(IMAGES).put(image);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch {
      throw new Error('De foto kon niet worden opgeslagen. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven. Controleer de browseropslag en probeer opnieuw.');
    }
    notifyPropertyStorageChanged(scope);
  } finally {
    db.close();
  }
}

function referencedProjectImageKeys(project: Pick<PropertyProject, 'originalKey' | 'resultKeys'>): Set<string> {
  return new Set([
    project.originalKey,
    ...Object.values(project.resultKeys),
  ].filter((key): key is string => Boolean(key)));
}

async function rememberPendingPhotoCleanup(imageKeys: string[], scope: StorageScope): Promise<void> {
  if (imageKeys.length === 0) return;
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA, 'readwrite');
      const store = transaction.objectStore(METADATA);
      const request = store.get(PENDING_PHOTO_CLEANUP_KEY);
      request.onsuccess = () => {
        const pending = request.result as PendingPhotoCleanupRecord | undefined;
        store.put({
          key: PENDING_PHOTO_CLEANUP_KEY,
          imageKeys: [...new Set([...(pending?.imageKeys ?? []), ...imageKeys])],
        } satisfies PendingPhotoCleanupRecord);
      };
      request.onerror = () => reject(request.error ?? new Error('Oude foto’s konden niet voor opruiming worden gemarkeerd.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Oude foto’s konden niet voor opruiming worden gemarkeerd.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Oude foto’s konden niet voor opruiming worden gemarkeerd.'));
    });
  } finally {
    db.close();
  }
}

async function commitProjectPhotoMutation(
  projectId: string,
  image: PropertyImageRecord,
  updateProject: (current: PropertyProject) => PropertyProject,
  cleanupKeys: (current: PropertyProject, next: PropertyProject) => Iterable<string>,
  scope: StorageScope,
  classifyStorageFailure = false,
  deferCleanup = false,
): Promise<{ project: PropertyProject; cleanupKeys: string[] }> {
  let db: IDBDatabase | undefined;
  let committedProject: PropertyProject | undefined;
  let committedCleanupKeys: string[] = [];
  let missingProjectError: Error | undefined;
  let operationError: unknown;
  try {
    const database = await openDb(scope);
    db = database;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([PROJECTS, IMAGES], 'readwrite');
      const projectStore = transaction.objectStore(PROJECTS);
      const imageStore = transaction.objectStore(IMAGES);
      const projectsRequest = projectStore.getAll();
      projectsRequest.onsuccess = () => {
        try {
          const projects = projectsRequest.result as PropertyProject[];
          const current = projects.find((item) => item.id === projectId);
          if (!current) {
            missingProjectError = new Error('Het project bestaat niet meer in deze browser.');
            transaction.abort();
            return;
          }

          const next = updateProject(current);
          committedProject = next;
          committedCleanupKeys = [...new Set(cleanupKeys(current, next))]
            .filter((key) => Boolean(key) && key !== image.key);
          const referencedKeys = new Set(
            projects
              .filter((item) => item.id !== projectId)
              .flatMap((item) => [...referencedProjectImageKeys(item)]),
          );
          for (const key of referencedProjectImageKeys(next)) referencedKeys.add(key);

          projectStore.put(next);
          if (!deferCleanup) {
            for (const key of committedCleanupKeys) {
              if (!referencedKeys.has(key)) imageStore.delete(key);
            }
          }
          imageStore.put(image);
        } catch (error) {
          operationError = error;
          transaction.abort();
        }
      };
      projectsRequest.onerror = () => reject(projectsRequest.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(missingProjectError ?? operationError ?? transaction.error);
      transaction.onabort = () => reject(missingProjectError ?? operationError ?? transaction.error ?? new Error('De foto kon niet samen met het project worden opgeslagen.'));
    });
    if (!committedProject) throw new Error('De foto kon niet samen met het project worden opgeslagen.');
    if (deferCleanup && committedCleanupKeys.length > 0) {
      await rememberPendingPhotoCleanup(committedCleanupKeys, scope).catch(() => undefined);
    }
    notifyPropertyStorageChanged(scope);
    return { project: committedProject, cleanupKeys: committedCleanupKeys };
  } catch (error) {
    if (missingProjectError) throw missingProjectError;
    const cause = operationError ?? error;
    if (classifyStorageFailure) {
      throw new PropertyPhotoStorageSaveError(getPropertyPhotoSaveFailureKind(cause), cause);
    }
    throw new Error('De foto kon niet worden opgeslagen. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven. Controleer de browseropslag en probeer opnieuw.', { cause });
  } finally {
    db?.close();
  }
}

export type PropertyPhotoSaveFailureKind = 'quota' | 'access' | 'unknown';

export class PropertyPhotoStorageSaveError extends Error {
  constructor(
    readonly failureKind: PropertyPhotoSaveFailureKind,
    cause?: unknown,
  ) {
    super('De foto kon niet worden opgeslagen. Je project, gekozen scenario en bestaande foto’s zijn ongewijzigd gebleven. Controleer de browseropslag en probeer opnieuw.', { cause });
    this.name = 'PropertyPhotoStorageSaveError';
  }
}

export function getPropertyPhotoSaveFailureKind(error: unknown): PropertyPhotoSaveFailureKind {
  const seen = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const namedError = current as { name?: unknown; cause?: unknown };
    if (namedError.name === 'QuotaExceededError') return 'quota';
    if (namedError.name === 'SecurityError' || namedError.name === 'NotAllowedError') return 'access';
    current = namedError.cause;
  }
  return 'unknown';
}

export async function replacePropertySourceImage(
  projectId: string,
  image: PropertyImageRecord,
  preserveConcepts: boolean,
  existingConceptKeys: Partial<Record<PropertyAction, string>>,
  scope: StorageScope = null,
): Promise<{ project: PropertyProject; cleanupKeys: string[] }> {
  const conceptsPresentAtUploadStart = new Set(
    Object.values(existingConceptKeys).filter((key): key is string => Boolean(key)),
  );
  return commitProjectPhotoMutation(
    projectId,
    image,
    (current) => {
      const resultKeys = preserveConcepts
        ? current.resultKeys
        : Object.fromEntries(Object.entries(current.resultKeys).filter(([, key]) => !conceptsPresentAtUploadStart.has(key))) as PropertyProject['resultKeys'];
      const selectedResult = current.selectedResult && resultKeys[current.selectedResult]
        ? current.selectedResult
        : null;
      return {
        ...current,
        originalKey: image.key,
        resultKeys,
        selectedResult,
        updatedAt: new Date().toISOString(),
      };
    },
    (current, next) => [
      current.originalKey,
      ...Object.values(current.resultKeys).filter((key) => !Object.values(next.resultKeys).includes(key)),
    ],
    scope,
    true,
    true,
  );
}

export async function savePropertyConceptImage(
  projectId: string,
  action: PropertyAction,
  image: PropertyImageRecord,
  splitRatio: number,
  scope: StorageScope = null,
): Promise<PropertyProject> {
  const result = await commitProjectPhotoMutation(
    projectId,
    image,
    (current) => ({
      ...current,
      resultKeys: { ...current.resultKeys, [action]: image.key },
      selectedResult: action,
      splitRatio,
      updatedAt: new Date().toISOString(),
    }),
    (current) => [current.resultKeys[action] ?? ''],
    scope,
  );
  return result.project;
}

export async function loadPropertyProjects(scope: StorageScope = null): Promise<PropertyProject[]> {
  const db = await openDb(scope);
  try {
    const projects = await new Promise<PropertyProject[]>((resolve, reject) => {
      const request = db.transaction(PROJECTS, 'readonly').objectStore(PROJECTS).getAll();
      request.onsuccess = () => resolve(request.result as PropertyProject[]);
      request.onerror = () => reject(request.error);
    });
    return sortPropertyProjects(projects);
  } finally {
    db.close();
  }
}

function duplicateProjectDetails(project: PropertyProject): string {
  return JSON.stringify({
    address: project.address,
    municipality: project.municipality,
    projectName: project.projectName,
    notes: project.notes,
    selectedStyle: project.selectedStyle,
    selectedResult: project.selectedResult,
    purchasePrice: project.purchasePrice,
    renovationCost: project.renovationCost,
    acquisitionCost: project.acquisitionCost,
    estimatedValue: project.estimatedValue,
    monthlyRent: project.monthlyRent,
    splitRatio: project.splitRatio,
    flipHorizontal: project.flipHorizontal,
    roiFields: project.roiFields,
    units: project.units,
    checklist: project.checklist,
  });
}

function duplicateProjectFingerprint(project: PropertyProject, imageFingerprints: Map<string, string>): string {
  const imageIdentity = (key: string | undefined) => key
    ? imageFingerprints.get(key) ?? 'missing'
    : null;
  return JSON.stringify({
    details: duplicateProjectDetails(project),
    original: imageIdentity(project.originalKey),
    concepts: Object.fromEntries(PROPERTY_ACTIONS.flatMap((action) => {
      const key = project.resultKeys[action];
      return key ? [[action, imageIdentity(key)]] : [];
    })),
  });
}

export async function findMatchingSavedPropertyProject(archiveInput: unknown, scope: StorageScope = null): Promise<PropertyProject | undefined> {
  validateArchive(archiveInput);
  const archive = archiveInput;
  const archivedDetails = duplicateProjectDetails(archive.project);
  const archiveImageFingerprints = new Map(archive.images.map((image) => [
    image.key,
    JSON.stringify({ sha256: image.sha256, mimeType: image.mimeType, isConcept: image.isConcept }),
  ]));
  const archivedFingerprint = duplicateProjectFingerprint(archive.project, archiveImageFingerprints);

  const db = await openDb(scope);
  try {
    const { candidates, imageRecords } = await new Promise<{
      candidates: PropertyProject[];
      imageRecords: Map<string, PropertyImageRecord | undefined>;
    }>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readonly');
      const projectsRequest = transaction.objectStore(PROJECTS).getAll();
      const imageStore = transaction.objectStore(IMAGES);
      const imageRecords = new Map<string, PropertyImageRecord | undefined>();
      let candidates: PropertyProject[] | undefined;

      projectsRequest.onsuccess = () => {
        candidates = (projectsRequest.result as PropertyProject[])
          .filter((project) => duplicateProjectDetails(project) === archivedDetails);
        const imageKeys = new Set(candidates.flatMap((project) => [
          ...(project.originalKey ? [project.originalKey] : []),
          ...Object.values(project.resultKeys).filter((key): key is string => Boolean(key)),
        ]));
        for (const key of imageKeys) {
          const request = imageStore.get(key);
          request.onsuccess = () => { imageRecords.set(key, request.result as PropertyImageRecord | undefined); };
          request.onerror = () => reject(request.error ?? new Error('De opgeslagen projectfoto’s konden niet worden gelezen.'));
        }
      };
      projectsRequest.onerror = () => reject(projectsRequest.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.'));
      transaction.oncomplete = () => {
        if (candidates === undefined) {
          reject(new Error('De opgeslagen projecten konden niet worden gelezen.'));
          return;
        }
        resolve({ candidates, imageRecords });
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.'));
    });

    const storedImageFingerprints = new Map<string, string>();
    await Promise.all([...imageRecords].map(async ([key, image]) => {
      if (!image) return;
      storedImageFingerprints.set(key, JSON.stringify({
        sha256: await blobSha256(image.blob),
        mimeType: image.mimeType || image.blob.type,
        isConcept: image.isConcept,
      }));
    }));
    return candidates.find((project) =>
      duplicateProjectFingerprint(project, storedImageFingerprints) === archivedFingerprint,
    );
  } finally {
    db.close();
  }
}

export async function loadPropertyProjectsWithPhotoHealth(scope: StorageScope = null): Promise<{
  projects: PropertyProject[];
  photoHealthById: Record<string, PropertyProjectPhotoHealth>;
}> {
  const db = await openDb(scope);
  try {
    const { projects, imageKeys } = await new Promise<{ projects: PropertyProject[]; imageKeys: IDBValidKey[] }>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readonly');
      const projectsRequest = transaction.objectStore(PROJECTS).getAll();
      const imageKeysRequest = transaction.objectStore(IMAGES).getAllKeys();
      let storedProjects: PropertyProject[] | undefined;
      let storedImageKeys: IDBValidKey[] | undefined;

      projectsRequest.onsuccess = () => { storedProjects = projectsRequest.result as PropertyProject[]; };
      imageKeysRequest.onsuccess = () => { storedImageKeys = imageKeysRequest.result; };
      transaction.oncomplete = () => {
        if (storedProjects === undefined || storedImageKeys === undefined) {
          reject(new Error('De foto-status van opgeslagen projecten kon niet worden gelezen.'));
          return;
        }
        resolve({ projects: storedProjects, imageKeys: storedImageKeys });
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const availableImageKeys = new Set(imageKeys);
    const photoHealthById = Object.fromEntries(projects.map((project) => [
      project.id,
      {
        sourcePhoto: !project.originalKey
          ? 'not-added'
          : availableImageKeys.has(project.originalKey)
            ? 'available'
            : 'missing',
        missingConcepts: PROPERTY_ACTIONS.filter((action) => {
          const key = project.resultKeys[action];
          return Boolean(key) && !availableImageKeys.has(key!);
        }),
      } satisfies PropertyProjectPhotoHealth,
    ]));
    return { projects: sortPropertyProjects(projects), photoHealthById };
  } finally {
    db.close();
  }
}

export async function loadPropertyProject(id: string, scope: StorageScope = null): Promise<PropertyProject | undefined> {
  return get<PropertyProject>(PROJECTS, id, scope);
}

export async function loadLatestPropertyProject(scope: StorageScope = null): Promise<PropertyProject | undefined> {
  return (await loadPropertyProjects(scope))[0];
}

export async function deletePropertyProject(project: Pick<PropertyProject, 'id' | 'originalKey' | 'resultKeys'>, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      const projectStore = transaction.objectStore(PROJECTS);
      const imageStore = transaction.objectStore(IMAGES);
      const projectsRequest = projectStore.getAll();
      projectsRequest.onsuccess = () => {
        const storedProjects = projectsRequest.result as PropertyProject[];
        const projectToDelete = storedProjects.find((storedProject) => storedProject.id === project.id);
        const imageKeys = new Set([
          projectToDelete?.originalKey ?? '',
          ...Object.values(projectToDelete?.resultKeys ?? {}),
        ].filter((key): key is string => Boolean(key)));
        const referencedImageKeys = new Set(
          storedProjects
            .filter((storedProject) => storedProject.id !== project.id)
            .flatMap((storedProject) => [
              storedProject.originalKey,
              ...Object.values(storedProject.resultKeys),
            ])
            .filter((key): key is string => Boolean(key)),
        );

        projectStore.delete(project.id);
        for (const key of imageKeys) {
          if (!referencedImageKeys.has(key)) imageStore.delete(key);
        }
      };
      projectsRequest.onerror = () => reject(projectsRequest.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Het project kon niet worden verwijderd.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Het project kon niet worden verwijderd.'));
    });
    notifyPropertyStorageChanged(scope);
  } finally {
    db.close();
  }
}

export async function savePropertyImage(record: PropertyImageRecord, scope: StorageScope = null): Promise<void> {
  await put(IMAGES, record, scope);
}

export async function deletePropertyImage(key: string, scope: StorageScope = null): Promise<void> {
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      const projectsRequest = transaction.objectStore(PROJECTS).getAll();
      projectsRequest.onsuccess = () => {
        const projects = projectsRequest.result as PropertyProject[];
        const isReferenced = projects.some((project) => referencedProjectImageKeys(project).has(key));
        if (!isReferenced) transaction.objectStore(IMAGES).delete(key);
      };
      projectsRequest.onerror = () => reject(projectsRequest.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    notifyPropertyStorageChanged(scope);
  } finally {
    db.close();
  }
}

export async function loadPendingPropertyPhotoCleanup(scope: StorageScope = null): Promise<string[]> {
  const pending = await get<PendingPhotoCleanupRecord>(METADATA, PENDING_PHOTO_CLEANUP_KEY, scope);
  return [...new Set((pending?.imageKeys ?? []).filter((key): key is string => typeof key === 'string' && key.length > 0))];
}

export async function cleanupPendingPropertyImages(
  additionalKeys: string[] = [],
  scope: StorageScope = null,
): Promise<void> {
  const db = await openDb(scope);
  let operationError: unknown;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES, METADATA], 'readwrite');
      const projectStore = transaction.objectStore(PROJECTS);
      const imageStore = transaction.objectStore(IMAGES);
      const metadataStore = transaction.objectStore(METADATA);
      const projectsRequest = projectStore.getAll();
      const pendingRequest = metadataStore.get(PENDING_PHOTO_CLEANUP_KEY);
      let projects: PropertyProject[] | undefined;
      let pending: PendingPhotoCleanupRecord | undefined;
      let projectsLoaded = false;
      let pendingLoaded = false;
      let processed = false;

      const processCleanup = () => {
        if (!projectsLoaded || !pendingLoaded || processed) return;
        processed = true;
        try {
          const referencedKeys = new Set(projects!.flatMap((project) => [...referencedProjectImageKeys(project)]));
          const cleanupKeys = new Set([
            ...(pending?.imageKeys ?? []),
            ...additionalKeys,
          ].filter((key): key is string => typeof key === 'string' && key.length > 0));
          for (const key of cleanupKeys) {
            if (!referencedKeys.has(key)) imageStore.delete(key);
          }
          metadataStore.delete(PENDING_PHOTO_CLEANUP_KEY);
        } catch (error) {
          operationError = error;
          try {
            transaction.abort();
          } catch {
            // The transaction may already have stopped.
          }
        }
      };

      projectsRequest.onsuccess = () => {
        projects = projectsRequest.result as PropertyProject[];
        projectsLoaded = true;
        processCleanup();
      };
      pendingRequest.onsuccess = () => {
        pending = pendingRequest.result as PendingPhotoCleanupRecord | undefined;
        pendingLoaded = true;
        processCleanup();
      };
      projectsRequest.onerror = () => {
        operationError = projectsRequest.error ?? new Error('De opgeslagen projecten konden niet worden gelezen.');
        transaction.abort();
      };
      pendingRequest.onerror = () => {
        operationError = pendingRequest.error ?? new Error('De oude foto’s konden niet voor opruiming worden gelezen.');
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new Error('Oude foto’s konden niet veilig worden opgeruimd.'));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error('Oude foto’s konden niet veilig worden opgeruimd.'));
    });
    notifyPropertyStorageChanged(scope);
  } finally {
    db.close();
  }
}

export async function loadPropertyImage(key: string, scope: StorageScope = null): Promise<PropertyImageRecord | undefined> {
  return get<PropertyImageRecord>(IMAGES, key, scope);
}

export async function loadPropertyProjectPhotoState(
  id: string,
  scope: StorageScope = null,
): Promise<{
  project: PropertyProject;
  original?: PropertyImageRecord;
  results: Partial<Record<PropertyAction, PropertyImageRecord>>;
  missingOriginal: boolean;
  missingConcepts: PropertyAction[];
} | undefined> {
  const db = await openDb(scope);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readonly');
      const projectStore = transaction.objectStore(PROJECTS);
      const imageStore = transaction.objectStore(IMAGES);
      const projectRequest = projectStore.get(id);
      let project: PropertyProject | undefined;
      let original: PropertyImageRecord | undefined;
      const results: Partial<Record<PropertyAction, PropertyImageRecord>> = {};

      projectRequest.onsuccess = () => {
        project = projectRequest.result as PropertyProject | undefined;
        if (!project) return;

        if (project.originalKey) {
          const originalRequest = imageStore.get(project.originalKey);
          originalRequest.onsuccess = () => {
            original = originalRequest.result as PropertyImageRecord | undefined;
          };
        }
        for (const [action, key] of Object.entries(project.resultKeys)) {
          if (!key) continue;
          const imageRequest = imageStore.get(key);
          imageRequest.onsuccess = () => {
            const image = imageRequest.result as PropertyImageRecord | undefined;
            if (image) results[action as PropertyAction] = image;
          };
        }
      };
      projectRequest.onerror = () => reject(projectRequest.error ?? new Error('Het opgeslagen project kon niet worden gelezen.'));
      transaction.oncomplete = () => {
        if (!project) {
          resolve(undefined);
          return;
        }
        resolve({
          project,
          original,
          results,
          missingOriginal: Boolean(project.originalKey) && !original,
          missingConcepts: PROPERTY_ACTIONS.filter((action) => {
            const key = project!.resultKeys[action];
            return Boolean(key) && !results[action];
          }),
        });
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('De projectfoto’s konden niet worden gelezen.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('De projectfoto’s konden niet worden gelezen.'));
    });
  } finally {
    db.close();
  }
}

export async function loadPropertyProjectImages(project: Pick<PropertyProject, 'originalKey' | 'resultKeys'>, scope: StorageScope = null): Promise<{
  original?: PropertyImageRecord;
  results: Partial<Record<PropertyAction, PropertyImageRecord>>;
  missingOriginal: boolean;
  missingConcepts: PropertyAction[];
}> {
  const original = project.originalKey ? await loadPropertyImage(project.originalKey, scope) : undefined;
  const missingConcepts: PropertyAction[] = [];
  const results: Partial<Record<PropertyAction, PropertyImageRecord>> = {};
  for (const [action, key] of Object.entries(project.resultKeys)) {
    if (!key) continue;
    const image = await loadPropertyImage(key, scope);
    if (image) results[action as PropertyAction] = image;
    else missingConcepts.push(action as PropertyAction);
  }
  return {
    original,
    results,
    missingOriginal: Boolean(project.originalKey) && !original,
    missingConcepts,
  };
}

export async function exportPropertyProject(project: PropertyProject, scope: StorageScope = null): Promise<PropertyProjectArchive> {
  const imageKeys = [...new Set([
    ...(project.originalKey ? [project.originalKey] : []),
    ...Object.values(project.resultKeys).filter((key): key is string => Boolean(key)),
  ])];
  if (imageKeys.length && !project.originalKey) {
    throw new Error('Dit project kan niet volledig worden geëxporteerd: de bronfoto ontbreekt.');
  }

  const db = await openDb(scope);
  let records: PropertyImageRecord[];
  try {
    records = await new Promise<PropertyImageRecord[]>((resolve, reject) => {
      const transaction = db.transaction(IMAGES, 'readonly');
      const imageStore = transaction.objectStore(IMAGES);
      const requests = imageKeys.map((key) => imageStore.get(key));
      const found: PropertyImageRecord[] = [];
      let pending = requests.length;
      if (pending === 0) resolve(found);
      for (const request of requests) {
        request.onsuccess = () => {
          if (!request.result) {
            reject(new Error('Dit project kan niet volledig worden geëxporteerd: een bronfoto of gegenereerd concept ontbreekt in deze browser.'));
            return;
          }
          found.push(request.result as PropertyImageRecord);
          pending -= 1;
          if (pending === 0) resolve(found);
        };
        request.onerror = () => reject(request.error ?? new Error('Een projectfoto kon niet worden gelezen.'));
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('De projectfoto’s konden niet worden gelezen.'));
    });
  } finally {
    db.close();
  }

  const images = await Promise.all(records.map(async (image): Promise<ExportedPropertyImage> => ({
    key: image.key,
    label: image.label,
    mimeType: image.mimeType || image.blob.type,
    isConcept: image.isConcept,
    disclaimer: image.disclaimer,
    createdAt: image.createdAt,
    blobBase64: await blobToBase64(image.blob),
    sha256: await blobSha256(image.blob),
  })));
  const archive: PropertyProjectArchive = {
    format: 'realestatex-property-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    images,
  };
  validateArchive(archive);
  return archive;
}

export async function exportPropertyPortfolio(projects: PropertyProject[], scope: StorageScope = null): Promise<PropertyPortfolioArchive> {
  if (projects.length === 0) {
    throw new Error('Er zijn geen opgeslagen projecten om in een portfolio-back-up te bewaren.');
  }
  const archives = await Promise.all(projects.map((project) => exportPropertyProject(project, scope)));
  return {
    format: 'realestatex-property-portfolio',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: archives,
  };
}

type PreparedPropertyProject = {
  project: PropertyProject;
  images: PropertyImageRecord[];
};

async function prepareImportedPropertyProject(archive: PropertyProjectArchive): Promise<PreparedPropertyProject> {
  validateArchive(archive);
  const id = crypto.randomUUID();
  const keyMap = new Map<string, string>();
  const imageKinds = new Map<string, PropertyAction | 'original'>();
  if (archive.project.originalKey) imageKinds.set(archive.project.originalKey, 'original');
  for (const [action, key] of Object.entries(archive.project.resultKeys)) {
    if (key) imageKinds.set(key, action as PropertyAction);
  }
  for (const image of archive.images) {
    const kind = imageKinds.get(image.key);
    keyMap.set(image.key, `${id}-${kind}-${crypto.randomUUID()}`);
  }

  const project: PropertyProject = {
    ...archive.project,
    id,
    originalKey: archive.project.originalKey ? keyMap.get(archive.project.originalKey)! : '',
    resultKeys: Object.fromEntries(Object.entries(archive.project.resultKeys).map(([action, key]) => [
      action,
      key ? keyMap.get(key) : undefined,
    ])) as PropertyProject['resultKeys'],
  };
  const images: PropertyImageRecord[] = await Promise.all(archive.images.map(async (image) => {
    const blob = base64ToBlob(image.blobBase64, image.mimeType);
    if (await blobSha256(blob) !== image.sha256) {
      importError(`foto “${image.label}” is beschadigd of tijdens het overzetten gewijzigd.`);
    }
    return {
      key: keyMap.get(image.key)!,
      blob,
      label: image.label,
      mimeType: image.mimeType,
      isConcept: image.isConcept,
      disclaimer: image.disclaimer,
      createdAt: image.createdAt,
    };
  }));

  return { project, images };
}

function portfolioRestoreStorageError(cause: unknown): Error {
  const error = typeof cause === 'object' && cause !== null ? cause as { name?: unknown; message?: unknown } : null;
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';

  if (name === 'QuotaExceededError') {
    return new Error('De portfolio-back-up is niet hersteld: er is onvoldoende browseropslagruimte. Verwijder ongebruikte projecten of maak ruimte vrij en probeer opnieuw. Er is niets toegevoegd.');
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new Error('De portfolio-back-up is niet hersteld: RealEstateX heeft geen toegang tot browseropslag. Sta siteopslag toe in je browserinstellingen en probeer opnieuw. Er is niets toegevoegd.');
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return new Error('De portfolio-back-up is niet hersteld: browseropslag is niet beschikbaar. Sluit andere RealEstateX-tabbladen, controleer of siteopslag is toegestaan en probeer opnieuw. Er is niets toegevoegd.');
  }
  if (message.startsWith('Lokale projectopslag wordt nog gebruikt')) {
    return new Error(`${message} Er is niets toegevoegd.`);
  }
  return new Error('De portfolio-back-up is niet hersteld door een fout bij het opslaan in browseropslag. Controleer of browseropslag beschikbaar is en probeer opnieuw. Er is niets toegevoegd.');
}

async function writeImportedProjectsAtomically(preparedProjects: PreparedPropertyProject[], scope: StorageScope = null): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb(scope);
  } catch (error) {
    throw portfolioRestoreStorageError(error);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      } catch (error) {
        reject(portfolioRestoreStorageError(error));
        return;
      }
      let failureCause: unknown;
      transaction.addEventListener('error', (event) => {
        const failedRequest = event.target as IDBRequest | null;
        failureCause ??= failedRequest?.error ?? transaction.error;
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        failureCause ??= transaction.error;
      };
      transaction.onabort = () => reject(portfolioRestoreStorageError(failureCause ?? transaction.error));
      try {
        const projectStore = transaction.objectStore(PROJECTS);
        const imageStore = transaction.objectStore(IMAGES);
        for (const { project, images } of preparedProjects) {
          projectStore.add(project);
          for (const image of images) imageStore.add(image);
        }
      } catch (error) {
        failureCause ??= error;
        try {
          transaction.abort();
        } catch {
          reject(portfolioRestoreStorageError(failureCause));
        }
      }
    });
    notifyPropertyStorageChanged(scope);
  } catch (error) {
    if (error instanceof Error && /er is niets toegevoegd/i.test(error.message)) throw error;
    throw portfolioRestoreStorageError(error);
  } finally {
    db.close();
  }
}

export async function importPropertyProject(archiveInput: unknown, scope: StorageScope = null): Promise<PropertyProject> {
  validateArchive(archiveInput);
  return withPropertyProjectImportLock(scope, () => importPropertyProjectUnlocked(archiveInput, scope));
}

export async function importPropertyProjectUnlessDuplicate(
  archiveInput: unknown,
  scope: StorageScope = null,
): Promise<{ status: 'imported'; project: PropertyProject } | { status: 'duplicate'; existing: PropertyProject }> {
  validateArchive(archiveInput);
  return withPropertyProjectImportLock(scope, async () => {
    const existing = await findMatchingSavedPropertyProject(archiveInput, scope);
    if (existing) return { status: 'duplicate', existing };
    return {
      status: 'imported',
      project: await importPropertyProjectUnlocked(archiveInput, scope),
    };
  });
}

function withPropertyProjectImportLock<T>(scope: StorageScope, operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return Promise.reject(new Error('Deze browser ondersteunt geen veilige gelijktijdige projectimport. Open de back-up in een browser die vergrendelde opslag ondersteunt.'));
  }
  return navigator.locks
    .request<Promise<T>>(`${PROPERTY_PROJECT_IMPORT_LOCK_NAME}:${storageScopeKey(scope)}`, { mode: 'exclusive' }, operation)
    .then((result) => result);
}

async function importPropertyProjectUnlocked(archiveInput: unknown, scope: StorageScope): Promise<PropertyProject> {
  validateArchive(archiveInput);
  const prepared = await prepareImportedPropertyProject(archiveInput);
  const db = await openDb(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      transaction.objectStore(PROJECTS).put(prepared.project);
      const imageStore = transaction.objectStore(IMAGES);
      for (const image of prepared.images) imageStore.put(image);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Het project kon niet in deze browser worden opgeslagen.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Het project kon niet volledig in deze browser worden opgeslagen.'));
    });
    notifyPropertyStorageChanged(scope);
  } finally {
    db.close();
  }
  return prepared.project;
}

export async function importPropertyPortfolio(portfolioInput: unknown, scope: StorageScope = null): Promise<PropertyProject[]> {
  validatePortfolioArchive(portfolioInput);
  const preparedProjects: PreparedPropertyProject[] = [];
  for (const archive of portfolioInput.projects) {
    preparedProjects.push(await prepareImportedPropertyProject(archive));
  }
  await writeImportedProjectsAtomically(preparedProjects, scope);
  return preparedProjects.map(({ project }) => project);
}

function requireAccountId(accountId: string): void {
  if (!accountId.trim()) throw new Error('Meld je aan voordat je lokale vastgoedprojecten opent.');
}

export async function getLegacyProjectClaimStatus(accountId: string): Promise<LegacyProjectClaimStatus> {
  requireAccountId(accountId);
  const db = await openDb(null);
  try {
    return await new Promise<LegacyProjectClaimStatus>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, METADATA], 'readonly');
      const countRequest = transaction.objectStore(PROJECTS).count();
      const claimRequest = transaction.objectStore(METADATA).get(LEGACY_CLAIM_KEY);
      let projectCount: number | undefined;
      let claim: LegacyClaimRecord | undefined;
      let claimLoaded = false;
      countRequest.onsuccess = () => { projectCount = countRequest.result; };
      claimRequest.onsuccess = () => {
        claim = claimRequest.result as LegacyClaimRecord | undefined;
        claimLoaded = true;
      };
      transaction.oncomplete = () => {
        if (projectCount === undefined || !claimLoaded) {
          reject(new Error('De oudere browserprojecten konden niet worden gecontroleerd.'));
          return;
        }
        if (claim?.status === 'claimed') {
          resolve({ status: claim.accountId === accountId ? 'claimed' : 'unavailable', projectCount: 0 });
          return;
        }
        if (claim?.status === 'claiming') {
          if (claim.accountId !== accountId) {
            resolve({ status: 'unavailable', projectCount: 0 });
            return;
          }
          const reservationIsStale = Date.now() - claim.updatedAt >= LEGACY_CLAIM_STALE_AFTER_MS;
          resolve({
            status: reservationIsStale ? (projectCount > 0 ? 'available' : 'none') : 'in-progress',
            projectCount: reservationIsStale ? projectCount : 0,
          });
          return;
        }
        resolve(projectCount > 0
          ? { status: 'available', projectCount }
          : { status: 'none', projectCount: 0 });
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('De oudere browserprojecten konden niet worden gecontroleerd.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('De oudere browserprojecten konden niet worden gecontroleerd.'));
    });
  } finally {
    db.close();
  }
}

type LegacyClaimReservation = {
  status: 'reserved' | 'none' | 'already-claimed' | 'unavailable' | 'in-progress';
  token?: string;
};

async function reserveLegacyProjectClaim(accountId: string): Promise<LegacyClaimReservation> {
  const db = await openDb(null);
  try {
    return await new Promise<LegacyClaimReservation>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, METADATA], 'readwrite');
      const projectsStore = transaction.objectStore(PROJECTS);
      const metadataStore = transaction.objectStore(METADATA);
      const countRequest = projectsStore.count();
      const claimRequest = metadataStore.get(LEGACY_CLAIM_KEY);
      let projectCount: number | undefined;
      let claim: LegacyClaimRecord | undefined;
      let claimLoaded = false;
      let result: LegacyClaimReservation = { status: 'none' };
      let resultReady = false;
      const decide = () => {
        if (projectCount === undefined || !claimLoaded || resultReady) return;
        resultReady = true;
        if (projectCount === 0) {
          result = { status: 'none' };
          return;
        }
        if (claim?.status === 'claimed') {
          result = { status: claim.accountId === accountId ? 'already-claimed' : 'unavailable' };
          return;
        }
        const staleSameAccountReservation = claim?.status === 'claiming'
          && claim.accountId === accountId
          && Date.now() - claim.updatedAt >= LEGACY_CLAIM_STALE_AFTER_MS;
        if (claim?.status === 'claiming' && !staleSameAccountReservation) {
          result = { status: claim.accountId === accountId ? 'in-progress' : 'unavailable' };
          return;
        }
        const token = crypto.randomUUID();
        metadataStore.put({
          key: LEGACY_CLAIM_KEY,
          accountId,
          status: 'claiming',
          token,
          updatedAt: Date.now(),
        } satisfies LegacyClaimRecord);
        result = { status: 'reserved', token };
      };
      countRequest.onsuccess = () => {
        projectCount = countRequest.result;
        decide();
      };
      claimRequest.onsuccess = () => {
        claim = claimRequest.result as LegacyClaimRecord | undefined;
        claimLoaded = true;
        decide();
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('De oudere browserprojecten konden niet veilig worden geclaimd.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('De oudere browserprojecten konden niet veilig worden geclaimd.'));
    });
  } finally {
    db.close();
  }
}

async function releaseLegacyProjectClaim(accountId: string, token: string): Promise<void> {
  const db = await openDb(null);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA, 'readwrite');
      const store = transaction.objectStore(METADATA);
      const request = store.get(LEGACY_CLAIM_KEY);
      request.onsuccess = () => {
        const claim = request.result as LegacyClaimRecord | undefined;
        if (claim?.accountId === accountId && claim.token === token && claim.status === 'claiming') {
          store.delete(LEGACY_CLAIM_KEY);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function writeLegacyProjectsAtomically(
  preparedProjects: PreparedPropertyProject[],
  accountId: string,
): Promise<number> {
  const db = await openDb(accountId);
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES, METADATA], 'readwrite');
      const projectStore = transaction.objectStore(PROJECTS);
      const imageStore = transaction.objectStore(IMAGES);
      const metadataStore = transaction.objectStore(METADATA);
      const markerRequest = metadataStore.get(ACCOUNT_LEGACY_IMPORT_KEY);
      let importedCount = preparedProjects.length;
      let markerRead = false;
      markerRequest.onsuccess = () => {
        markerRead = true;
        const marker = markerRequest.result as { key: string; importedCount: number } | undefined;
        if (marker) {
          importedCount = marker.importedCount;
          return;
        }
        try {
          for (const { project, images } of preparedProjects) {
            projectStore.add(project);
            for (const image of images) imageStore.add(image);
          }
          metadataStore.add({ key: ACCOUNT_LEGACY_IMPORT_KEY, importedCount });
        } catch {
          try {
            transaction.abort();
          } catch {
            // The transaction may already have stopped.
          }
        }
      };
      transaction.oncomplete = () => {
        if (!markerRead) {
          reject(new Error('Oude browserprojecten konden niet veilig worden overgezet.'));
          return;
        }
        resolve(importedCount);
      };
      transaction.onerror = () => reject(new Error('Oude browserprojecten konden niet veilig worden overgezet. Er is niets gewijzigd.'));
      transaction.onabort = () => reject(new Error('Oude browserprojecten konden niet veilig worden overgezet. Er is niets gewijzigd.'));
    });
  } finally {
    db.close();
  }
}

async function completeLegacyProjectClaim(accountId: string, token: string, importedCount: number): Promise<void> {
  const db = await openDb(null);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA, 'readwrite');
      const store = transaction.objectStore(METADATA);
      const request = store.get(LEGACY_CLAIM_KEY);
      let claimMismatch = false;
      request.onsuccess = () => {
        const claim = request.result as LegacyClaimRecord | undefined;
        if (claim?.accountId !== accountId || claim.token !== token || claim.status !== 'claiming') {
          claimMismatch = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already have stopped.
          }
          return;
        }
        store.put({ ...claim, status: 'claimed', importedCount, updatedAt: Date.now() } satisfies LegacyClaimRecord);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('De claim van oude browserprojecten kon niet worden bevestigd.'));
      transaction.onabort = () => reject(claimMismatch
        ? new Error('De claimstatus is gewijzigd. Vernieuw de projectlijst voordat je opnieuw probeert.')
        : transaction.error ?? new Error('De claim van oude browserprojecten kon niet worden bevestigd.'));
    });
  } finally {
    db.close();
  }
}

export async function claimLegacyPropertyProjects(accountId: string): Promise<{
  status: 'claimed' | 'already-claimed' | 'none' | 'unavailable' | 'in-progress';
  importedCount: number;
}> {
  requireAccountId(accountId);
  const reservation = await reserveLegacyProjectClaim(accountId);
  if (reservation.status !== 'reserved') {
    return {
      status: reservation.status,
      importedCount: reservation.status === 'already-claimed' ? (await getLegacyProjectClaimStatus(accountId)).projectCount : 0,
    };
  }
  if (!reservation.token) throw new Error('De claim van oudere browserprojecten kon niet worden gestart.');

  let targetCopyCommitted = false;
  try {
    const legacyProjects = await loadPropertyProjects(null);
    if (legacyProjects.length === 0) {
      await releaseLegacyProjectClaim(accountId, reservation.token);
      return { status: 'none', importedCount: 0 };
    }
    const archives = await Promise.all(legacyProjects.map((project) => exportPropertyProject(project, null)));
    const preparedProjects: PreparedPropertyProject[] = [];
    for (const archive of archives) preparedProjects.push(await prepareImportedPropertyProject(archive));
    const importedCount = await writeLegacyProjectsAtomically(preparedProjects, accountId);
    targetCopyCommitted = true;
    await completeLegacyProjectClaim(accountId, reservation.token, importedCount);
    notifyPropertyStorageChanged(accountId);
    notifyLegacyProjectClaimChanged();
    return { status: 'claimed', importedCount };
  } catch (error) {
    if (!targetCopyCommitted) {
      await releaseLegacyProjectClaim(accountId, reservation.token).catch(() => undefined);
    }
    throw error;
  }
}

export function createPropertyProjectStorage(accountId: string) {
  requireAccountId(accountId);
  return {
    subscribePropertyStorageChanges: (subscriber: () => void) => subscribePropertyStorageChanges(subscriber, accountId),
    loadPropertyProjectSortOrderPreference: () => loadPropertyProjectSortOrderPreference(accountId),
    savePropertyProjectSortOrderPreference: (order: PropertyProjectSortOrder) => savePropertyProjectSortOrderPreference(order, accountId),
    savePropertyProject: (project: PropertyProject) => savePropertyProject(project, accountId),
    updatePropertyProject: (project: PropertyProject) => updatePropertyProject(project, accountId),
    savePropertyProjectWithImage: (project: PropertyProject, image: PropertyImageRecord) => savePropertyProjectWithImage(project, image, accountId),
    replacePropertySourceImage: (
      projectId: string,
      image: PropertyImageRecord,
      preserveConcepts: boolean,
      existingConceptKeys: Partial<Record<PropertyAction, string>>,
    ) => replacePropertySourceImage(projectId, image, preserveConcepts, existingConceptKeys, accountId),
    loadPendingPropertyPhotoCleanup: () => loadPendingPropertyPhotoCleanup(accountId),
    cleanupPendingPropertyImages: (additionalKeys?: string[]) =>
      cleanupPendingPropertyImages(additionalKeys, accountId),
    savePropertyConceptImage: (projectId: string, action: PropertyAction, image: PropertyImageRecord, splitRatio: number) =>
      savePropertyConceptImage(projectId, action, image, splitRatio, accountId),
    loadPropertyProjects: () => loadPropertyProjects(accountId),
    findMatchingSavedPropertyProject: (archive: unknown) => findMatchingSavedPropertyProject(archive, accountId),
    loadPropertyProjectsWithPhotoHealth: () => loadPropertyProjectsWithPhotoHealth(accountId),
    loadPropertyProject: (id: string) => loadPropertyProject(id, accountId),
    loadLatestPropertyProject: () => loadLatestPropertyProject(accountId),
    deletePropertyProject: (project: Pick<PropertyProject, 'id' | 'originalKey' | 'resultKeys'>) => deletePropertyProject(project, accountId),
    savePropertyImage: (record: PropertyImageRecord) => savePropertyImage(record, accountId),
    deletePropertyImage: (key: string) => deletePropertyImage(key, accountId),
    loadPropertyImage: (key: string) => loadPropertyImage(key, accountId),
    loadPropertyProjectPhotoState: (id: string) => loadPropertyProjectPhotoState(id, accountId),
    loadPropertyProjectImages: (project: Pick<PropertyProject, 'originalKey' | 'resultKeys'>) => loadPropertyProjectImages(project, accountId),
    exportPropertyProject: (project: PropertyProject) => exportPropertyProject(project, accountId),
    exportPropertyPortfolio: (projects: PropertyProject[]) => exportPropertyPortfolio(projects, accountId),
    importPropertyProject: (archive: unknown) => importPropertyProject(archive, accountId),
    importPropertyProjectUnlessDuplicate: (archive: unknown) => importPropertyProjectUnlessDuplicate(archive, accountId),
    importPropertyPortfolio: (portfolio: unknown) => importPropertyPortfolio(portfolio, accountId),
    getLegacyProjectClaimStatus: () => getLegacyProjectClaimStatus(accountId),
    claimLegacyPropertyProjects: () => claimLegacyPropertyProjects(accountId),
  };
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [header, payload] = dataUrl.split(',');
  const mimeType = header.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}