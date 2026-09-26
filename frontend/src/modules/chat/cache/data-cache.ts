'use client';

// Module-level cache: tồn tại mãi mãi, không bị mất khi component unmount
const cache = new Map<string, { data: any; time: number }>();
const TTL = 5 * 60 * 1000; // 5 phút

export function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: any) {
  cache.set(key, { data, time: Date.now() });
}

// Cache cho sidebar data (servers, channels, DMs)
let serversPromise: Promise<any> | null = null;
let channelsPromise: Promise<any> | null = null;
let dmsPromise: Promise<any> | null = null;

export function getCachedServers(fetchFn: () => Promise<any>): Promise<any> {
  const cached = getCached('servers');
  if (cached) return Promise.resolve({ success: true, data: cached });
  if (!serversPromise) {
    serversPromise = fetchFn().then(r => {
      if (r.success) setCache('servers', r.data);
      serversPromise = null;
      return r;
    }).catch(e => { serversPromise = null; throw e; });
  }
  return serversPromise;
}

export function getCachedChannels(fetchFn: () => Promise<any>): Promise<any> {
  const cached = getCached('channels');
  if (cached) return Promise.resolve({ success: true, data: cached });
  if (!channelsPromise) {
    channelsPromise = fetchFn().then(r => {
      if (r.success) setCache('channels', r.data);
      channelsPromise = null;
      return r;
    }).catch(e => { channelsPromise = null; throw e; });
  }
  return channelsPromise;
}

export function getCachedDMs(fetchFn: () => Promise<any>): Promise<any> {
  const cached = getCached('dms');
  if (cached) return Promise.resolve({ success: true, data: cached });
  if (!dmsPromise) {
    dmsPromise = fetchFn().then(r => {
      if (r.success) setCache('dms', r.data);
      dmsPromise = null;
      return r;
    }).catch(e => { dmsPromise = null; throw e; });
  }
  return dmsPromise;
}
