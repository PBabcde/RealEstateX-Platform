export * from './application-account.fixture';

declare global {
  interface Window {
    __innovationSubmissions?: Array<Record<string, unknown>>;
    __innovationShouldFail?: boolean;
  }
}

export async function customFetch<T = unknown>(_url: string, init?: RequestInit): Promise<T> {
  if (window.__innovationShouldFail) throw new Error('Simulated public lead connection failure');
  const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  window.__innovationSubmissions ??= [];
  window.__innovationSubmissions.push(payload);
  return { ok: true, created: true } as T;
}
