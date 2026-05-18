console.log(JSON.stringify({
  service: 'luminari-nightly-cleanup',
  status: 'completed',
  timestamp: new Date().toISOString(),
  message: 'No cleanup tasks are registered yet.',
  databaseConfigured: Boolean(process.env.DATABASE_URL),
  cacheConfigured: Boolean(process.env.REDIS_URL || process.env.VALKEY_URL),
}));
