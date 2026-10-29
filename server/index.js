import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import multer from 'multer';

import { analyzeMealPhoto, aiConfigured } from './ai.js';
import { ensureDatabase, ensureSchema, pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'storage', 'uploads');
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));

/* ---------------------------------------------------------------- helpers */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['male', 'female']);
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS = { breakfast: 'sarapan', lunch: 'makan siang', dinner: 'makan malam' };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === Number(value.slice(0, 4)) &&
    d.getMonth() === Number(value.slice(5, 7)) - 1 &&
    d.getDate() === Number(value.slice(8, 10))
  );
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function parseNumber(value, label, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} harus berupa angka.`);
  if (n < min || n > max) throw new HttpError(400, `${label} harus antara ${min} dan ${max}.`);
  return n;
}

function optionalNumber(value, label, { min, max }) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseNumber(value, label, { min, max });
  return Math.round(n * 10) / 10;
}

function optionalInt(value, label, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    throw new HttpError(400, `${label} harus antara 0 dan ${max}.`);
  }
  return Math.round(n);
}

function optionalText(value, max) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().slice(0, max);
  return text || null;
}

function bmiInfo(heightCm, weightKg) {
  if (!heightCm || !weightKg) return { bmi: null, bmiCategory: null };
  const meters = heightCm / 100;
  const bmi = weightKg / (meters * meters);
  let category = 'Obesitas';
  if (bmi < 18.5) category = 'Kurang';
  else if (bmi < 25) category = 'Ideal';
  else if (bmi < 30) category = 'Berlebih';
  return { bmi: Math.round(bmi * 10) / 10, bmiCategory: category };
}

function recommendations({ weightKg, heightCm, age, gender }) {
  // Mifflin-St Jeor dengan faktor aktivitas ringan (1.375).
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
  return {
    proteinMinG: Math.round(weightKg * 1.2),
    calorieMax: Math.round((bmr * 1.375) / 10) * 10,
  };
}

function shapeUser(row) {
  const heightCm = Number(row.height_cm);
  const weightKg = Number(row.weight_kg);
  const profile = {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    age: row.age,
    gender: row.gender,
    heightCm,
    weightKg,
    bodyFat: row.body_fat === null || row.body_fat === undefined ? null : Number(row.body_fat),
  };
  return {
    ...profile,
    ...bmiInfo(heightCm, weightKg),
    recommendation: recommendations(profile),
    createdAt: row.created_at,
  };
}

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function shapeMeal(row) {
  if (!row) return null;

  const ai = {
    food: row.food_name ?? null,
    calories: numberOrNull(row.calories),
    proteinG: numberOrNull(row.protein_g),
  };

  const editedFood = row.edited_food_name ?? null;
  const editedCalories = numberOrNull(row.edited_calories);
  const editedProtein = numberOrNull(row.edited_protein_g);
  const edited =
    editedFood !== null || editedCalories !== null || editedProtein !== null
      ? { food: editedFood, calories: editedCalories, proteinG: editedProtein }
      : null;

  return {
    id: row.id,
    type: row.meal_type,
    label: MEAL_LABELS[row.meal_type] ?? row.meal_type,
    photoUrl: `/uploads/${row.photo_path}`,
    aiStatus: row.ai_status,
    aiError: row.ai_error,
    analyzedAt: row.ai_status === 'done' ? new Date(row.updated_at).toISOString() : null,
    ai,
    edited,
    food: edited?.food ?? ai.food,
    calories: edited?.calories ?? ai.calories,
    proteinG: edited?.proteinG ?? ai.proteinG,
  };
}

function effectiveNutrition(row) {
  return {
    calories: Number(row.edited_calories ?? row.calories ?? 0),
    proteinG: Number(row.edited_protein_g ?? row.protein_g ?? 0),
  };
}

function aiErrorMessage(error) {
  if (error.status === 401) return 'API key OpenAI ditolak.';
  if (error.status === 429) return 'Kuota OpenAI habis, coba lagi nanti.';
  if (error.status === 402) return 'Kredit OpenAI tidak mencukupi.';
  if (error.message?.includes('OPENAI_API_KEY')) return 'API key OpenAI belum diset.';
  return String(error.message ?? 'Analisis gagal.').slice(0, 200);
}

async function findUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Pengguna tidak ditemukan.');
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!rows.length) throw new HttpError(404, 'Pengguna tidak ditemukan.');
  return rows[0];
}

async function findMeal(userId, mealId) {
  const [rows] = await pool.query('SELECT * FROM meals WHERE id = ? AND user_id = ?', [mealId, userId]);
  if (!rows.length) throw new HttpError(404, 'Foto makan tidak ditemukan.');
  return rows[0];
}

async function removePhoto(filename) {
  if (!filename) return;
  try {
    await fsp.unlink(path.join(UPLOAD_DIR, path.basename(filename)));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Gagal menghapus foto:', error.message);
  }
}

function parseEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length < 5 || email.length > 160 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Email tidak valid.');
  }
  return email;
}

function parseProfile(body, { withEmail = false } = {}) {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new HttpError(400, 'Nama harus 2-100 karakter.');
  }
  const age = parseNumber(body.age, 'Usia', { min: 5, max: 110 });
  if (!Number.isInteger(age)) throw new HttpError(400, 'Usia harus bilangan bulat.');
  if (!GENDERS.has(body.gender)) throw new HttpError(400, 'Gender harus "male" atau "female".');
  const heightCm = Math.round(parseNumber(body.heightCm, 'Tinggi badan', { min: 80, max: 250 }) * 10) / 10;
  const weightKg = Math.round(parseNumber(body.weightKg, 'Berat badan', { min: 20, max: 300 }) * 10) / 10;
  const bodyFat = optionalNumber(body.bodyFat, 'Body fat', { min: 2, max: 70 });
  const profile = { name, age, gender: body.gender, heightCm, weightKg, bodyFat };
  if (withEmail) profile.email = parseEmail(body.email);
  return profile;
}

/* ---------------------------------------------------------------- uploads */

const ALLOWED_IMAGES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_IMAGES.get(file.mimetype) || '.jpg';
      cb(null, `meal-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGES.has(file.mimetype)) {
      cb(new HttpError(400, 'Foto harus berformat JPG, PNG, atau WEBP.'));
      return;
    }
    cb(null, true);
  },
});

