// 訪客留言板 API（Vercel Serverless Function）
// GET  /api/guestbook → 最新 50 則留言
// POST /api/guestbook → { name, message } 新增一則留言
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

const NAME_MAX = 30;
const MESSAGE_MAX = 140;
const LIST_LIMIT = 50;
// 同一個來源 10 分鐘內最多 5 則，擋掉洗版
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_POSTS = 5;

let sql;
let tableReady;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

function ensureTable() {
  tableReady ??= (async () => {
    await db()`
      CREATE TABLE IF NOT EXISTS guestbook (
        id         BIGSERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        message    TEXT NOT NULL,
        ip_hash    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await db()`CREATE INDEX IF NOT EXISTS guestbook_created_at_idx ON guestbook (created_at DESC)`;
  })().catch((err) => {
    tableReady = undefined;
    throw err;
  });
  return tableReady;
}

// 去掉控制字元、把連續空白收成一個，再修掉頭尾空白
function clean(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function length(str) {
  return [...str].length;
}

// 只存 IP 的雜湊值，不存原始 IP
function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const salt = process.env.IP_SALT || process.env.DATABASE_URL;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      await ensureTable();
      const entries = await db()`
        SELECT id, name, message, created_at
        FROM guestbook
        ORDER BY created_at DESC
        LIMIT ${LIST_LIMIT}`;
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      const body = readBody(req);

      // 隱藏欄位：真人看不到，機器人才會填
      if (clean(body.website)) {
        return res.status(400).json({ error: '送出失敗，請再試一次。' });
      }

      const name = clean(body.name);
      const message = clean(body.message);
      if (!name) return res.status(400).json({ error: '請輸入你的名字。', field: 'name' });
      if (length(name) > NAME_MAX) return res.status(400).json({ error: `名字最多 ${NAME_MAX} 個字。`, field: 'name' });
      if (!message) return res.status(400).json({ error: '請寫下想說的話。', field: 'message' });
      if (length(message) > MESSAGE_MAX) return res.status(400).json({ error: `留言最多 ${MESSAGE_MAX} 個字。`, field: 'message' });

      await ensureTable();
      const hash = ipHash(req);
      const [{ count }] = await db()`
        SELECT count(*)::int AS count
        FROM guestbook
        WHERE ip_hash = ${hash}
          AND created_at > now() - make_interval(mins => ${RATE_WINDOW_MINUTES}::int)`;
      if (count >= RATE_MAX_POSTS) {
        return res.status(429).json({ error: '留言太頻繁了，請過幾分鐘再試。' });
      }

      const [entry] = await db()`
        INSERT INTO guestbook (name, message, ip_hash)
        VALUES (${name}, ${message}, ${hash})
        RETURNING id, name, message, created_at`;
      return res.status(201).json({ entry });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[guestbook]', err);
    return res.status(500).json({ error: '留言板暫時無法使用，請稍後再試。' });
  }
}
