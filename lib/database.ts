import fs from "node:fs";
import path from "node:path";
import { need } from "../sdk/loader.js";

export interface DatabaseDriver {
  fetch: () => Promise<Record<string, unknown>>;
  save: (data: Record<string, unknown>) => Promise<unknown>;
}

export interface DatabaseSystem {
  database: DatabaseDriver;
  session: null;
}

function writeFileAtomic(filePath: string, data: unknown): void {
  const text = JSON.stringify(data == null ? {} : data, null, 2);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, filePath);
  } catch {
    fs.writeFileSync(filePath, text);
    try {
      fs.unlinkSync(tmp);
    } catch {  }
  }
}

function jsonDriver(file: string): DatabaseDriver {
  return {
    async fetch() {
      try {
        return JSON.parse(await fs.promises.readFile(file, "utf8"));
      } catch {
        return {};
      }
    },
    async save(data) {
      writeFileAtomic(file, data);
    }
  };
}

function sqliteDriver(file: string): DatabaseDriver {
  let db: any = null;
  const open = (): any => {
    if (!db) {
      const BetterSqlite3 = need("better-sqlite3");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      db = new BetterSqlite3(file);
      db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }
    return db;
  };
  return {
    async fetch() {
      const out: Record<string, unknown> = {};
      for (const row of open().prepare("SELECT key, value FROM kv").all()) {
        try {
          out[row.key] = JSON.parse(row.value);
        } catch {  }
      }
      return out;
    },
    async save(data) {
      const d = open();
      const stmt = d.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      const tx = d.transaction((obj: Record<string, unknown>) => {
        for (const k of Object.keys(obj || {})) stmt.run(k, JSON.stringify(obj[k]));
      });
      tx(data);
    }
  };
}

const mongoClients = new Map<string, any>();

async function mongoDb(url: string): Promise<any> {
  if (!mongoClients.has(url)) {
    const { MongoClient } = need("mongodb");
    const client = new MongoClient(url);
    await client.connect();
    mongoClients.set(url, client);
  }
  return mongoClients.get(url);
}

function mongoDriver(url: string, name?: string): DatabaseDriver {
  const coll = async () => (await mongoDb(url)).db().collection("sdk_" + (name || "sdk"));
  return {
    async fetch() {
      const out: Record<string, unknown> = {};
      for (const doc of await (await coll()).find({}).toArray()) {
        if (doc.key !== undefined) {
          try {
            out[doc.key] = JSON.parse(doc.value);
          } catch {  }
        }
      }
      return out;
    },
    async save(data) {
      const c = await coll();
      const ops = Object.keys(data || {}).map((k) => ({
        updateOne: { filter: { key: k }, update: { $set: { key: k, value: JSON.stringify(data[k]) } }, upsert: true }
      }));
      if (ops.length) await c.bulkWrite(ops);
    }
  };
}

const redisClients = new Map<string, any>();

function redisConn(url: string): any {
  if (!redisClients.has(url)) {
    const Redis = need("ioredis");
    redisClients.set(url, new Redis(url));
  }
  return redisClients.get(url);
}

function redisDriver(url: string, name?: string): DatabaseDriver {
  const key = "sdk:" + (name || "sdk");
  return {
    async fetch() {
      const out: Record<string, unknown> = {};
      const raw = await redisConn(url).hgetall(key);
      for (const k of Object.keys(raw || {})) {
        try {
          out[k] = JSON.parse(raw[k]);
        } catch {  }
      }
      return out;
    },
    async save(data) {
      const flat: Record<string, string> = {};
      for (const k of Object.keys(data || {})) flat[k] = JSON.stringify(data[k]);
      if (Object.keys(flat).length) await redisConn(url).hset(key, flat);
    }
  };
}

const mysqlPools = new Map<string, any>();

async function mysqlPool(url: string): Promise<any> {
  if (!mysqlPools.has(url)) {
    const mysql = need("mysql2/promise");
    const pool = mysql.createPool(url);
    await pool.query("CREATE TABLE IF NOT EXISTS kv (`key` VARCHAR(255) PRIMARY KEY, `value` LONGTEXT NOT NULL)");
    mysqlPools.set(url, pool);
  }
  return mysqlPools.get(url);
}

function mysqlDriver(url: string, _name?: string): DatabaseDriver {
  void _name;
  return {
    async fetch() {
      const out: Record<string, unknown> = {};
      const [rows] = await (await mysqlPool(url)).query("SELECT `key`, `value` FROM kv");
      for (const row of rows as { key: string; value: string }[]) {
        try {
          out[row.key] = JSON.parse(row.value);
        } catch {  }
      }
      return out;
    },
    async save(data) {
      const pool = await mysqlPool(url);
      for (const k of Object.keys(data || {})) {
        await pool.query("INSERT INTO kv (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)", [k, JSON.stringify(data[k])]);
      }
    }
  };
}

const pgPools = new Map<string, any>();

async function pgPool(url: string): Promise<any> {
  if (!pgPools.has(url)) {
    const { Pool } = need("pg");
    const pool = new Pool({ connectionString: url });
    await pool.query("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    pgPools.set(url, pool);
  }
  return pgPools.get(url);
}

function pgDriver(url: string, _name?: string): DatabaseDriver {
  void _name;
  return {
    async fetch() {
      const out: Record<string, unknown> = {};
      const r = await (await pgPool(url)).query("SELECT key, value FROM kv");
      for (const row of r.rows) {
        try {
          out[row.key] = JSON.parse(row.value);
        } catch {  }
      }
      return out;
    },
    async save(data) {
      const pool = await pgPool(url);
      for (const k of Object.keys(data || {})) {
        await pool.query("INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [k, JSON.stringify(data[k])]);
      }
    }
  };
}

function protoOf(url: string | null): string {
  try {
    const p = new URL(url || "").protocol.replace(":", "");
    if (p === "mongodb" || p === "mongodb+srv") return "mongodb";
    if (p === "redis" || p === "rediss") return "redis";
    if (p === "mysql" || p === "mysql2") return "mysql";
    if (p === "postgres" || p === "postgresql") return "pg";
    if (p === "sqlite" || p === "file") return "sqlite";
    return p || "json";
  } catch {
    return "json";
  }
}

export const Database = {
  create(url: string | null, name?: string): DatabaseSystem {
    const n = name || "sdk";
    if (!url) {
      return { database: jsonDriver(path.join(process.cwd(), "data", n + ".json")), session: null };
    }
    const proto = protoOf(url);
    if (proto === "json") return { database: jsonDriver(path.join(process.cwd(), "data", n + ".json")), session: null };
    if (proto === "sqlite") return { database: sqliteDriver(path.join(process.cwd(), "data", n + ".db")), session: null };
    if (proto === "mongodb") return { database: mongoDriver(url, n), session: null };
    if (proto === "redis") return { database: redisDriver(url, n), session: null };
    if (proto === "mysql") return { database: mysqlDriver(url, n), session: null };
    if (proto === "pg") return { database: pgDriver(url, n), session: null };
    throw new Error("Unknown database protocol for URL: " + url);
  }
};

export default Database;
