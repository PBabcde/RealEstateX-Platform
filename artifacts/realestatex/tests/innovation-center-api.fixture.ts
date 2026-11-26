import { useMutation } from '@tanstack/react-query';
import type { CrmContactInput, CrmContactRecord } from '../../../lib/api-client-react/src/generated/api.schemas';

export * from './application-account.fixture';

declare global {
  interface Window {
    __innovationSubmissions?: CrmContactInput[];
    __innovationShouldFail?: boolean;
  }
}

export function useCreateCrmContact() {
  return useMutation<CrmContactRecord, Error, { data: CrmContactInput }>({
    mutationFn: async ({ data }) => {
      if (window.__innovationShouldFail) {
        throw new Error('Simulated CRM connection failure');
      }
      window.__innovationSubmissions ??= [];
      window.__innovationSubmissions.push(data);
      const now = new Date().toISOString();
      return {
        ...data,
        contactId: `innovation-test-${window.__innovationSubmissions.length}`,
        status: data.status ?? 'ACTIVE',
        ownerId: 'innovation-test-user',
        createdAt: now,
        updatedAt: now,
      };
    },
  });
}
