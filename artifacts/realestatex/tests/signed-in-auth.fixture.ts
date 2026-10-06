import { useEffect, useState, type ReactNode } from 'react';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account';

const testUser = {
  id: `${PROPERTY_STORAGE_TEST_ACCOUNT_ID}-clerk-user`,
  externalId: PROPERTY_STORAGE_TEST_ACCOUNT_ID,
  primaryEmailAddress: { emailAddress: 'photo-recovery@example.invalid' },
  firstName: 'Studio',
  lastName: 'Test',
};
let activeTestUser = testUser;

declare global {
  interface Window {
    __setPropertyTestUser?: (userId: string, externalId?: string | null) => void;
  }
}

if (typeof window !== 'undefined') {
  window.__setPropertyTestUser = (userId: string, externalId: string | null = userId) => {
    activeTestUser = { ...testUser, id: userId, externalId };
    window.dispatchEvent(new Event('property-test-user-changed'));
  };
}

export function useUser() {
  const [user, setUser] = useState(activeTestUser);
  useEffect(() => {
    const update = () => setUser(activeTestUser);
    window.addEventListener('property-test-user-changed', update);
    return () => window.removeEventListener('property-test-user-changed', update);
  }, []);
  return { user, isLoaded: true };
}
export function useAuth() {
  return { isLoaded: true, isSignedIn: true };
}
export function useClerk() {
  return {
    signOut() {},
    addListener() { return () => {}; },
  };
}
export function ClerkProvider({ children }: { children: ReactNode }) { return children; }
export function Show({ children, when }: { children: ReactNode; when: string }) {
  return when === 'signed-in' ? children : null;
}
export function SignIn() { return null; }
export function SignUp() { return null; }
