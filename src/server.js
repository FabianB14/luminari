import crypto from 'crypto';
import http from 'http';
import { Pool } from 'pg';

const port = Number(process.env.PORT || 10000);
const databaseUrl = process.env.DATABASE_URL;

const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } })
  : null;

const species = [
  { name: 'Palm Tree', category: 'Earth' },
  { name: 'Palm Fruit', category: 'Earth' },
  { name: 'Palm Sapling', category: 'Earth' },
  { name: 'Rose', category: 'Earth' },
  { name: 'Orchid', category: 'Earth' },
  { name: 'Bonsai', category: 'Earth' },
  { name: 'Helicoradian', category: 'Bioluminescent' },
  { name: 'Woodsprite', category: 'Bioluminescent' },
  { name: 'Octoshroom', category: 'Bioluminescent' },
  { name: 'Pyrobloom', category: 'Elemental' },
  { name: 'Frostfern', category: 'Elemental' },
  { name: 'Stormvine', category: 'Elemental' },
  { name: 'Aether Orchid', category: 'Fantasy' },
  { name: 'Void Lily', category: 'Fantasy' },
  { name: 'Prismatic Lotus', category: 'Fantasy' },
  { name: 'Asteroid', category: 'Sci-Fi' },
  { name: 'Metallic', category: 'Sci-Fi' },
  { name: 'Metallic Sapling', category: 'Sci-Fi' }
];

const rarityTable = [
  { name: 'Common', rate: 60, weight: 6000 },
  { name: 'Uncommon', rate: 30, weight: 3000 },
  { name: 'Rare', rate: 10, weight: 1000 },
  { name: 'Epic', rate: 3, weight: 300 },
  { name: 'Legendary', rate: 1, weight: 100 },
  { name: 'Mythic', rate: 0.1, weight: 10 },
  { name: 'Ethereal', rate: 0.01, weight: 1 }
];

