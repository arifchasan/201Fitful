import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: ['DATE'],
  timezone: 'local',
};

export const DB_NAME = process.env.DB_NAME || 'fitintake';

export const pool = mysql.createPool({ ...config, database: DB_NAME });

/** Koneksi tanpa database, dipakai untuk membuat database saat inisialisasi. */
export function createRootConnection() {
  return mysql.createConnection(config);
}

export async function ensureDatabase() {
  const conn = await createRootConnection();
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

/** Menambah kolom baru pada tabel lama tanpa menghapus data. */
async function ensureColumns(table, columns) {
  const [rows] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [DB_NAME, table],
  );
  const existing = new Set(rows.map((row) => row.COLUMN_NAME));

  for (const [column, definition] of columns) {
    if (!existing.has(column)) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }
}

/** Menambah index baru tanpa gagal bila sudah ada. */
async function ensureIndex(table, indexName, definition) {
  const [rows] = await pool.query(
    'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [DB_NAME, table, indexName],
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  }
}

/** Membuat tabel yang dibutuhkan bila belum ada. */
export async function ensureSchema() {
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumns('meals', [
    ['edited_food_name', 'VARCHAR(160) NULL'],
    ['edited_calories', 'DECIMAL(7, 1) NULL'],
    ['edited_protein_g', 'DECIMAL(6, 1) NULL'],
  ]);

  await ensureColumns('daily_entries', [
    ['last_meal_time', 'TIME NULL'],
    ['fast_break_time', 'TIME NULL'],
  ]);

  await ensureColumns('users', [
    ['email', 'VARCHAR(160) NULL'],
    ['body_fat', 'DECIMAL(4, 1) NULL'],
    ['birth_date', 'DATE NULL'],
  ]);
  await ensureIndex('users', 'uq_users_email', 'UNIQUE KEY uq_users_email (email)');
}
