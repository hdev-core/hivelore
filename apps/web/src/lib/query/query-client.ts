import { QueryClient } from '@tanstack/react-query';

export const queryClientDefaults = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
} satisfies ConstructorParameters<typeof QueryClient>[0];

export function createQueryClient() {
  return new QueryClient(queryClientDefaults);
}