/* ------------------------------------------------------------------- users */

app.post('/api/users', async (req, res) => {
  const profile = parseProfile(req.body, { withEmail: true });

  // Email yang sama berarti pengguna lama: muat datanya, jangan buat baris baru.
  const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [profile.email]);
  if (existing.length) {
    res.json({ user: shapeUser(existing[0]), existed: true });
    return;
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, age, gender, height_cm, weight_kg, body_fat) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        profile.name,
        profile.email,
        profile.age,
        profile.gender,
        profile.heightCm,
        profile.weightKg,
        profile.bodyFat,
      ],
    );
    const user = await findUser(result.insertId);
    res.status(201).json({ user: shapeUser(user), existed: false });
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [profile.email]);
    if (!rows.length) throw error;
    res.json({ user: shapeUser(rows[0]), existed: true });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const user = await findUser(req.params.userId);
  res.json({ user: shapeUser(user) });
});

app.patch('/api/users/:userId', async (req, res) => {
  await findUser(req.params.userId);
  const profile = parseProfile(req.body);
  await pool.query(
    `UPDATE users
        SET name = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?, body_fat = ?
      WHERE id = ?`,
    [
      profile.name,
      profile.age,
      profile.gender,
      profile.heightCm,
      profile.weightKg,
      profile.bodyFat,
      req.params.userId,
    ],
  );
  const user = await findUser(req.params.userId);
  res.json({ user: shapeUser(user) });
});

/* ------------------------------------------------------------------- days */

