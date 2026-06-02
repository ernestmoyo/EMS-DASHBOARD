'use strict';
/*
 * One-shot seeder for a CLOUD database (e.g. Supabase) that the serverless
 * deployment cannot populate itself (no simulator on Vercel).
 *
 * Usage:
 *   1. Create a file `.env.cloud` in the repo root with:
 *        DATABASE_URL=postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
 *        DATABASE_PASSWORD=<your supabase db password>
 *   2. Run:  node scripts/seed-cloud.js
 *
 * It inserts 7 days of 5-minute readings for the 7 default sensors plus a few
 * alert-history rows. Idempotent: if the table already has data it stops.
 *
 * Reuses the exact generator logic from server/simulator.js so the payload
 * shapes match what the dashboard expects.
 */
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.cloud') });

// ── DB pool (mirrors server/db/index.js for DATABASE_URL + DATABASE_PASSWORD) ──
function buildConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set. Create .env.cloud (see header).');
    process.exit(1);
  }
  const parsed = new URL(url);
  const password =
    process.env.DATABASE_PASSWORD || decodeURIComponent(parsed.password || '');
  if (!password || password.includes('YOUR-PASSWORD')) {
    console.error('ERROR: DATABASE_PASSWORD not set (or still a placeholder).');
    process.exit(1);
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    user: parsed.username || 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 15000,
  };
}

const pool = new Pool(buildConfig());

// ── helpers (copied from server/simulator.js) ──────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const noise = (s) => (Math.random() - 0.5) * s;
function eatHour(ts) { return ((new Date(ts).getUTCHours() + 3) % 24); }
function dailyCurve(ts) {
  const h = eatHour(ts);
  return Math.sin(((h - 4) / 24) * 2 * Math.PI);
}

const S = {
  tempC: { temp_zone1: 24.2, temp_zone2: 23.6 },
  humPct: { temp_zone1: 52.0, temp_zone2: 54.5 },
  dehum: false, volt: 231.0, curr: 44.0, pf: 0.921, totalKwh: 0,
  smoke: 2.1, doors: { door_main: false, door_rack: false },
};

function genTemperature(sensorId, ts) {
  const isZone1 = sensorId === 'temp_zone1';
  const base = isZone1 ? 24.4 : 23.7;
  const target = base + dailyCurve(ts) * 1.6 + noise(0.35);
  const key = sensorId;
  S.tempC[key] = clamp(S.tempC[key] * 0.88 + target * 0.12, 19.0, 30.5);
  const humTarget = 53 + dailyCurve(ts) * 5 + noise(2.5);
  S.humPct[key] = clamp(
    S.humPct[key] * 0.94 + humTarget * 0.06 + (S.dehum ? -0.4 : +0.25), 37.0, 79.0
  );
  const temp_c = +S.tempC[key].toFixed(1);
  const humidity_pct = +S.humPct[key].toFixed(1);
  const status = temp_c >= 27 || humidity_pct >= 80 ? 'critical'
    : temp_c >= 24 || humidity_pct >= 70 ? 'warning' : 'normal';
  return { temp_c, humidity_pct, status, timestamp: new Date(ts).toISOString() };
}

function genPower(ts) {
  const h = eatHour(ts);
  const busy = h >= 8 && h < 20;
  const currTgt = busy ? rand(38, 52) : rand(22, 36);
  S.volt = clamp(S.volt * 0.92 + (231 + noise(2.5)) * 0.08, 218, 244);
  S.curr = clamp(S.curr * 0.86 + currTgt * 0.14, 18, 108);
  S.pf = clamp(S.pf * 0.91 + (0.91 + noise(0.04)) * 0.09, 0.71, 0.99);
  const power_w = +(S.volt * S.curr * S.pf).toFixed(0);
  const status = S.pf < 0.75 || S.curr > 100 ? 'critical'
    : S.pf < 0.85 || S.curr > 80 ? 'warning' : 'normal';
  return {
    voltage_v: +S.volt.toFixed(1), current_a: +S.curr.toFixed(1),
    power_factor: +S.pf.toFixed(2), power_w, energy_kwh: +S.totalKwh.toFixed(2),
    status, timestamp: new Date(ts).toISOString(),
  };
}

