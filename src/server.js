import http from 'node:http';

const port = Number.parseInt(process.env.PORT ?? '10000', 10);
const host = '0.0.0.0';

function jsonResponse(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(`${payload}\n`);
}

function getServiceStatus() {
  return {
    service: 'luminari-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    dependencies: {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      cacheConfigured: Boolean(process.env.REDIS_URL || process.env.VALKEY_URL),
    },
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    jsonResponse(response, 200, getServiceStatus());
    return;
  }

  jsonResponse(response, 404, {
    error: 'Not found',
    routes: ['GET /', 'GET /health'],
  });
});

server.listen(port, host, () => {
  console.log(`luminari-api listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down luminari-api`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
