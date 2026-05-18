import crypto from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';

const port = Number.parseInt(process.env.PORT ?? '10000', 10);
const host = '0.0.0.0';
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })
  : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const species = [
  ['Palm Tree', 'Earth'], ['Palm Fruit', 'Earth'], ['Palm Sapling', 'Earth'], ['Rose', 'Earth'], ['Orchid', 'Earth'], ['Bonsai', 'Earth'],
  ['Helicoradian', 'Bioluminescent'], ['Woodsprite', 'Bioluminescent'], ['Octoshroom', 'Bioluminescent'],
  ['Pyrobloom', 'Elemental'], ['Frostfern', 'Elemental'], ['Stormvine', 'Elemental'],
  ['Aether Orchid', 'Fantasy'], ['Void Lily', 'Fantasy'], ['Prismatic Lotus', 'Fantasy'],
  ['Asteroid', 'Sci-Fi'], ['Metallic', 'Sci-Fi'], ['Metallic Sapling', 'Sci-Fi'],
];

const rarityTable = [
  { name: 'Common', weight: 6000, rate: '60%' },
  { name: 'Uncommon', weight: 3000, rate: '30%' },
  { name: 'Rare', weight: 1000, rate: '10%' },
  { name: 'Epic', weight: 300, rate: '3%' },
  { name: 'Legendary', weight: 100, rate: '1%' },
  { name: 'Mythic', weight: 10, rate: '0.1%' },
  { name: 'Ethereal', weight: 1, rate: '0.01%' },
];

function jsonResponse(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders,
  });
  response.end(`${payload}\n`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists players (
      id uuid primary key,
      device_id text unique not null,
      name text not null,
      lumens integer not null default 120,
      xp integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists seeds (
      id uuid primary key,
      owner_id uuid not null references players(id) on delete cascade,
      species text not null,
      category text not null,
      rarity text not null,
      source text not null,
      latitude double precision,
      longitude double precision,
      created_at timestamptz not null default now(),
      planted_at timestamptz
    );
    create table if not exists plants (
      id uuid primary key,
      owner_id uuid not null references players(id) on delete cascade,
      species text not null,
      category text not null,
      rarity text not null,
      anchor_lat double precision not null,
      anchor_lon double precision not null,
      light integer not null default 74,
      essence integer not null default 74,
      harmony integer not null default 74,
      health integer not null default 100,
      generation integer not null default 1,
      dna jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

function cleanName(value) {
  return String(value || 'Guest Gardener').replace(/[^a-zA-Z0-9 _.'-]/g, '').trim().slice(0, 24) || 'Guest Gardener';
}

function rollRarity() {
  const total = rarityTable.reduce((sum, rarity) => sum + rarity.weight, 0);
  let roll = Math.floor(Math.random() * total);
  for (const rarity of rarityTable) {
    roll -= rarity.weight;
    if (roll < 0) return rarity.name;
  }
  return 'Common';
}

function randomSpecies() {
  const [name, category] = species[Math.floor(Math.random() * species.length)];
  return { name, category };
}

function makeStarterSeed(ownerId, index) {
  const selected = index === 0 ? { name: 'Helicoradian', category: 'Bioluminescent' } : randomSpecies();
  return {
    id: crypto.randomUUID(),
    ownerId,
    species: selected.name,
    category: selected.category,
    rarity: rollRarity(),
    source: index === 0 ? 'starter iconic' : 'starter pack',
  };
}

function dnaFor(rarity) {
  const bonus = Math.max(0, rarityTable.findIndex((entry) => entry.name === rarity)) / 2;
  const trait = () => Math.min(3, Math.round(Math.random() * 2 + bonus * Math.random()));
  return {
    growthRate: trait(), maxHeight: trait(), luminosity: trait(), colorIntensity: trait(), patternComplexity: trait(), specialEffects: trait(), bloomSize: trait(), bloomFrequency: trait(), environmentalAdaptation: trait(), tradeAppeal: trait(), lightAbsorption: trait(), essenceEfficiency: trait(), harmonyResilience: trait(),
  };
}

async function getPlayerPayload(playerId) {
  const player = await pool.query('select * from players where id = $1', [playerId]);
  const seeds = await pool.query('select * from seeds where owner_id = $1 and planted_at is null order by created_at desc', [playerId]);
  const plants = await pool.query('select * from plants where owner_id = $1 order by created_at desc', [playerId]);
  return {
    player: player.rows[0],
    seeds: seeds.rows,
    plants: plants.rows,
    rarityRates: rarityTable.map(({ name, rate }) => ({ name, rate })),
  };
}

async function loginPlayer(body) {
  if (!pool) return { fallback: true, error: 'DATABASE_URL is not configured' };
  await ensureSchema();
  const deviceId = String(body.deviceId || crypto.randomUUID()).slice(0, 120);
  const name = cleanName(body.name);
  let result = await pool.query(
    `insert into players (id, device_id, name)
     values ($1, $2, $3)
     on conflict (device_id) do update set name = excluded.name, updated_at = now()
     returning *`,
    [crypto.randomUUID(), deviceId, name],
  );
  const player = result.rows[0];
  const existingSeeds = await pool.query('select count(*)::int as count from seeds where owner_id = $1', [player.id]);
  const existingPlants = await pool.query('select count(*)::int as count from plants where owner_id = $1', [player.id]);
  if (existingSeeds.rows[0].count === 0 && existingPlants.rows[0].count === 0) {
    const starterSeeds = Array.from({ length: 5 }, (_, index) => makeStarterSeed(player.id, index));
    for (const seed of starterSeeds) {
      await pool.query(
        'insert into seeds (id, owner_id, species, category, rarity, source) values ($1, $2, $3, $4, $5, $6)',
        [seed.id, seed.ownerId, seed.species, seed.category, seed.rarity, seed.source],
      );
    }
  }
  return getPlayerPayload(player.id);
}

async function plantSeed(body) {
  if (!pool) return { fallback: true, error: 'DATABASE_URL is not configured' };
  await ensureSchema();
  const seed = await pool.query('select * from seeds where id = $1 and owner_id = $2 and planted_at is null', [body.seedId, body.ownerId]);
  if (!seed.rows.length) return { error: 'Seed not found' };
  const selected = seed.rows[0];
  const plantId = crypto.randomUUID();
  await pool.query(
    `insert into plants (id, owner_id, species, category, rarity, anchor_lat, anchor_lon, dna)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [plantId, body.ownerId, selected.species, selected.category, selected.rarity, Number(body.lat), Number(body.lon), dnaFor(selected.rarity)],
  );
  await pool.query('update seeds set planted_at = now() where id = $1', [selected.id]);
  return getPlayerPayload(body.ownerId);
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
    rarityRates: rarityTable.map(({ name, rate }) => ({ name, rate })),
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  try {
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      jsonResponse(response, 200, getServiceStatus());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/players/login') {
      jsonResponse(response, 200, await loginPlayer(await readBody(request)));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/plants') {
      jsonResponse(response, 200, await plantSeed(await readBody(request)));
      return;
    }

    jsonResponse(response, 404, { error: 'Not found', routes: ['GET /health', 'POST /players/login', 'POST /plants'] });
  } catch (error) {
    console.error(error);
    jsonResponse(response, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`luminari-api listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down luminari-api`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
