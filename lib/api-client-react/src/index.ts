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

// ─── Bulk delete keys ─────────────────────────────────────────────────────────

export const useDeleteAllKeys = () => {
  return (scope: "expired_revoked" | "expired" | "revoked" | "inactive" | "all") =>
    customFetch(`/api/admin/keys?scope=${scope}`, { method: 'DELETE' }) as Promise<{ ok: boolean; deleted: number }>;
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

