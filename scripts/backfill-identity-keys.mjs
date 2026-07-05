import pg from 'pg';
import { computeIdentityKey } from '/dev-server/src/utils/rules/calendar-merge.ts';

const { Client } = pg;
const client = new Client({ ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query("SELECT id, title, start_time, end_time, provider FROM calendar_events WHERE identity_key IS NULL");
let updated = 0, leftNull = 0;
for (const r of rows) {
  const key = computeIdentityKey({ title: r.title, start_time: r.start_time, end_time: r.end_time });
  if (!key) { leftNull++; continue; }
  await client.query("UPDATE calendar_events SET identity_key = $1 WHERE id = $2", [key, r.id]);
  updated++;
}
console.log(JSON.stringify({ scanned: rows.length, updated, leftNull }));
await client.end();
