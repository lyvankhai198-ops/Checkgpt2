export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

import { useMutation } from '@tanstack/react-query';
import { customFetch } from './custom-fetch';

export const useResetUserTrial = () => {
  return useMutation({
    mutationFn: (data: { telegramId: string }) => {
      return customFetch(`/api/admin/users/${data.telegramId}/reset-trial`, {
        method: 'POST',
      });
    }
  });
};

// ─── Plans ────────────────────────────────────────────────────────────────────

export const useAdminGetPlans = () => {
  return () => customFetch('/api/admin/plans', { method: 'GET' }) as Promise<any[]>;
};

export const useAdminUpdatePlan = () => {
  return (slug: string, data: Record<string, unknown>) =>
    customFetch(`/api/admin/plans/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
};

