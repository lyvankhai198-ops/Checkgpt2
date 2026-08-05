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
