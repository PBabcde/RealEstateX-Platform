export type PropertyStyle = 'japandi' | 'modern' | 'industrial';
export type PropertyAction = 'declutter' | 'stage' | 'makeover' | 'dusk';

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

const DB_NAME = 'realestatex-property-transformer';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const IMAGES = 'images';

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
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [header, payload] = dataUrl.split(',');
  const mimeType = header.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}