import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isStandaloneMode } from './platformConfig';
import { standaloneClient } from './standaloneClient';

const { appId, serverUrl, token, functionsVersion } = appParams;

const base44SdkClient = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

export const base44 = isStandaloneMode ? standaloneClient : base44SdkClient;
