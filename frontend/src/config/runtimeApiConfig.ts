export type StorageMode = 'kiyo_cloud' | 'self_hosted' | 'local_admin';

export type RuntimeApiConfig = {
  mode: StorageMode;
  kiyoCloudUrl?: string;
  selfHostedApiUrl?: string;
  localApiUrl?: string;
  apiBaseUrl?: string;
};

const STORAGE_KEY = 'kiyo_runtime_api_config_v1';
const modes: StorageMode[] = ['kiyo_cloud', 'self_hosted', 'local_admin'];

declare global {
  interface Window {
    __KIYO_RUNTIME_API_CONFIG__?: Partial<RuntimeApiConfig>;
  }
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

function isMode(value: unknown): value is StorageMode {
  return typeof value === 'string' && modes.includes(value as StorageMode);
}

function readStoredConfig(): Partial<RuntimeApiConfig> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function environmentConfig(): Partial<RuntimeApiConfig> {
  const env = (import.meta as any).env;
  return {
    mode: isMode(env.VITE_STORAGE_MODE) ? env.VITE_STORAGE_MODE : undefined,
    kiyoCloudUrl: normalizeUrl(env.VITE_KIYO_CLOUD_API_URL ?? env.VITE_API_URL),
    selfHostedApiUrl: normalizeUrl(env.VITE_SELF_HOSTED_API_URL),
    localApiUrl: normalizeUrl(env.VITE_LOCAL_API_URL),
  };
}

export function getRuntimeApiConfig(): RuntimeApiConfig {
  const merged = { ...environmentConfig(), ...readStoredConfig(), ...(window.__KIYO_RUNTIME_API_CONFIG__ ?? {}) };
  return {
    mode: isMode(merged.mode) ? merged.mode : 'kiyo_cloud',
    kiyoCloudUrl: normalizeUrl(merged.kiyoCloudUrl),
    selfHostedApiUrl: normalizeUrl(merged.selfHostedApiUrl),
    localApiUrl: normalizeUrl(merged.localApiUrl),
    apiBaseUrl: normalizeUrl(merged.apiBaseUrl),
  };
}

export function resolveApiBaseUrl(config = getRuntimeApiConfig()): string {
  if (config.apiBaseUrl) return config.apiBaseUrl;
  if (config.mode === 'local_admin' && config.localApiUrl) return config.localApiUrl;
  if (config.mode === 'self_hosted' && config.selfHostedApiUrl) return config.selfHostedApiUrl;
  return config.kiyoCloudUrl ?? '/api/v1';
}

export function saveRuntimeApiConfig(config: Partial<RuntimeApiConfig>): RuntimeApiConfig {
  const current = getRuntimeApiConfig();
  const next = { ...current, ...config };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser private mode or a restricted WebView may refuse persistent storage.
  }
  return next;
}
