type CacheEntry = {
  value: string;
  expiresAt: number;
};

const runtimeToolCache = new Map<string, CacheEntry>();

const runtimeStats = {
  hits: 0,
  misses: 0,
};

export function getCacheStats() {
  const total = runtimeStats.hits + runtimeStats.misses;
  return {
    hits: runtimeStats.hits,
    misses: runtimeStats.misses,
    cache_hit_rate: total > 0 ? runtimeStats.hits / total : 0,
  };
}

function sortObject(value: any): any {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(input: any): string {
  return JSON.stringify(sortObject(input));
}

function getTTLms(toolName: string): number {
  if (toolName === "list_tasks") return 10 * 60 * 1000;
  if (toolName === "recall_memory") return 60 * 60 * 1000;
  if (toolName === "calendar_snapshot") return 10 * 60 * 1000;
  if (toolName === "emails_snapshot") return 10 * 60 * 1000;
  return 0;
}

function buildKey(userId: string, toolName: string, args: any): string {
  return `${userId}::${toolName}::${stableStringify(args || {})}`;
}

export function getCachedToolResult(userId: string, toolName: string, args: any): { hit: boolean; value?: string } {
  const ttl = getTTLms(toolName);
  if (ttl <= 0) return { hit: false };

  const key = buildKey(userId, toolName, args);
  const now = Date.now();
  const entry = runtimeToolCache.get(key);
  if (!entry) {
    runtimeStats.misses += 1;
    return { hit: false };
  }

  if (entry.expiresAt < now) {
    runtimeToolCache.delete(key);
    runtimeStats.misses += 1;
    return { hit: false };
  }

  runtimeStats.hits += 1;
  return { hit: true, value: entry.value };
}

export function setCachedToolResult(userId: string, toolName: string, args: any, value: string) {
  const ttl = getTTLms(toolName);
  if (ttl <= 0) return;
  const key = buildKey(userId, toolName, args);
  runtimeToolCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

export function getCachedRuntimeSnapshot(userId: string, key: string): { hit: boolean; value?: string } {
  return getCachedToolResult(userId, key, {});
}

export function setCachedRuntimeSnapshot(userId: string, key: string, value: string) {
  setCachedToolResult(userId, key, {}, value);
}