function entryShape(row) {
  return {
    declaration: row?.declaration_text ?? '',
    steps: row?.steps === null || row?.steps === undefined ? null : Number(row.steps),
    sport: row?.sport ?? '',
    durationMinutes:
      row?.duration_minutes === null || row?.duration_minutes === undefined
        ? null
        : Number(row.duration_minutes),
  };
}

async function buildDay(userId, date) {
  const [[entry]] = await pool.query(
    'SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?',
    [userId, date],
  );
  const [mealRows] = await pool.query(
    'SELECT * FROM meals WHERE user_id = ? AND entry_date = ?',
    [userId, date],
  );

  const entryData = entryShape(entry);
  const meals = { breakfast: null, lunch: null, dinner: null };
  for (const row of mealRows) {
    meals[row.meal_type] = shapeMeal(row);
  }

  const mealCount = mealRows.length;
  const doneFields = [
    entryData.declaration.trim().length > 0,
    entryData.steps !== null,
    entryData.sport.trim().length > 0,
    entryData.durationMinutes !== null,
  ].filter(Boolean).length;
  const done = doneFields + mealCount;

  return {
    date,
    today: todayString(),
    aiReady: aiConfigured(),
    entry: entryData,
    meals,
    totals: {
      calories: Math.round(
        mealRows.reduce((sum, r) => sum + effectiveNutrition(r).calories, 0),
      ),
      proteinG:
        Math.round(
          mealRows.reduce((sum, r) => sum + effectiveNutrition(r).proteinG, 0) * 10,
        ) / 10,
      meals: mealCount,
    },
    progress: { done, total: 7 },
  };
}

app.get('/api/users/:userId/days/:date', async (req, res) => {
  const user = await findUser(req.params.userId);
  const { date } = req.params;
  if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
  res.json(await buildDay(user.id, date));
});

app.put('/api/users/:userId/days/:date/entry', async (req, res) => {
  const user = await findUser(req.params.userId);
  const { date } = req.params;
  if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
  if (date > todayString()) throw new HttpError(400, 'Belum bisa mengisi tanggal yang akan datang.');

  const declaration = String(req.body.declaration ?? '').trim().slice(0, 500);
  const steps = optionalInt(req.body.steps, 'Steps', 200000);
  const sport = optionalText(req.body.sport, 120);
  const durationMinutes = optionalInt(req.body.durationMinutes, 'Durasi', 1440);

  await pool.query(
    `INSERT INTO daily_entries (user_id, entry_date, declaration_text, steps, sport, duration_minutes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       declaration_text = VALUES(declaration_text),
       steps = VALUES(steps),
       sport = VALUES(sport),
       duration_minutes = VALUES(duration_minutes)`,
    [user.id, date, declaration, steps, sport, durationMinutes],
  );

  const day = await buildDay(user.id, date);
  res.json({ entry: day.entry, progress: day.progress });
});

/* ------------------------------------------------------------------ meals */

async function analyzeAndStore(mealRow) {
  const filePath = path.join(UPLOAD_DIR, path.basename(mealRow.photo_path));
  try {
    const result = await analyzeMealPhoto({
      filePath,
      mealLabel: MEAL_LABELS[mealRow.meal_type] ?? mealRow.meal_type,
    });
    await pool.query(
      `UPDATE meals SET food_name = ?, calories = ?, protein_g = ?, ai_status = 'done', ai_error = NULL
        WHERE id = ?`,
      [result.foodName, result.calories, result.proteinG, mealRow.id],
    );
  } catch (error) {
    console.error('Analisis AI gagal:', error.message);
    await pool.query(`UPDATE meals SET ai_status = 'failed', ai_error = ? WHERE id = ?`, [
      aiErrorMessage(error),
      mealRow.id,
    ]);
  }

  const [rows] = await pool.query('SELECT * FROM meals WHERE id = ?', [mealRow.id]);
  return shapeMeal(rows[0]);
}

