// Redis is disabled – all caching operations return null
// This avoids type errors and simplifies deployment

export const getRedisClient = async (): Promise<null> => {
  console.log('⚠️ Redis caching disabled (not configured)');
  return null;
};

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    return null; // always cache miss
  },

  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
    // no-op – never cache
  },

  async del(key: string): Promise<void> {
    // no-op
  },

  async delPattern(pattern: string): Promise<void> {
    // no-op
  },
};