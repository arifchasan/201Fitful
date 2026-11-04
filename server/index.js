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
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-store' : 'no-cache');
    },
  }),
);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));

/* ---------------------------------------------------------------- helpers */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['male', 'female']);
const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: 'Jarang bergerak' },
  light: { factor: 1.375, label: 'Aktivitas ringan' },
  moderate: { factor: 1.55, label: 'Aktivitas sedang' },
  active: { factor: 1.725, label: 'Aktivitas tinggi' },
  very_active: { factor: 1.9, label: 'Sangat aktif' },
};
const WEIGHT_GOALS = {
  lose: {
    delta: -500,
    band: [-500, -300],
    bandLabel: 'defisit 300–500 kkal',
    label: 'Turun berat',
  },
  maintain: {
    delta: 0,
    band: [-100, 100],
    bandLabel: 'sekitar kebutuhan',
    label: 'Jaga berat',
  },
  gain: {
    delta: 300,
    band: [200, 400],
    bandLabel: 'surplus 200–400 kkal',
    label: 'Naik berat',
  },
};
/** BMI tengah rentang normal, dipakai untuk berat badan ideal (quick method). */
const IDEAL_BMI = 22;
const PROTEIN_RANGE = { min: 1, max: 1.5 };
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = {
  breakfast: 'sarapan',
  lunch: 'makan siang',
  dinner: 'makan malam',
  snack: 'camilan',
};
const MEAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/**
 * Zona waktu tetap yang bisa dipilih pengguna. Semua perhitungan "hari ini"
 * dan timer puasa memakai offset ini, bukan zona waktu server/browser.
 */
const TIMEZONE_OFFSETS = new Map([
  [6, 'UTC+6'],
  [7, 'WIB (UTC+7)'],
  [8, 'WITA (UTC+8)'],
  [9, 'WIT (UTC+9)'],
]);
const DEFAULT_TZ_OFFSET = 7;

function tzOffsetOf(row) {
  const offset = Number(row?.tz_offset ?? row?.tzOffset);
  return TIMEZONE_OFFSETS.has(offset) ? offset : DEFAULT_TZ_OFFSET;
}

/** Tanggal YYYY-MM-DD menurut offset zona waktu pengguna. */
function todayString(offsetHours = -new Date().getTimezoneOffset() / 60) {
  return new Date(Date.now() + offsetHours * 3600000).toISOString().slice(0, 10);
}

/** Dinding jam (tanpa zona waktu) → milidetik epoch seolah UTC. */
function wallClockMs(value) {
  const date = localDate(value);
  if (!date) return null;
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
}

/** Mengambil bagian tanggal (YYYY-MM-DD) dari nilai DATE MySQL. */
function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const offset = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
  }
  return null;
}

/** Usia penuh dalam tahun, dihitung dari tanggal lahir. */
function ageFromBirthDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  const beforeBirthday =
    now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Catatan puasa memakai tanggal + jam, bukan sekadar jam. */
function parseDateTime(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const match = DATETIME_RE.exec(String(value).trim());
  if (!match || !isValidDate(match[1])) {
    throw new HttpError(400, `${label} harus berisi tanggal dan jam.`);
  }
  return `${match[1]} ${match[2]}:${match[3]}:00`;
}

/** "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM" untuk input datetime-local. */
function dateTimeInput(value) {
  if (!value) return null;
  return String(value).slice(0, 16).replace(' ', 'T');
}

