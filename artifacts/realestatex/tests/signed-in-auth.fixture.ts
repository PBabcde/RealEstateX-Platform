import type { ReactNode } from 'react';

const testUser = {
  id: 'photo-recovery-browser-test',
  externalId: null,
  primaryEmailAddress: { emailAddress: 'photo-recovery@example.invalid' },
  firstName: 'Studio',
  lastName: 'Test',
};

export function useUser() {
  return { user: testUser, isLoaded: true };
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