function genDoor(sensorId, ts) {
  const h = eatHour(ts);
  const busy = h >= 8 && h <= 18;
  if (S.doors[sensorId]) S.doors[sensorId] = false;
  else S.doors[sensorId] = busy && Math.random() < 0.004;
  const is_open = S.doors[sensorId];
  return { state: is_open ? 'open' : 'closed', is_open, status: is_open ? 'critical' : 'normal', timestamp: new Date(ts).toISOString() };
}

function genSmoke(ts) {
  const target = 1.8 + Math.abs(noise(1.8));
  S.smoke = clamp(S.smoke * 0.91 + target * 0.09, 0.4, 7);
  if (Math.random() < 0.0007) S.smoke = rand(19, 27);
  const level_pct = +S.smoke.toFixed(1);
  const status = level_pct >= 50 ? 'critical' : level_pct >= 20 ? 'warning' : 'normal';
  return { level_pct, alarm: level_pct >= 50, gas_type: 'smoke', status, timestamp: new Date(ts).toISOString() };
}

function genDehumidifier(ts) {
  const avgHum = (S.humPct.temp_zone1 + S.humPct.temp_zone2) / 2;
  if (avgHum >= 60) S.dehum = true;
  if (avgHum <= 50) S.dehum = false;
  return { state: S.dehum ? 'on' : 'off', is_on: S.dehum, status: 'normal', timestamp: new Date(ts).toISOString() };
}

function genPayload(sensor, ts) {
  switch (sensor.type) {
    case 'temperature': return genTemperature(sensor.id, ts);
    case 'power': return genPower(ts);
    case 'door': return genDoor(sensor.id, ts);
    case 'smoke': return genSmoke(ts);
    case 'dehumidifier': return genDehumidifier(ts);
    default: return {};
  }
}

function primaryVal(type, p) {
  return { temperature: p.temp_c, power: p.power_w, door: p.is_open ? 1 : 0, smoke: p.level_pct, dehumidifier: p.is_on ? 1 : 0 }[type] ?? 0;
}
const UNIT = { temperature: 'C', power: 'W', door: 'state', smoke: '%', dehumidifier: 'state' };

const SENSORS = [
  { id: 'temp_zone1', type: 'temperature' },
  { id: 'temp_zone2', type: 'temperature' },
  { id: 'power_main', type: 'power' },
  { id: 'door_main', type: 'door' },
  { id: 'door_rack', type: 'door' },
  { id: 'smoke_sensor1', type: 'smoke' },
  { id: 'dehumidifier_main', type: 'dehumidifier' },
];

async function batchInsert(rows) {
  const CHUNK = 80;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals = chunk.map((_, k) => `($${k*6+1},$${k*6+2},$${k*6+3},$${k*6+4},$${k*6+5},$${k*6+6})`).join(',');
    const params = chunk.flatMap(r => [r.sid, r.type, r.ts, r.val, r.json, r.unit]);
    await pool.query(
      `INSERT INTO sensor_readings (sensor_id,sensor_type,reading_ts,value_numeric,value_json,unit) VALUES ${vals}`,
      params
    );
  }
}

