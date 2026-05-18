const heartbeatIntervalMs = Number.parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? '60000', 10);

function logHeartbeat() {
  console.log(JSON.stringify({
    service: 'luminari-worker',
    status: 'running',
    timestamp: new Date().toISOString(),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    cacheConfigured: Boolean(process.env.REDIS_URL || process.env.VALKEY_URL),
  }));
}

console.log('luminari-worker started');
logHeartbeat();

const heartbeat = setInterval(logHeartbeat, heartbeatIntervalMs);

function shutdown(signal) {
  console.log(`${signal} received; shutting down luminari-worker`);
  clearInterval(heartbeat);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