function assertDb() {
  if (!pool) throw new Error('DATABASE_URL is not configured.');
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists players (
      id uuid primary key,
      device_id text unique not null,
      name text not null,
      lumens integer not null default 250,
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
      source text not null default 'wild',
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
      anchor_lat double precision,
      anchor_lon double precision,
      light integer not null default 65,
      essence integer not null default 65,
      harmony integer not null default 75,
      health integer not null default 100,
      generation integer not null default 1,
      dna jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table players add column if not exists email text;
    alter table players add column if not exists password_hash text;
    alter table players add column if not exists password_salt text;
    alter table players add column if not exists garden_tier text not null default 'wild';

    alter table plants add column if not exists ar_anchor jsonb not null default '{"mode":"screen","x":50,"y":68,"scale":1}'::jsonb;
    alter table plants add column if not exists location text not null default 'world';
    alter table plants add column if not exists care_streak integer not null default 0;
    alter table plants add column if not exists last_cared_at date;

    create unique index if not exists players_email_unique on players (lower(email)) where email is not null;
    create index if not exists players_name_lookup on players (lower(name));
    create index if not exists seeds_owner_unplanted on seeds (owner_id, planted_at);
    create index if not exists plants_owner_location on plants (owner_id, location);
  `);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
  });
}

function id() {
  return crypto.randomUUID();
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  return name || `Cultivator-${crypto.randomInt(1000, 9999)}`;
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Use a valid email address.');
  return email.slice(0, 160);
}

function makePasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return true;
  const { hash } = makePasswordHash(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function rollRarity() {
  const total = rarityTable.reduce((sum, item) => sum + item.weight, 0);
  let roll = crypto.randomInt(total);
  for (const item of rarityTable) {
    if (roll < item.weight) return item.name;
    roll -= item.weight;
  }
  return 'Common';
}

function randomSpecies() {
  return species[crypto.randomInt(species.length)];
}

function validSpecies(name) {
  return species.find((item) => item.name === name) || randomSpecies();
}

function validRarity(name) {
  return rarityTable.some((item) => item.name === name) ? name : rollRarity();
}

function cleanLocation(value) {
  return value === 'greenhouse' ? 'greenhouse' : 'world';
}

function clampMeter(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return todayKey(date);
}

function normalizeDateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return todayKey(new Date(value));
}

function nextCareStreak(lastCaredAt, currentStreak) {
  const last = normalizeDateKey(lastCaredAt);
  const current = Number(currentStreak) || 0;
  if (last === todayKey()) return current;
  if (last === yesterdayKey()) return current + 1;
  return 1;
}

function balanceHarmony(light, essence, harmony, bonus = 0) {
  const gap = Math.abs(light - essence);
  const drift = gap <= 15 ? 8 : gap <= 30 ? 2 : -8;
  return clampMeter(harmony + drift + bonus);
}

function makeStarterSeed(index) {
  const starter = [
    { name: 'Helicoradian', category: 'Bioluminescent' },
    { name: 'Rose', category: 'Earth' },
    { name: 'Stormvine', category: 'Elemental' },
    randomSpecies(),
    randomSpecies()
  ][index] || randomSpecies();
  return { ...starter, rarity: index < 3 ? 'Common' : rollRarity() };
}

function dnaFor(rarity) {
  const rarityBoost = Math.max(0, rarityTable.findIndex((item) => item.name === rarity));
  const trait = () => Math.max(0, Math.min(3, crypto.randomInt(0, 3) + (crypto.randomInt(0, 8) < rarityBoost ? 1 : 0)));
  return {
    growthRate: trait(),
    maxHeight: trait(),
    luminosity: trait(),
    colorIntensity: trait(),
    patternComplexity: trait(),
    specialEffects: trait(),
    bloomSize: trait(),
    bloomFrequency: trait(),
    environmentalAdaptation: trait(),
    tradeAppeal: trait(),
    lightAbsorption: trait(),
    essenceEfficiency: trait(),
    harmonyResilience: trait()
  };
}

function cleanAnchor(anchor) {
  const fallback = { mode: 'screen', x: 50, y: 68, scale: 1 };
  if (!anchor || typeof anchor !== 'object') return fallback;
  const mode = anchor.mode === 'webxr' ? 'webxr' : 'screen';
  return {
    mode,
    x: Number.isFinite(Number(anchor.x)) ? Number(anchor.x) : fallback.x,
    y: Number.isFinite(Number(anchor.y)) ? Number(anchor.y) : fallback.y,
    scale: Number.isFinite(Number(anchor.scale)) ? Number(anchor.scale) : fallback.scale,
    matrix: Array.isArray(anchor.matrix) ? anchor.matrix.slice(0, 16).map(Number).filter(Number.isFinite) : undefined
  };
}

async function getPlayerPayload(playerId, extras = {}) {
  const [playerResult, seedResult, plantResult] = await Promise.all([
    pool.query('select id, email, name, lumens, xp, garden_tier, created_at, updated_at from players where id=$1', [playerId]),
    pool.query('select * from seeds where owner_id=$1 and planted_at is null order by created_at desc', [playerId]),
    pool.query('select * from plants where owner_id=$1 order by created_at desc', [playerId])
  ]);
  if (!playerResult.rows[0]) throw new Error('Player not found.');
  return {
    player: playerResult.rows[0],
    seeds: seedResult.rows,
    plants: plantResult.rows,
    rarityRates: rarityTable.map(({ name, rate }) => ({ name, rate })),
    ...extras
  };
}

async function grantStarterPack(playerId) {
  const existing = await pool.query(
    `select
      (select count(*)::int from seeds where owner_id=$1) as seed_count,
      (select count(*)::int from plants where owner_id=$1) as plant_count`,
    [playerId]
  );
  if (existing.rows[0].seed_count || existing.rows[0].plant_count) return;
  for (let index = 0; index < 5; index += 1) {
    const starter = makeStarterSeed(index);
    await pool.query(
      'insert into seeds (id, owner_id, species, category, rarity, source) values ($1,$2,$3,$4,$5,$6)',
      [id(), playerId, starter.name, starter.category, starter.rarity, 'starter-pack']
    );
  }
}

async function assertNameAvailable(name, currentPlayerId = null) {
  const result = await pool.query(
    'select id from players where lower(name)=lower($1) and ($2::uuid is null or id<>$2::uuid) limit 1',
    [name, currentPlayerId]
  );
  if (result.rows[0]) throw new Error('Username is already taken.');
}

async function loginPlayer(body) {
  assertDb();
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const name = cleanName(body.name || (email ? email.split('@')[0] : body.deviceId));
  const deviceId = String(body.deviceId || id()).slice(0, 120);

  let player;
  if (email) {
    const existing = await pool.query('select * from players where lower(email)=lower($1)', [email]);
    if (existing.rows[0]) {
      if (existing.rows[0].password_hash && !password) throw new Error('Password is required.');
      if (!verifyPassword(password, existing.rows[0].password_salt, existing.rows[0].password_hash)) {
        throw new Error('Email or password is incorrect.');
      }
      await assertNameAvailable(name, existing.rows[0].id);
      let hash = existing.rows[0].password_hash;
      let salt = existing.rows[0].password_salt;
      if (password && !hash) {
        const made = makePasswordHash(password);
        hash = made.hash;
        salt = made.salt;
      }
      const updated = await pool.query(
        'update players set name=$2, device_id=$3, password_hash=$4, password_salt=$5, updated_at=now() where id=$1 returning *',
        [existing.rows[0].id, name, deviceId, hash, salt]
      );
      player = updated.rows[0];
    }
  }

  if (!player) {
    await assertNameAvailable(name);
    const passwordParts = password ? makePasswordHash(password) : { hash: null, salt: null };
    const created = await pool.query(
      'insert into players (id, device_id, email, name, password_hash, password_salt) values ($1,$2,$3,$4,$5,$6) returning *',
      [id(), deviceId, email, name, passwordParts.hash, passwordParts.salt]
    );
    player = created.rows[0];
  }

  await grantStarterPack(player.id);
  return getPlayerPayload(player.id, { authenticated: Boolean(email), deviceId });
}

async function collectSeed(body) {
  assertDb();
  if (!body.playerId) throw new Error('Log in before collecting seeds.');
  const plantSpecies = validSpecies(body.species);
  const rarity = validRarity(body.rarity);
  await pool.query('select id from players where id=$1', [body.playerId]).then((result) => {
    if (!result.rows[0]) throw new Error('Player not found.');
  });
  const seedId = id();
  await pool.query(
    'insert into seeds (id, owner_id, species, category, rarity, source, latitude, longitude) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [seedId, body.playerId, plantSpecies.name, plantSpecies.category, rarity, String(body.source || 'wild').slice(0, 40), body.lat ?? null, body.lon ?? null]
  );
  return getPlayerPayload(body.playerId, { collectedSeedId: seedId });
}

async function plantSeed(body) {
  assertDb();
  if (!body.playerId || !body.seedId) throw new Error('Choose a seed from your pouch first.');
  const seedResult = await pool.query('select * from seeds where id=$1 and owner_id=$2 and planted_at is null', [body.seedId, body.playerId]);
  const seed = seedResult.rows[0];
  if (!seed) throw new Error('That seed is not available in your pouch.');
  const plantId = id();
  await pool.query(
    `insert into plants
      (id, owner_id, species, category, rarity, anchor_lat, anchor_lon, dna, ar_anchor, location)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'world')`,
    [plantId, body.playerId, seed.species, seed.category, seed.rarity, body.lat ?? null, body.lon ?? null, dnaFor(seed.rarity), cleanAnchor(body.arAnchor)]
  );
  await pool.query('update seeds set planted_at=now() where id=$1', [seed.id]);
  return getPlayerPayload(body.playerId, { plantedId: plantId });
}

async function carePlant(plantId, body) {
  assertDb();
  if (!body.playerId) throw new Error('Log in before caring for plants.');
  const result = await pool.query('select * from plants where id=$1 and owner_id=$2', [plantId, body.playerId]);
  const plant = result.rows[0];
  if (!plant) throw new Error('Plant not found.');

  const action = String(body.action || '').toLowerCase();
  let light = Number(plant.light) || 0;
  let essence = Number(plant.essence) || 0;
  let harmony = Number(plant.harmony) || 0;
  let health = Number(plant.health) || 0;
  let bonus = 0;

  if (action === 'light') light = clampMeter(light + 18);
  else if (action === 'essence') essence = clampMeter(essence + 18);
  else if (action === 'attention') bonus = 12;
  else if (action === 'protect') health = clampMeter(health + 24);
  else throw new Error('Unknown care action.');

  harmony = balanceHarmony(light, essence, harmony, bonus);
  const careStreak = nextCareStreak(plant.last_cared_at, plant.care_streak);
  await pool.query(
    `update plants
      set light=$3, essence=$4, harmony=$5, health=$6, care_streak=$7, last_cared_at=$8::date, updated_at=now()
      where id=$1 and owner_id=$2`,
    [plantId, body.playerId, light, essence, harmony, health, careStreak, todayKey()]
  );
  return getPlayerPayload(body.playerId, { caredPlantId: plantId, action });
}

async function movePlant(plantId, body) {
  assertDb();
  if (!body.playerId) throw new Error('Log in before moving plants.');
  const anchor = cleanAnchor(body.arAnchor);
  const result = await pool.query(
    `update plants
      set anchor_lat=$3, anchor_lon=$4, ar_anchor=$5, location='world', updated_at=now()
      where id=$1 and owner_id=$2
      returning id`,
    [plantId, body.playerId, body.lat ?? null, body.lon ?? null, anchor]
  );
  if (!result.rows[0]) throw new Error('Plant not found.');
  return getPlayerPayload(body.playerId, { movedPlantId: plantId });
}

async function setPlantLocation(plantId, body) {
  assertDb();
  if (!body.playerId) throw new Error('Log in before moving plants.');
  const location = cleanLocation(body.location);
  const result = await pool.query(
    `update plants
      set location=$3, updated_at=now()
      where id=$1 and owner_id=$2
      returning id`,
    [plantId, body.playerId, location]
  );
  if (!result.rows[0]) throw new Error('Plant not found.');
  return getPlayerPayload(body.playerId, { locationPlantId: plantId, location });
}

async function removePlant(plantId, body) {
  assertDb();
  if (!body.playerId) throw new Error('Log in before removing plants.');
  const result = await pool.query('delete from plants where id=$1 and owner_id=$2 returning id', [plantId, body.playerId]);
  if (!result.rows[0]) throw new Error('Plant not found.');
  return getPlayerPayload(body.playerId, { removedPlantId: plantId });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(res, 200, {
        ok: true,
        name: 'Luminari API',
        database: Boolean(pool),
        gameplay: ['login', 'starter-pack', 'seed-pouch', 'planting', 'persistent-care', 'plant-move', 'greenhouse-flag']
      });
    }

    if (req.method === 'POST' && url.pathname === '/players/login') {
      const body = await parseBody(req);
      return json(res, 200, await loginPlayer(body));
    }

    if (req.method === 'POST' && url.pathname === '/seeds/collect') {
      const body = await parseBody(req);
      return json(res, 200, await collectSeed(body));
    }

    if (req.method === 'POST' && url.pathname === '/plants') {
      const body = await parseBody(req);
      return json(res, 200, await plantSeed(body));
    }

    const careMatch = url.pathname.match(/^\/plants\/([^/]+)\/care$/);
    if (req.method === 'PATCH' && careMatch) {
      const body = await parseBody(req);
      return json(res, 200, await carePlant(careMatch[1], body));
    }

    const moveMatch = url.pathname.match(/^\/plants\/([^/]+)\/move$/);
    if (req.method === 'PATCH' && moveMatch) {
      const body = await parseBody(req);
      return json(res, 200, await movePlant(moveMatch[1], body));
    }

    const locationMatch = url.pathname.match(/^\/plants\/([^/]+)\/location$/);
    if (req.method === 'PATCH' && locationMatch) {
      const body = await parseBody(req);
      return json(res, 200, await setPlantLocation(locationMatch[1], body));
    }

    const deleteMatch = url.pathname.match(/^\/plants\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const body = await parseBody(req);
      return json(res, 200, await removePlant(deleteMatch[1], body));
    }

    return json(res, 404, {
      error: 'Route not found.',
      routes: [
        'GET /health',
        'POST /players/login',
        'POST /seeds/collect',
        'POST /plants',
        'PATCH /plants/:id/care',
        'PATCH /plants/:id/move',
        'PATCH /plants/:id/location',
        'DELETE /plants/:id'
      ]
    });
  } catch (error) {
    return json(res, 400, { error: error.message || 'Something went wrong.' });
  }
});

await ensureSchema();
server.listen(port, () => {
  console.log(`Luminari API listening on ${port}`);
});
