import { createClient } from "@base44/sdk";
import { appParams } from "@/lib/app-params";
import {
  isSelfHostedBackendEnabled,
  selfHostedBase44Client,
} from "@/api/selfHostClient";

const { appId, serverUrl, token, functionsVersion } = appParams;

const base44CloudClient = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false,
});

export const base44 = isSelfHostedBackendEnabled
  ? selfHostedBase44Client
  : base44CloudClient;
