import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isStandaloneMode } from './platformConfig';
import { standaloneClient } from './standaloneClient';

export const base44 = (() => {
  if (isStandaloneMode) {
    return standaloneClient;
  }

  const { appId, serverUrl, token, functionsVersion } = appParams;

  return createClient({
    appId,
    serverUrl,
    token,
    functionsVersion,
    requiresAuth: false
  });
})();
