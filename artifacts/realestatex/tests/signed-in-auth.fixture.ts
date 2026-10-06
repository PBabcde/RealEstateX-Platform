import type { AuthUser } from '@workspace/api-client-react';

const testUser: AuthUser = {
  id: 'photo-recovery-browser-test',
  email: 'photo-recovery@example.invalid',
  firstName: 'Studio',
  lastName: 'Test',
  profileImageUrl: null,
  role: 'member',
};

export function useAuth() {
  return {
    user: testUser,
    isLoading: false,
    isAuthenticated: true,
    login() {},
    logout() {},
  };
}