app.post('/api/users/:userId/days/:date/meals', upload.single('photo'), async (req, res) => {
  try {
    const user = await findUser(req.params.userId);
    const { date } = req.params;
    const mealType = String(req.body.mealType ?? '');

    if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
    if (!MEAL_TYPES.includes(mealType)) throw new HttpError(400, 'Jenis makan tidak valid.');
    if (date > todayString()) throw new HttpError(400, 'Belum bisa mengisi tanggal yang akan datang.');
    if (!req.file) throw new HttpError(400, 'Foto makan wajib diunggah.');

    const [existing] = await pool.query(
      'SELECT * FROM meals WHERE user_id = ? AND entry_date = ? AND meal_type = ?',
      [user.id, date, mealType],
    );

    await pool.query(
      `INSERT INTO meals (user_id, entry_date, meal_type, photo_path, ai_status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         photo_path = VALUES(photo_path),
         ai_status = 'pending',
         ai_error = NULL,
         food_name = NULL,
         calories = NULL,
         protein_g = NULL`,
      [user.id, date, mealType, req.file.filename],
    );

    if (existing.length) await removePhoto(existing[0].photo_path);

    const [rows] = await pool.query(
      'SELECT * FROM meals WHERE user_id = ? AND entry_date = ? AND meal_type = ?',
      [user.id, date, mealType],
    );
    const meal = await analyzeAndStore(rows[0]);
    const day = await buildDay(user.id, date);

    res.status(201).json({ meal, totals: day.totals, progress: day.progress });
  } catch (error) {
    await removePhoto(req.file?.filename);
    throw error;
  }
});

app.put('/api/users/:userId/meals/:mealId', async (req, res) => {
  const user = await findUser(req.params.userId);
  const mealRow = await findMeal(user.id, req.params.mealId);
  if (mealRow.ai_status !== 'done') {
    throw new HttpError(400, 'Belum ada hasil AI yang bisa diedit.');
  }

  const food = String(req.body.food ?? '').trim();
  if (food.length < 3 || food.length > 160) {
    throw new HttpError(400, 'Deskripsi makanan harus 3-160 karakter.');
  }
  const calories = Math.round(parseNumber(req.body.calories, 'Kalori', { min: 0, max: 5000 }) * 10) / 10;
  const proteinG = Math.round(parseNumber(req.body.proteinG, 'Protein', { min: 0, max: 500 }) * 10) / 10;

  await pool.query(
    `UPDATE meals SET edited_food_name = ?, edited_calories = ?, edited_protein_g = ? WHERE id = ?`,
    [food, calories, proteinG, mealRow.id],
  );

  const [rows] = await pool.query('SELECT * FROM meals WHERE id = ?', [mealRow.id]);
  const day = await buildDay(user.id, mealRow.entry_date);
  res.json({ meal: shapeMeal(rows[0]), totals: day.totals, progress: day.progress });
});

app.delete('/api/users/:userId/meals/:mealId/edit', async (req, res) => {
  const user = await findUser(req.params.userId);
  const mealRow = await findMeal(user.id, req.params.mealId);

  await pool.query(
    `UPDATE meals SET edited_food_name = NULL, edited_calories = NULL, edited_protein_g = NULL WHERE id = ?`,
    [mealRow.id],
  );

  const [rows] = await pool.query('SELECT * FROM meals WHERE id = ?', [mealRow.id]);
  const day = await buildDay(user.id, mealRow.entry_date);
  res.json({ meal: shapeMeal(rows[0]), totals: day.totals, progress: day.progress });
});

app.post('/api/users/:userId/meals/:mealId/analyze', async (req, res) => {
  const user = await findUser(req.params.userId);
  const mealRow = await findMeal(user.id, req.params.mealId);

  await pool.query(
    `UPDATE meals SET ai_status = 'pending', ai_error = NULL WHERE id = ?`,
    [mealRow.id],
  );
  const meal = await analyzeAndStore(mealRow);
  const day = await buildDay(user.id, mealRow.entry_date);

  res.json({ meal, totals: day.totals, progress: day.progress });
});