function localDate(value) {
  if (!value) return null;
  const date = new Date(String(value).slice(0, 16).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Lama puasa dalam menit, dihitung dari catatan tanggal + jam. */
function fastingMinutes(lastMealAt, fastBreakAt) {
  const start = localDate(lastMealAt);
  const end = localDate(fastBreakAt);
  if (!start || !end) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return diff > 0 ? diff : null;
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

/** Berat badan ideal: IBW = 22 × tinggi(m)² (quick method). */
function idealWeightKg(heightCm) {
  const meters = heightCm / 100;
  return Math.round(IDEAL_BMI * meters * meters * 10) / 10;
}

/** Pembulatan kebutuhan kalori ke 10 kkal terdekat. */
function roundToTen(value) {
  return Math.round(value / 10) * 10;
}

/** Rentang kalori untuk satu target, tidak pernah di bawah BMR/1.200 kkal. */
function calorieBand(tdee, floor, [low, high]) {
  const calorieMin = roundToTen(Math.max(tdee + low, floor));
  const calorieMax = Math.max(calorieMin, roundToTen(Math.max(tdee + high, floor)));
  return { calorieMin, calorieMax };
}

/**
 * Anjuran harian (rentang, bukan satu angka):
 * 1. IBW = 22 × tinggi(m)² (BMI tengah normal).
 * 2. BMR Mifflin-St Jeor memakai IBW, bukan berat aktual.
 * 3. TDEE = BMR × faktor aktivitas.
 * 4. Kalori: TDEE + rentang defisit/surplus sesuai target berat.
 * 5. Protein: 1–1,5 g × IBW (1 g/kg adalah batas minimum quick method).
 */
function recommendations({ heightCm, age, gender, activityLevel, weightGoal }) {
  const ibwKg = idealWeightKg(heightCm);
  const bmr = Math.round(
    10 * ibwKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161),
  );
  const activity = ACTIVITY_LEVELS[activityLevel] ?? ACTIVITY_LEVELS.light;
  const goalKey = WEIGHT_GOALS[weightGoal] ? weightGoal : 'maintain';
  const goal = WEIGHT_GOALS[goalKey];
  const tdee = Math.round(bmr * activity.factor);
  const floor = Math.max(bmr, 1200);
  const current = calorieBand(tdee, floor, goal.band);

  const proteinMinG = Math.round(ibwKg * PROTEIN_RANGE.min);
  const proteinMaxG = Math.round(ibwKg * PROTEIN_RANGE.max);

  const goals = Object.entries(WEIGHT_GOALS).map(([key, entry]) => {
    const band = calorieBand(tdee, floor, entry.band);
    return {
      key,
      label: entry.label,
      bandLabel: entry.bandLabel,
      calorieMin: band.calorieMin,
      calorieMax: band.calorieMax,
      proteinMinG,
      proteinMaxG,
    };
  });

  return {
    ibwKg,
    idealBmi: IDEAL_BMI,
    bmr,
    tdee,
    activityLevel: ACTIVITY_LEVELS[activityLevel] ? activityLevel : 'light',
    activityFactor: activity.factor,
    activityLabel: activity.label,
    weightGoal: goalKey,
    weightGoalLabel: goal.label,
    calorieAdjustment: goal.delta,
    calorieBandLabel: goal.bandLabel,
    calorieMin: current.calorieMin,
    calorieMax: current.calorieMax,
    quickCaloriesLow: roundToTen(ibwKg * 20),
    quickCaloriesHigh: roundToTen(ibwKg * 25),
    proteinMinG,
    proteinMaxG,
    proteinPerKgIbw: PROTEIN_RANGE.min,
    proteinMaxPerKgIbw: PROTEIN_RANGE.max,
    goals,
  };
}

function shapeUser(row) {
  const heightCm = Number(row.height_cm);
  const weightKg = Number(row.weight_kg);
  const birthDate = dateOnly(row.birth_date);
  const age = birthDate ? ageFromBirthDate(birthDate) : Number(row.age);
  const profile = {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    birthDate,
    age,
    gender: row.gender,
    heightCm,
    weightKg,
    bodyFat: row.body_fat === null || row.body_fat === undefined ? null : Number(row.body_fat),
    activityLevel: row.activity_level ?? 'light',
    weightGoal: row.weight_goal ?? 'maintain',
    tzOffset: tzOffsetOf(row),
    tzLabel: TIMEZONE_OFFSETS.get(tzOffsetOf(row)),
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
    time: row.meal_time ? String(row.meal_time).slice(0, 5) : null,
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

function parseProfile(body, { withEmail = false, current = null } = {}) {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new HttpError(400, 'Nama harus 2-100 karakter.');
  }

  const tzOffset =
    body.tzOffset === undefined || body.tzOffset === null || body.tzOffset === ''
      ? current
        ? tzOffsetOf(current)
        : DEFAULT_TZ_OFFSET
      : Number(body.tzOffset);
  if (!TIMEZONE_OFFSETS.has(tzOffset)) {
    throw new HttpError(400, 'Zona waktu harus UTC+6, UTC+7, UTC+8, atau UTC+9.');
  }

  const birthDate = String(body.birthDate ?? '').trim().slice(0, 10);
  if (!isValidDate(birthDate)) {
    throw new HttpError(400, 'Tanggal lahir wajib diisi dengan format YYYY-MM-DD.');
  }
  if (birthDate > todayString(tzOffset)) {
    throw new HttpError(400, 'Tanggal lahir tidak boleh tanggal yang akan datang.');
  }
  const age = ageFromBirthDate(birthDate);
  if (age < 5 || age > 110) {
    throw new HttpError(400, 'Usia dari tanggal lahir harus antara 5 dan 110 tahun.');
  }

  if (!GENDERS.has(body.gender)) throw new HttpError(400, 'Gender harus "male" atau "female".');
  const heightCm = Math.round(parseNumber(body.heightCm, 'Tinggi badan', { min: 80, max: 250 }) * 10) / 10;
  const weightKg = Math.round(parseNumber(body.weightKg, 'Berat badan', { min: 20, max: 300 }) * 10) / 10;
  const bodyFat = optionalNumber(body.bodyFat, 'Body fat', { min: 2, max: 70 });

  const activityLevel = body.activityLevel
    ? String(body.activityLevel)
    : (current?.activity_level ?? 'light');
  if (!ACTIVITY_LEVELS[activityLevel]) {
    throw new HttpError(400, 'Aktivitas harian tidak dikenal.');
  }
  const weightGoal = body.weightGoal ? String(body.weightGoal) : (current?.weight_goal ?? 'maintain');
  if (!WEIGHT_GOALS[weightGoal]) throw new HttpError(400, 'Target berat badan tidak dikenal.');

  const profile = {
    name,
    birthDate,
    age,
    gender: body.gender,
    heightCm,
    weightKg,
    bodyFat,
    activityLevel,
    weightGoal,
    tzOffset,
  };
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
      `INSERT INTO users
         (name, email, birth_date, age, gender, height_cm, weight_kg, body_fat, activity_level, weight_goal, tz_offset)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.name,
        profile.email,
        profile.birthDate,
        profile.age,
        profile.gender,
        profile.heightCm,
        profile.weightKg,
        profile.bodyFat,
        profile.activityLevel,
        profile.weightGoal,
        profile.tzOffset,
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
  const current = await findUser(req.params.userId);
  const profile = parseProfile(req.body, { current });
  await pool.query(
    `UPDATE users
        SET name = ?, birth_date = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?, body_fat = ?,
            activity_level = ?, weight_goal = ?, tz_offset = ?
      WHERE id = ?`,
    [
      profile.name,
      profile.birthDate,
      profile.age,
      profile.gender,
      profile.heightCm,
      profile.weightKg,
      profile.bodyFat,
      profile.activityLevel,
      profile.weightGoal,
      profile.tzOffset,
      req.params.userId,
    ],
  );
  const user = await findUser(req.params.userId);
  res.json({ user: shapeUser(user) });
});

/* ------------------------------------------------------------------- days */

function entryShape(row) {
  const lastMealAt = dateTimeInput(row?.last_meal_at);
  const fastBreakAt = dateTimeInput(row?.fast_break_at);
  return {
    declaration: row?.declaration_text ?? '',
    steps: row?.steps === null || row?.steps === undefined ? null : Number(row.steps),
    sport: row?.sport ?? '',
    lastMealAt,
    fastBreakAt,
    fastingMinutes: fastingMinutes(lastMealAt, fastBreakAt),
    fastingTargetHours:
      row?.fasting_target_hours === null || row?.fasting_target_hours === undefined
        ? 16
        : Number(row.fasting_target_hours),
  };
}

/** Dinding jam saat ini di zona pengguna, format "YYYY-MM-DD HH:MM:00". */
function wallClockNow(tzOffset) {
  const wall = new Date(Date.now() + tzOffset * 3600000).toISOString();
  return `${wall.slice(0, 10)} ${wall.slice(11, 16)}:00`;
}

/** Jam dinding sekarang di zona pengguna, format "HH:MM". */
function mealTimeNow(tzOffset) {
  const wall = new Date(Date.now() + tzOffset * 3600000).toISOString();
  return wall.slice(11, 16);
}

/** Menit puasa yang masih berjalan (belum ada waktu buka puasa). */
function openFastingMinutes(entryData, tzOffset = DEFAULT_TZ_OFFSET) {
  if (!entryData?.lastMealAt || entryData.fastBreakAt) return null;
  const start = wallClockMs(entryData.lastMealAt);
  if (start === null) return null;
  return Math.max(0, Math.round((Date.now() + tzOffset * 3600000 - start) / 60000));
}

/**
 * Sesi puasa yang relevan untuk sebuah hari: milik hari itu sendiri, puasa yang
 * dimulai hari sebelumnya dan masih berjalan, atau puasa yang baru dibuka hari ini.
 */
async function fastingSessionFor(user, entry, date, today, tzOffset) {
  const ownStart = entry?.last_meal_at ? dateTimeInput(entry.last_meal_at) : null;
  const ownBreak = entry?.fast_break_at ? dateTimeInput(entry.fast_break_at) : null;
  const ownTarget = entry?.fasting_target_hours ? Number(entry.fasting_target_hours) : null;

  if (ownStart) {
    return {
      startAt: ownStart,
      breakAt: ownBreak,
      targetHours: ownTarget ?? 16,
      startDate: date,
      running: !ownBreak,
      inherited: false,
    };
  }
  if (date !== today) return null;

  // Puasa lintas tengah malam: dimulai kemarin, belum dibuka.
  const [openRows] = await pool.query(
    `SELECT * FROM daily_entries
      WHERE user_id = ? AND last_meal_at IS NOT NULL AND fast_break_at IS NULL
      ORDER BY last_meal_at DESC LIMIT 1`,
    [user.id],
  );
  const openRow = openRows[0];
  if (openRow) {
    const startAt = dateTimeInput(openRow.last_meal_at);
    return {
      startAt,
      breakAt: null,
      targetHours: openRow.fasting_target_hours ? Number(openRow.fasting_target_hours) : 16,
      startDate: startAt.slice(0, 10),
      running: true,
      inherited: startAt.slice(0, 10) !== date,
    };
  }

  // Puasa kemarin yang baru dibuka hari ini tetap ditampilkan hasilnya.
  const [doneRows] = await pool.query(
    `SELECT * FROM daily_entries
      WHERE user_id = ? AND fast_break_at IS NOT NULL AND DATE(fast_break_at) = ?
      ORDER BY fast_break_at DESC LIMIT 1`,
    [user.id, date],
  );
  const doneRow = doneRows[0];
  if (!doneRow) return null;
  const startAt = dateTimeInput(doneRow.last_meal_at);
  return {
    startAt,
    breakAt: dateTimeInput(doneRow.fast_break_at),
    targetHours: doneRow.fasting_target_hours ? Number(doneRow.fasting_target_hours) : 16,
    startDate: startAt.slice(0, 10),
    running: false,
    inherited: startAt.slice(0, 10) !== date,
  };
}

/** Entri dianggap berisi bila salah satu bagiannya diisi, termasuk catatan puasa. */
function entryHasContent(entryData) {
  return (
    entryData.declaration.trim().length > 0 ||
    entryData.steps !== null ||
    entryData.sport.trim().length > 0 ||
    Boolean(entryData.lastMealAt) ||
    Boolean(entryData.fastBreakAt)
  );
}

/** Aktivitas dianggap tercatat bila steps atau jenis olahraga terisi. */
function hasActivity(entryData) {
  return entryData.steps !== null || entryData.sport.trim().length > 0;
}

/** Progres hari: deklarasi, aktivitas, dan protein tercapai (bukan jumlah pola makan). */
function dayChecks(entryData, proteinG, proteinTargetG) {
  const checks = {
    declaration: entryData.declaration.trim().length > 0,
    activity: hasActivity(entryData),
    protein: proteinG > 0 && proteinG >= proteinTargetG,
  };
  return { done: Object.values(checks).filter(Boolean).length, total: 3, checks };
}

async function buildDay(userRow, date) {
  const user = shapeUser(userRow);
  const [[entry]] = await pool.query(
    'SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?',
    [user.id, date],
  );
  const [mealRows] = await pool.query(
    `SELECT * FROM meals WHERE user_id = ? AND entry_date = ?
      ORDER BY meal_time IS NULL, meal_time, id`,
    [user.id, date],
  );

  const today = todayString(user.tzOffset);
  const entryData = entryShape(entry);
  if (date === today) {
    const session = await fastingSessionFor(user, entry, date, today, user.tzOffset);
    entryData.fastingSession = session;
    entryData.fastingElapsedMinutes = session?.running
      ? openFastingMinutes({ lastMealAt: session.startAt, fastBreakAt: null }, user.tzOffset)
      : null;
    if (session) entryData.fastingTargetHours = session.targetHours;
  }
  const meals = mealRows.map(shapeMeal);

  const totals = {
    calories: Math.round(mealRows.reduce((sum, r) => sum + effectiveNutrition(r).calories, 0)),
    proteinG:
      Math.round(mealRows.reduce((sum, r) => sum + effectiveNutrition(r).proteinG, 0) * 10) /
      10,
    meals: mealRows.length,
  };

  return {
    date,
    today,
    aiReady: aiConfigured(),
    entry: entryData,
    meals,
    totals,
    progress: dayChecks(entryData, totals.proteinG, user.recommendation.proteinMinG),
  };
}

app.get('/api/users/:userId/days/:date', async (req, res) => {
  const user = await findUser(req.params.userId);
  const { date } = req.params;
  if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
  res.json(await buildDay(user, date));
});

app.put('/api/users/:userId/days/:date/entry', async (req, res) => {
  const user = await findUser(req.params.userId);
  const userTz = tzOffsetOf(user);
  const { date } = req.params;
  if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
  if (date > todayString(userTz)) {
    throw new HttpError(400, 'Belum bisa mengisi tanggal yang akan datang.');
  }

  const declaration = String(req.body.declaration ?? '').trim().slice(0, 500);
  const steps = optionalInt(req.body.steps, 'Steps', 200000);
  const sport = optionalText(req.body.sport, 120);
  const lastMealAt = parseDateTime(req.body.lastMealAt, 'Tanggal & waktu makan terakhir');
  const fastBreakAt = parseDateTime(req.body.fastBreakAt, 'Tanggal & waktu buka puasa');
  const fastingTargetHours = optionalInt(req.body.fastingTargetHours, 'Target puasa', 24) ?? 16;
  if (fastingTargetHours < 8) {
    throw new HttpError(400, 'Target puasa minimal 8 jam.');
  }

  // Waktu makan terakhir saja sudah cukup: timer puasa langsung berjalan.
  if (!lastMealAt && fastBreakAt) {
    throw new HttpError(400, 'Isi waktu makan terakhir sebelum waktu buka puasa.');
  }
  if (lastMealAt && fastBreakAt) {
    const minutes = fastingMinutes(lastMealAt, fastBreakAt);
    if (minutes === null) {
      throw new HttpError(400, 'Waktu buka puasa harus setelah makan terakhir.');
    }
    if (minutes > 7 * 24 * 60) {
      throw new HttpError(400, 'Rentang puasa maksimal 7 hari.');
    }
  }
  // Bandingkan dinding jam pengguna dengan "sekarang" di zona waktunya.
  const latest = Date.now() + userTz * 3600000 + 5 * 60000;
  for (const [value, label] of [
    [lastMealAt, 'Waktu makan terakhir'],
    [fastBreakAt, 'Waktu buka puasa'],
  ]) {
    if (value && wallClockMs(value) > latest) {
      throw new HttpError(400, `${label} belum terjadi.`);
    }
  }

  await pool.query(
    `INSERT INTO daily_entries
       (user_id, entry_date, declaration_text, steps, sport, last_meal_at, fast_break_at, fasting_target_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       declaration_text = VALUES(declaration_text),
       steps = VALUES(steps),
       sport = VALUES(sport),
       last_meal_at = VALUES(last_meal_at),
       fast_break_at = VALUES(fast_break_at),
       fasting_target_hours = VALUES(fasting_target_hours)`,
    [user.id, date, declaration, steps, sport, lastMealAt, fastBreakAt, fastingTargetHours],
  );

  const day = await buildDay(user, date);
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
    const tz = tzOffsetOf(user);
    const { date } = req.params;
    const mealType = String(req.body.mealType ?? '');

    if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
    if (!MEAL_TYPES.includes(mealType)) throw new HttpError(400, 'Jenis makan tidak valid.');
    if (date > todayString(tz)) {
      throw new HttpError(400, 'Belum bisa mengisi tanggal yang akan datang.');
    }
    if (!req.file) throw new HttpError(400, 'Foto makan wajib diunggah.');

    const mealTimeInput = String(req.body.mealTime ?? '').trim();
    if (mealTimeInput && !MEAL_TIME_RE.test(mealTimeInput)) {
      throw new HttpError(400, 'Waktu makan harus berformat HH:MM.');
    }
    // Catatan hari ini otomatis memakai jam sekarang bila waktunya tidak diisi.
    const mealTime = mealTimeInput || (date === todayString(tz) ? mealTimeNow(tz) : null);

    // Setiap makan adalah baris baru, jadi camilan dan makan tambahan tidak
    // saling menimpa slot sarapan/siang/malam.
    const [result] = await pool.query(
      `INSERT INTO meals (user_id, entry_date, meal_type, meal_time, photo_path, ai_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [user.id, date, mealType, mealTime, req.file.filename],
    );

    const [rows] = await pool.query('SELECT * FROM meals WHERE id = ?', [result.insertId]);
    const meal = await analyzeAndStore(rows[0]);
    const day = await buildDay(user, date);

    res.status(201).json({ meal, meals: day.meals, totals: day.totals, progress: day.progress });
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
  const day = await buildDay(user, mealRow.entry_date);
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
  const day = await buildDay(user, mealRow.entry_date);
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
  const day = await buildDay(user, mealRow.entry_date);

  res.json({ meal, totals: day.totals, progress: day.progress });
});

app.delete('/api/users/:userId/meals/:mealId', async (req, res) => {
  const user = await findUser(req.params.userId);
  const mealRow = await findMeal(user.id, req.params.mealId);

  await pool.query('DELETE FROM meals WHERE id = ?', [mealRow.id]);
  await removePhoto(mealRow.photo_path);

  const day = await buildDay(user, mealRow.entry_date);
  res.json({ ok: true, totals: day.totals, progress: day.progress });
});

/* ----------------------------------------------------------------- fasting */

app.post('/api/users/:userId/days/:date/fasting', async (req, res) => {
  const user = await findUser(req.params.userId);
  const tz = tzOffsetOf(user);
  const { date } = req.params;
  if (!isValidDate(date)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD.');
  if (date !== todayString(tz)) {
    throw new HttpError(400, 'Timer puasa hanya bisa dipakai untuk hari ini.');
  }

  const action = String(req.body.action ?? '');
  if (!['start', 'end', 'target'].includes(action)) {
    throw new HttpError(400, 'Aksi puasa tidak dikenal.');
  }

  const [[entry]] = await pool.query(
    'SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?',
    [user.id, date],
  );

  const targetInput = optionalInt(req.body.fastingTargetHours, 'Target puasa', 24);
  const currentTarget = entry?.fasting_target_hours ? Number(entry.fasting_target_hours) : 16;
  const target = targetInput ?? currentTarget;
  if (target < 8) throw new HttpError(400, 'Target puasa minimal 8 jam.');

  // Puasa yang masih terbuka bisa berasal dari hari sebelumnya (lintas tengah malam).
  const [openRows] = await pool.query(
    `SELECT * FROM daily_entries
      WHERE user_id = ? AND last_meal_at IS NOT NULL AND fast_break_at IS NULL
      ORDER BY last_meal_at DESC LIMIT 1`,
    [user.id],
  );
  const openFast = openRows[0] ?? null;
  let carriedOver = false;
  let alreadyRunning = false;

  if (action === 'target') {
    if (openFast) {
      await pool.query('UPDATE daily_entries SET fasting_target_hours = ? WHERE id = ?', [
        target,
        openFast.id,
      ]);
    } else {
      await pool.query(
        `INSERT INTO daily_entries (user_id, entry_date, fasting_target_hours)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE fasting_target_hours = VALUES(fasting_target_hours)`,
        [user.id, date, target],
      );
    }
  } else if (action === 'start') {
    // Hari berganti bukan alasan mereset timer: puasa yang masih berjalan dilanjutkan.
    if (openFast) {
      carriedOver = String(openFast.entry_date).slice(0, 10) !== date;
      alreadyRunning = !carriedOver;
      if (targetInput !== null) {
        await pool.query('UPDATE daily_entries SET fasting_target_hours = ? WHERE id = ?', [
          target,
          openFast.id,
        ]);
      }
    } else {
      // Zero-style: mulai puasa mencatat "makan terakhir" sekarang dan
      // mengosongkan waktu buka puasa supaya timer langsung berjalan.
      await pool.query(
        `INSERT INTO daily_entries (user_id, entry_date, last_meal_at, fast_break_at, fasting_target_hours)
         VALUES (?, ?, ?, NULL, ?)
         ON DUPLICATE KEY UPDATE
           last_meal_at = VALUES(last_meal_at),
           fast_break_at = NULL,
           fasting_target_hours = VALUES(fasting_target_hours)`,
        [user.id, date, wallClockNow(tz), target],
      );
    }
  } else {
    if (!openFast) {
      throw new HttpError(400, 'Mulai puasa dulu sebelum menyelesaikannya.');
    }
    const startWall = wallClockMs(dateTimeInput(openFast.last_meal_at));
    const finishedAt = wallClockNow(tz);
    const endWall = wallClockMs(finishedAt);
    const minutes = endWall === null || startWall === null ? null : (endWall - startWall) / 60000;
    if (minutes === null || minutes < 1) {
      throw new HttpError(400, 'Puasa baru dimulai. Tunggu sebentar sebelum menyelesaikannya.');
    }
    if (minutes > 7 * 24 * 60) {
      throw new HttpError(400, 'Rentang puasa maksimal 7 hari.');
    }
    await pool.query(
      'UPDATE daily_entries SET fast_break_at = ?, fasting_target_hours = ? WHERE id = ?',
      [finishedAt, target, openFast.id],
    );
  }

  const day = await buildDay(user, date);
  res.json({
    entry: day.entry,
    progress: day.progress,
    fasting: {
      targetHours: day.entry.fastingSession?.targetHours ?? target,
      running: Boolean(day.entry.fastingSession?.running),
      carriedOver,
      alreadyRunning,
    },
  });
});

/* ---------------------------------------------------------------- overview */

app.get('/api/users/:userId/overview', async (req, res) => {
  const userRow = await findUser(req.params.userId);
  const user = shapeUser(userRow);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 60);

  const [rows] = await pool.query(
    `SELECT entry_date, COUNT(*) AS meals,
            COALESCE(SUM(COALESCE(edited_calories, calories)), 0) AS calories,
            COALESCE(SUM(COALESCE(edited_protein_g, protein_g)), 0) AS protein
       FROM meals
      WHERE user_id = ?
      GROUP BY entry_date
      ORDER BY entry_date DESC`,
    [user.id],
  );

  const [entryRows] = await pool.query(
    'SELECT * FROM daily_entries WHERE user_id = ? AND entry_date >= ?',
    [user.id, addDaysISO(todayString(user.tzOffset), -60)],
  );
  const entryByDate = new Map(entryRows.map((row) => [row.entry_date, row]));

  const byDate = new Map(
    rows.map((r) => [
      r.entry_date,
      {
        meals: Number(r.meals),
        calories: Math.round(Number(r.calories)),
        protein: round1(Number(r.protein)),
      },
    ]),
  );

  const history = [];
  const cursor = new Date(`${todayString(user.tzOffset)}T00:00:00`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const mealData = byDate.get(key) ?? { meals: 0, calories: 0, protein: 0 };
    const entry = entryByDate.get(key);
    const checks = dayChecks(entryShape(entry), mealData.protein, user.recommendation.proteinMinG);
    history.push({
      date: key,
      meals: mealData.meals,
      calories: mealData.calories,
      tracked: entryHasContent(entryShape(entry)) || mealData.meals > 0,
      complete: checks.done === checks.total,
      progressDone: checks.done,
      progressTotal: checks.total,
    });
  }

  let streak = 0;
  for (const day of [...history].reverse()) {
    if (!day.tracked) {
      if (streak === 0) continue;
      break;
    }
    if (day.complete) streak += 1;
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
  let proteinMetDays = 0;
  let calorieOverDays = 0;
  let completeDays = 0;

  for (let i = 0; i < periodDays; i += 1) {
    const date = addDaysISO(startDate, i);
    const entry = entryMap.get(`${user.id}|${date}`);
    const dayMeals = mealMap.get(`${user.id}|${date}`) ?? [];
    const dayEntry = entryShape(entry);
    if (!entryHasContent(dayEntry) && !dayMeals.length) continue;

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

    if (dayProtein >= rec.proteinMinG) proteinMetDays += 1;
    if (dayCalories > rec.calorieMax) calorieOverDays += 1;

    // Hari lengkap: deklarasi + aktivitas + target protein tercapai.
    if (
      dayEntry.declaration.trim() &&
      hasActivity(dayEntry) &&
      dayProtein > 0 &&
      dayProtein >= rec.proteinMinG
    ) {
      completeDays += 1;
    }
  }

  return {
    days: periodDays,
    trackedDays,
    meals,
    calories: Math.round(calories),
    proteinG: round1(proteinG),
    steps,
    proteinMetDays,
    calorieOverDays,
    completeDays,
    avgCalories: trackedDays ? Math.round(calories / trackedDays) : 0,
    avgProteinG: trackedDays ? round1(proteinG / trackedDays) : 0,
    proteinTargetG: rec.proteinMinG,
    proteinMaxTargetG: rec.proteinMaxG,
    calorieTarget: rec.calorieMax,
    calorieMinTarget: rec.calorieMin,
  };
}

app.get('/api/dashboard', async (_req, res) => {
  // Zona waktu tiap pengguna bisa berbeda, jadi ambil rentang yang menutup semuanya.
  const serverToday = todayString();
  const queryStart = addDaysISO(serverToday, -32);
  const queryEnd = addDaysISO(serverToday, 2);

  const [userRows] = await pool.query('SELECT * FROM users ORDER BY id');
  const users = userRows.map(shapeUser);

  const [entryRows] = await pool.query(
    'SELECT * FROM daily_entries WHERE entry_date BETWEEN ? AND ?',
    [queryStart, queryEnd],
  );
  const [mealRows] = await pool.query(
    `SELECT user_id, entry_date, calories, protein_g, edited_calories, edited_protein_g
       FROM meals WHERE entry_date BETWEEN ? AND ?`,
    [queryStart, queryEnd],
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
    const today = todayString(user.tzOffset);
    const start30 = addDaysISO(today, -29);
    const daily = summarizePeriod(user, entryMap, mealMap, today, 1);
    const weekly = summarizePeriod(user, entryMap, mealMap, addDaysISO(today, -6), 7);
    const monthly = summarizePeriod(user, entryMap, mealMap, start30, 30);

    const todayEntry = entryMap.get(`${user.id}|${today}`) ?? null;
    const todayMeals = mealMap.get(`${user.id}|${today}`) ?? [];
    const todayEntryData = entryShape(todayEntry);
    const todayChecks = dayChecks(
      todayEntryData,
      daily.proteinG,
      user.recommendation.proteinMinG,
    );

    Object.assign(daily, {
      date: today,
      tracked: daily.trackedDays > 0,
      declaration: todayEntryData.declaration,
      sport: todayEntryData.sport,
      steps: todayEntryData.steps,
      lastMealAt: todayEntryData.lastMealAt,
      fastBreakAt: todayEntryData.fastBreakAt,
      fastingMinutes: todayEntryData.fastingMinutes,
      fastingElapsedMinutes: openFastingMinutes(todayEntryData, user.tzOffset),
      fastingTargetHours: todayEntryData.fastingTargetHours,
      proteinMet: daily.proteinG >= user.recommendation.proteinMinG && daily.proteinG > 0,
      calorieOver: daily.calories > user.recommendation.calorieMax,
      mealsComplete: todayMeals.length >= 3,
      progressDone: todayChecks.done,
      progressTotal: todayChecks.total,
      checks: todayChecks.checks,
    });

    let streak = 0;
    for (let i = 0; i < 30; i += 1) {
      const date = addDaysISO(today, -i);
      const dayEntry = entryShape(entryMap.get(`${user.id}|${date}`));
      const dayMeals = mealMap.get(`${user.id}|${date}`) ?? [];
      if (!entryHasContent(dayEntry) && !dayMeals.length) {
        if (streak === 0) continue;
        break;
      }
      const checks = dayChecks(
        dayEntry,
        round1(dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).proteinG, 0)),
        user.recommendation.proteinMinG,
      );
      if (checks.done === checks.total) streak += 1;
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

  res.json({ today: serverToday, summary, users: result });
});

/* ------------------------------------------------------- dashboard detail */

app.get('/api/dashboard/users/:userId', async (req, res) => {
  const userRow = await findUser(req.params.userId);
  const user = shapeUser(userRow);
  const today = todayString(user.tzOffset);
  const start = addDaysISO(today, -29);

  const [entryRows] = await pool.query(
    'SELECT * FROM daily_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ?',
    [user.id, start, today],
  );
  const [mealRows] = await pool.query(
    'SELECT * FROM meals WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date, id',
    [user.id, start, today],
  );

  const entryMap = new Map();
  for (const row of entryRows) entryMap.set(`${user.id}|${row.entry_date}`, row);

  const mealMap = new Map();
  for (const row of mealRows) {
    const key = `${user.id}|${row.entry_date}`;
    if (!mealMap.has(key)) mealMap.set(key, []);
    mealMap.get(key).push(row);
  }

  const daily = summarizePeriod(user, entryMap, mealMap, today, 1);
  const weekly = summarizePeriod(user, entryMap, mealMap, addDaysISO(today, -6), 7);
  const monthly = summarizePeriod(user, entryMap, mealMap, start, 30);

  const days = [];
  let streak = 0;
  for (let i = 29; i >= 0; i -= 1) {
    const date = addDaysISO(today, -i);
    const entry = entryMap.get(`${user.id}|${date}`);
    const dayMeals = mealMap.get(`${user.id}|${date}`) ?? [];
    const entryData = entryShape(entry);
    if (date === today) {
      entryData.fastingElapsedMinutes = openFastingMinutes(entryData, user.tzOffset);
    }

    const totals = {
      calories: Math.round(
        dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).calories, 0),
      ),
      proteinG: round1(
        dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).proteinG, 0),
      ),
      meals: dayMeals.length,
    };

    days.push({
      date,
      today: date === today,
      tracked: entryHasContent(entryData) || dayMeals.length > 0,
      entry: entryData,
      meals: dayMeals.map(shapeMeal),
      totals,
      progress: dayChecks(entryData, totals.proteinG, user.recommendation.proteinMinG),
    });
  }

  for (let i = 0; i < 30; i += 1) {
    const date = addDaysISO(today, -i);
    const dayEntry = entryShape(entryMap.get(`${user.id}|${date}`));
    const dayMeals = mealMap.get(`${user.id}|${date}`) ?? [];
    if (!entryHasContent(dayEntry) && !dayMeals.length) {
      if (streak === 0) continue;
      break;
    }
    const checks = dayChecks(
      dayEntry,
      round1(dayMeals.reduce((sum, meal) => sum + effectiveNutrition(meal).proteinG, 0)),
      user.recommendation.proteinMinG,
    );
    if (checks.done === checks.total) streak += 1;
    else break;
  }

  res.json({
    today,
    user,
    streak,
    summary: { daily, weekly, monthly },
    days,
  });
});

/* ------------------------------------------------------------------ errors */

app.get('/dashboard', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/dashboard/:userId', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'detail.html'));
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
    const messages = {
      LIMIT_FILE_SIZE: 'Foto terlalu besar (maksimal 6 MB). Coba ambil ulang foto.',
      LIMIT_FILE_COUNT: 'Hanya satu foto yang boleh diunggah.',
      LIMIT_UNEXPECTED_FILE: 'Hanya satu foto yang boleh diunggah.',
      LIMIT_PART_COUNT: 'Bagian unggahan terlalu banyak.',
      LIMIT_FIELD_COUNT: 'Kolom unggahan terlalu banyak.',
      LIMIT_FIELD_KEY: 'Nama kolom unggahan terlalu panjang.',
      LIMIT_FIELD_VALUE: 'Nilai kolom unggahan terlalu besar.',
    };
    res.status(400).json({
      error: messages[error.code] ?? `Gagal mengunggah foto (${error.code}).`,
    });
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
    console.log(`201Fitful berjalan di http://localhost:${PORT}`);
  });
}

start();
