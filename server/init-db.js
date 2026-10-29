import { ensureDatabase, ensureSchema, pool, DB_NAME } from './db.js';

async function main() {
  await ensureDatabase();
  await ensureSchema();

  const [rows] = await pool.query('SHOW TABLES');
  console.log(
    `Database "${DB_NAME}" siap. Tabel:`,
    rows.map((r) => Object.values(r)[0]).join(', '),
  );
  await pool.end();
}

main().catch((error) => {
  console.error('Gagal menyiapkan database:', error.message);
  process.exit(1);
});