app.delete('/api/users/:userId/meals/:mealId', async (req, res) => {
  const user = await findUser(req.params.userId);
  const mealRow = await findMeal(user.id, req.params.mealId);

  await pool.query('DELETE FROM meals WHERE id = ?', [mealRow.id]);
  await removePhoto(mealRow.photo_path);

  const day = await buildDay(user.id, mealRow.entry_date);
  res.json({ ok: true, totals: day.totals, progress: day.progress });
});

/* ---------------------------------------------------------------- overview */

app.get('/api/users/:userId/overview', async (req, res) => {
  const user = await findUser(req.params.userId);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 60);

  const [rows] = await pool.query(
    `SELECT entry_date, COUNT(*) AS meals,
            COALESCE(SUM(COALESCE(edited_calories, calories)), 0) AS calories
       FROM meals
      WHERE user_id = ?
      GROUP BY entry_date
      ORDER BY entry_date DESC`,
    [user.id],
  );

  const byDate = new Map(
    rows.map((r) => [
      r.entry_date,
      { meals: Number(r.meals), calories: Math.round(Number(r.calories)) },
    ]),
  );

  const history = [];
  const cursor = new Date(`${todayString()}T00:00:00`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const entry = byDate.get(key) ?? { meals: 0, calories: 0 };
    history.push({ date: key, ...entry });
  }

  let streak = 0;
  for (const day of [...history].reverse()) {
    if (day.meals === 0) {
      if (streak === 0) continue;
      break;
    }
    if (day.meals >= 3) streak += 1;
    else break;
  }

  res.json({ history, streak, totalMeals: history.reduce((sum, d) => sum + d.meals, 0) });
});

/* --------------------------------------------------------------- dashboard */

function addDaysISO(isoDate, amount) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + amount);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function summarizePeriod(user, entryMap, mealMap, startDate, periodDays) {
  const rec = user.recommendation;
  let trackedDays = 0;
  let meals = 0;
  let calories = 0;
  let proteinG = 0;
  let steps = 0;
  let minutes = 0;
  let proteinMetDays = 0;
  let calorieOverDays = 0;
  let completeDays = 0;

  for (let i = 0; i < periodDays; i += 1) {
    const date = addDaysISO(startDate, i);
    const entry = entryMap.get(`${user.id}|${date}`);
    const dayMeals = mealMap.get(`${user.id}|${date}`) ?? [];
    if (!entry && !dayMeals.length) continue;

    trackedDays += 1;
    const dayCalories = Math.round(
      dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).calories, 0),
    );
    const dayProtein = round1(
      dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).proteinG, 0),
    );

    meals += dayMeals.length;
    calories += dayCalories;
    proteinG += dayProtein;
    steps += Number(entry?.steps ?? 0);
    minutes += Number(entry?.duration_minutes ?? 0);

    if (dayProtein >= rec.proteinMinG) proteinMetDays += 1;
    if (dayCalories > rec.calorieMax) calorieOverDays += 1;

    const fields = [
      entry?.declaration_text?.trim().length > 0,
      entry?.steps !== null && entry?.steps !== undefined,
      entry?.sport?.trim().length > 0,
      entry?.duration_minutes !== null && entry?.duration_minutes !== undefined,
    ].filter(Boolean).length;
    if (fields + dayMeals.length >= 7) completeDays += 1;
  }

  return {
    days: periodDays,
    trackedDays,
    meals,
    calories: Math.round(calories),
    proteinG: round1(proteinG),
    steps,
    minutes,
    proteinMetDays,
    calorieOverDays,
    completeDays,
    avgCalories: trackedDays ? Math.round(calories / trackedDays) : 0,
    avgProteinG: trackedDays ? round1(proteinG / trackedDays) : 0,
    proteinTargetG: rec.proteinMinG,
    calorieTarget: rec.calorieMax,
  };
}