async function seedAlerts() {
  const entries = [
    { sensor_id: 'temp_zone1', severity: 'warning', message: 'WARNING: Temperature 24.8°C exceeded 24°C in Zone 1', days_ago: 5 },
    { sensor_id: 'temp_zone2', severity: 'warning', message: 'WARNING: Temperature 25.1°C exceeded 24°C in Zone 2', days_ago: 3 },
    { sensor_id: 'temp_zone1', severity: 'critical', message: 'CRITICAL: Temperature 27.4°C exceeded 27°C in Zone 1', days_ago: 2 },
    { sensor_id: 'smoke_sensor1', severity: 'warning', message: 'WARNING: Smoke level 22.3% exceeded 20%', days_ago: 4 },
    { sensor_id: 'door_main', severity: 'critical', message: 'ALERT: Door door_main has been opened', days_ago: 1 },
    { sensor_id: 'power_main', severity: 'warning', message: 'WARNING: Power factor 0.83 below 0.85', days_ago: 6 },
  ];
  for (const e of entries) {
    const triggered = new Date(Date.now() - e.days_ago * 24 * 3600 * 1000 + rand(28800000, 57600000)).toISOString();
    const resolved = new Date(new Date(triggered).getTime() + rand(600000, 3600000)).toISOString();
    await pool.query(
      'INSERT INTO alert_history (sensor_id, message, severity, triggered_at, resolved_at, acknowledged_by, acknowledged_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [e.sensor_id, e.message, e.severity, triggered, resolved, 'admin', resolved]
    );
  }
}

async function main() {
  console.log('[seed] connecting to cloud DB…');
  // Ensure the schema/sensors exist (the app creates them on first request,
  // but seed may run before anyone hits the site).
  const { rows: sensorRows } = await pool.query('SELECT COUNT(*) FROM sensors');
  if (Number(sensorRows[0].count) === 0) {
    console.error('[seed] No sensors found. Open the deployed site once so the app creates the schema + seeds sensors, then re-run.');
    process.exit(1);
  }

  const DAYS = Number(process.env.SEED_DAYS || 7);
  const INTERVAL_MS = 5 * 60 * 1000;
  const now = Date.now();

  // Decide whether to do a full 7-day seed (empty table) or a top-up
  // (extend from the last reading up to now, so "latest" is current).
  const { rows: maxRows } = await pool.query(
    'SELECT MAX(reading_ts) AS last FROM sensor_readings'
  );
  const lastMs = maxRows[0].last ? new Date(maxRows[0].last).getTime() : null;

  let start;
  if (lastMs == null) {
    start = now - DAYS * 24 * 3600 * 1000;
    console.log(`[seed] empty table — inserting ${DAYS} days of readings…`);
  } else if (now - lastMs < INTERVAL_MS) {
    console.log('[seed] data already current — nothing to top up.');
    await pool.end();
    return;
  } else {
    start = lastMs + INTERVAL_MS;
    const mins = Math.round((now - lastMs) / 60000);
    console.log(`[seed] topping up ${mins} min of readings to make "latest" current…`);
  }

  const batch = [];
  let total = 0;
  for (let ts = start; ts <= now; ts += INTERVAL_MS) {
    const hoursElapsed = (ts - start) / 3600000;
    S.totalKwh = hoursElapsed * 15 + noise(5);
    for (const sensor of SENSORS) {
      const payload = genPayload(sensor, ts);
      batch.push({
        sid: sensor.id, type: sensor.type, ts: new Date(ts).toISOString(),
        val: primaryVal(sensor.type, payload), json: JSON.stringify(payload),
        unit: UNIT[sensor.type] || '',
      });
    }
    if (batch.length >= 700) {
      total += batch.length;
      await batchInsert(batch.splice(0));
      process.stdout.write(`\r[seed] ${total} rows…`);
      await new Promise(r => setTimeout(r, 30));
    }
  }
  if (batch.length) { total += batch.length; await batchInsert(batch); }
  process.stdout.write(`\r[seed] ${total} readings inserted.        \n`);

  // Only seed alert history on a full (empty-table) seed, so repeated
  // top-ups don't pile up duplicate alert rows.
  if (lastMs == null) {
    await seedAlerts();
    console.log('[seed] alert history seeded.');
  }
  await pool.end();
  console.log('[seed] done ✓');
}

main().catch((e) => { console.error('[seed] FAILED:', e.message); process.exit(1); });
