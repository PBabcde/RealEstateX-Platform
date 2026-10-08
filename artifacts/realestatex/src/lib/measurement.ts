import { useSyncExternalStore } from 'react';
import { customFetch } from '@workspace/api-client-react';

const CONSENT_KEY = 'realestatex_measurement_consent_v1';
const SESSION_KEY = 'realestatex_visit_session';
const CONSENT_EVENT = 'realestatex-measurement-consent';

export type MeasurementConsent = 'granted' | 'denied' | 'unset';

export function readMeasurementConsent(): MeasurementConsent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : 'unset';
  } catch {
    return 'unset';
  }
}

export function setMeasurementConsent(value: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
    if (value === 'denied') window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Without storage the choice only applies to this page view.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CONSENT_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useMeasurementConsent(): MeasurementConsent {
  return useSyncExternalStore(subscribe, readMeasurementConsent, () => 'unset' as const);
}

function visitSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return '';
  }
}

export function trackPageView(path: string): void {
  if (readMeasurementConsent() !== 'granted') return;
  const sessionId = visitSessionId();
  if (!sessionId) return;
  void customFetch('/api/public/traffic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consent: true,
      sessionId,
      eventType: 'page_view',
      pageUrl: path,
      referrer: document.referrer || undefined,
    }),
    responseType: 'text',
  }).catch(() => undefined);
}