app.get('/api/dashboard', async (_req, res) => {
  const today = todayString();
  const start30 = addDaysISO(today, -29);

  const [userRows] = await pool.query('SELECT * FROM users ORDER BY id');
  const users = userRows.map(shapeUser);

  const [entryRows] = await pool.query(
    'SELECT * FROM daily_entries WHERE entry_date BETWEEN ? AND ?',
    [start30, today],
  );
  const [mealRows] = await pool.query(
    `SELECT user_id, entry_date, calories, protein_g, edited_calories, edited_protein_g
       FROM meals WHERE entry_date BETWEEN ? AND ?`,
    [start30, today],
  );

  const entryMap = new Map();
  for (const row of entryRows) entryMap.set(`${row.user_id}|${row.entry_date}`, row);

  const mealMap = new Map();
  for (const row of mealRows) {
    const key = `${row.user_id}|${row.entry_date}`;
    if (!mealMap.has(key)) mealMap.set(key, []);
    mealMap.get(key).push(row);
  }

  const result = users.map((user) => {
    const daily = summarizePeriod(user, entryMap, mealMap, today, 1);
    const weekly = summarizePeriod(user, entryMap, mealMap, addDaysISO(today, -6), 7);
    const monthly = summarizePeriod(user, entryMap, mealMap, start30, 30);

    const todayEntry = entryMap.get(`${user.id}|${today}`) ?? null;
    const todayMeals = mealMap.get(`${user.id}|${today}`) ?? [];
    const progressDone = [
      todayEntry?.declaration_text?.trim().length > 0,
      todayEntry?.steps !== null && todayEntry?.steps !== undefined,
      todayEntry?.sport?.trim().length > 0,
      todayEntry?.duration_minutes !== null && todayEntry?.duration_minutes !== undefined,
    ].filter(Boolean).length + todayMeals.length;

    Object.assign(daily, {
      date: today,
      tracked: daily.trackedDays > 0,
      declaration: todayEntry?.declaration_text ?? '',
      sport: todayEntry?.sport ?? '',
      steps: todayEntry?.steps ?? null,
      durationMinutes: todayEntry?.duration_minutes ?? null,
      proteinMet: daily.proteinG >= user.recommendation.proteinMinG && daily.proteinG > 0,
      calorieOver: daily.calories > user.recommendation.calorieMax,
      mealsComplete: todayMeals.length >= 3,
      progressDone,
    });

    let streak = 0;
    for (let i = 0; i < 30; i += 1) {
      const date = addDaysISO(today, -i);
      const count = (mealMap.get(`${user.id}|${date}`) ?? []).length;
      if (count === 0) {
        if (streak === 0) continue;
        break;
      }
      if (count >= 3) streak += 1;
      else break;
    }

    return { ...user, daily, weekly, monthly, streak };
  });

  const summary = {
    users: result.length,
    activeToday: result.filter((u) => u.daily.tracked).length,
    targetMetToday: result.filter(
      (u) => u.daily.tracked && u.daily.proteinMet && !u.daily.calorieOver,
    ).length,
    mealsToday: result.reduce((sum, u) => sum + u.daily.meals, 0),
    caloriesToday: result.reduce((sum, u) => sum + u.daily.calories, 0),
  };

  res.json({ today, summary, users: result });
});

/* ------------------------------------------------------------------ errors */

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
    return;
  }
  res.redirect('/');
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 6 MB.' : 'Gagal mengunggah foto.';
    res.status(400).json({ error: message });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

async function start() {
  try {
    await ensureDatabase();
    await ensureSchema();
    await pool.query('SELECT 1');
  } catch (error) {
    console.error('Tidak bisa terhubung ke database MySQL:', error.message);
    console.error('Periksa konfigurasi di file .env lalu jalankan `npm run db:init`.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Fit Intake berjalan di http://localhost:${PORT}`);
  });
}

start();
