export * from '../../../lib/api-client-react/src/index';
import { useQuery } from '@tanstack/react-query';

// Only the isolated photo/storage UI test uses this account. Real auth tests
// must use Clerk and the server's JIT bridge, never this fixture.
export function useGetAccount() {
  return useQuery({
    queryKey: ['/api/account'],
    queryFn: async () => ({
      id: 'photo-recovery-browser-test',
      role: 'member' as const,
      tenantId: '00000000-0000-0000-0000-000000000001',
    }),
    initialData: {
      id: 'photo-recovery-browser-test',
      role: 'member' as const,
      tenantId: '00000000-0000-0000-0000-000000000001',
    },
    staleTime: Infinity,
  });
}
