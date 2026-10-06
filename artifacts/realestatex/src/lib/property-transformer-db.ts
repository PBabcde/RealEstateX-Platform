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

const DB_NAME = 'realestatex-property-transformer';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const IMAGES = 'images';
const PROPERTY_ACTIONS: PropertyAction[] = ['declutter', 'stage', 'makeover', 'dusk'];
const PROPERTY_STYLES: PropertyStyle[] = ['japandi', 'modern', 'industrial'];

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
  if (!isRecord(value) || value.format !== 'realestatex-property-project' || value.version !== 1) {
    importError('dit is geen ondersteunde RealEstateX-projectexport.');
  }
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function savePropertyProject(project: PropertyProject): Promise<void> {
  await put(PROJECTS, project);
}

export async function savePropertyProjectWithImage(project: PropertyProject, image: PropertyImageRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      transaction.objectStore(PROJECTS).put(project);
      transaction.objectStore(IMAGES).put(image);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPropertyProjects(): Promise<PropertyProject[]> {
  const db = await openDb();
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

export async function findMatchingSavedPropertyProject(archiveInput: unknown): Promise<PropertyProject | undefined> {
  validateArchive(archiveInput);
  const archive = archiveInput;
  const archivedDetails = duplicateProjectDetails(archive.project);
  const archiveImageFingerprints = new Map(archive.images.map((image) => [
    image.key,
    JSON.stringify({ sha256: image.sha256, mimeType: image.mimeType, isConcept: image.isConcept }),
  ]));
  const archivedFingerprint = duplicateProjectFingerprint(archive.project, archiveImageFingerprints);

  const db = await openDb();
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

export async function loadPropertyProjectsWithPhotoHealth(): Promise<{
  projects: PropertyProject[];
  photoHealthById: Record<string, PropertyProjectPhotoHealth>;
}> {
  const db = await openDb();
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

export async function loadPropertyProject(id: string): Promise<PropertyProject | undefined> {
  return get<PropertyProject>(PROJECTS, id);
}

export async function loadLatestPropertyProject(): Promise<PropertyProject | undefined> {
  return (await loadPropertyProjects())[0];
}

export async function deletePropertyProject(project: Pick<PropertyProject, 'id' | 'originalKey' | 'resultKeys'>): Promise<void> {
  const db = await openDb();
  const imageKeys = new Set([project.originalKey, ...Object.values(project.resultKeys)].filter((key): key is string => Boolean(key)));
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      transaction.objectStore(PROJECTS).delete(project.id);
      const imageStore = transaction.objectStore(IMAGES);
      for (const key of imageKeys) imageStore.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function savePropertyImage(record: PropertyImageRecord): Promise<void> {
  await put(IMAGES, record);
}

export async function deletePropertyImage(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IMAGES, 'readwrite');
      transaction.objectStore(IMAGES).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPropertyImage(key: string): Promise<PropertyImageRecord | undefined> {
  return get<PropertyImageRecord>(IMAGES, key);
}

export async function loadPropertyProjectImages(project: Pick<PropertyProject, 'originalKey' | 'resultKeys'>): Promise<{
  original?: PropertyImageRecord;
  results: Partial<Record<PropertyAction, PropertyImageRecord>>;
  missingOriginal: boolean;
  missingConcepts: PropertyAction[];
}> {
  const original = project.originalKey ? await loadPropertyImage(project.originalKey) : undefined;
  const missingConcepts: PropertyAction[] = [];
  const results: Partial<Record<PropertyAction, PropertyImageRecord>> = {};
  for (const [action, key] of Object.entries(project.resultKeys)) {
    if (!key) continue;
    const image = await loadPropertyImage(key);
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

export async function exportPropertyProject(project: PropertyProject): Promise<PropertyProjectArchive> {
  const imageKeys = [...new Set([
    ...(project.originalKey ? [project.originalKey] : []),
    ...Object.values(project.resultKeys).filter((key): key is string => Boolean(key)),
  ])];
  if (imageKeys.length && !project.originalKey) {
    throw new Error('Dit project kan niet volledig worden geëxporteerd: de bronfoto ontbreekt.');
  }

  const db = await openDb();
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

export async function importPropertyProject(archiveInput: unknown): Promise<PropertyProject> {
  validateArchive(archiveInput);
  const archive = archiveInput;
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

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PROJECTS, IMAGES], 'readwrite');
      transaction.objectStore(PROJECTS).put(project);
      const imageStore = transaction.objectStore(IMAGES);
      for (const image of images) imageStore.put(image);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Het project kon niet in deze browser worden opgeslagen.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Het project kon niet volledig in deze browser worden opgeslagen.'));
    });
  } finally {
    db.close();
  }
  return project;
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