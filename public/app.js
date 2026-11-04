/* Fit Intake — front-end logic (vanilla JS) */

const $ = (selector) => document.querySelector(selector);

const els = {
  topbar: $('#topbar'),
  viewOnboarding: $('#view-onboarding'),
  viewDashboard: $('#view-dashboard'),

  formProfile: $('#form-profile'),
  inputEmail: $('#input-email'),
  inputName: $('#input-name'),
  inputBirthDate: $('#input-birthdate'),
  inputHeight: $('#input-height'),
  inputWeight: $('#input-weight'),
  inputBodyFat: $('#input-bodyfat'),
  inputActivity: $('#input-activity'),
  inputTz: $('#input-tz'),
  bmiValue: $('#bmi-value'),
  bmiCategory: $('#bmi-category'),
  onboardingError: $('#onboarding-error'),
  btnSaveProfile: $('#btn-save-profile'),

  todayLabel: $('#today-label'),
  heroName: $('#hero-name'),
  heroSub: $('#hero-sub'),
  streakValue: $('#streak-value'),
  caloriesValue: $('#calories-value'),
  progressRing: $('#progress-ring'),
  progressPercent: $('#progress-percent'),
  progressCount: $('#progress-count'),

  recProteinTarget: $('#rec-protein-target'),
  recProteinBar: $('#rec-protein-bar'),
  recProteinNow: $('#rec-protein-now'),
  recCalorieTarget: $('#rec-calorie-target'),
  recCalorieBar: $('#rec-calorie-bar'),
  recCalorieNow: $('#rec-calorie-now'),
  recProteinBasis: $('#rec-protein-basis'),
  recCalorieBasis: $('#rec-calorie-basis'),
  recQuickMethod: $('#rec-quick-method'),
  recGoals: $('#rec-goals'),

  dayStrip: $('#day-strip'),
  formDay: $('#form-day'),
  inputDeclaration: $('#input-declaration'),
  inputSteps: $('#input-steps'),
  inputSport: $('#input-sport'),
  inputLastMeal: $('#input-lastmeal'),
  inputFastBreak: $('#input-fastbreak'),
  fastingActions: $('#fasting-actions'),
  fastingResult: $('#fasting-result'),
  btnFastStart: $('#btn-fast-start'),
  btnFastEnd: $('#btn-fast-end'),
  fastingStatus: $('#fasting-status'),
  fastingClock: $('#fasting-clock'),
  fastingBar: $('#fasting-bar'),
  fastingSub: $('#fasting-sub'),
  fastingTargets: $('.fasting-targets'),
  dayError: $('#day-error'),
  dayNote: $('#day-note'),
  btnSaveDay: $('#btn-save-day'),

  meals: $('#meals'),
  btnAddMeal: $('#btn-add-meal'),
  mealCounter: $('#meal-counter'),
  totalCalories: $('#total-calories'),
  totalProtein: $('#total-protein'),

  profileAvatar: $('#profile-avatar'),
  profileName: $('#profile-name'),
  profileSub: $('#profile-sub'),
  profileEmail: $('#profile-email'),
  statBirth: $('#stat-birth'),
  statGender: $('#stat-gender'),
  statHeight: $('#stat-height'),
  statWeight: $('#stat-weight'),
  statBodyFat: $('#stat-bodyfat'),
  statActivity: $('#stat-activity'),
  statGoal: $('#stat-goal'),
  statTz: $('#stat-tz'),
  statBmi: $('#stat-bmi'),
  statBmiCategory: $('#stat-bmi-category'),
  historyList: $('#history-list'),

  modalAddMeal: $('#modal-add-meal'),
  formAddMeal: $('#form-add-meal'),
  newMealTime: $('#new-meal-time'),
  newMealPhoto: $('#new-meal-photo'),
  newMealGallery: $('#new-meal-gallery'),
  btnPhotoCamera: $('#btn-photo-camera'),
  btnPhotoGallery: $('#btn-photo-gallery'),
  newMealPhotoInfo: $('#new-meal-photo-info'),
  newMealPreview: $('#new-meal-preview'),
  newMealError: $('#new-meal-error'),
  btnSaveNewMeal: $('#btn-save-new-meal'),

  modalEditMeal: $('#modal-edit-meal'),
  formEditMeal: $('#form-edit-meal'),
  editMealSub: $('#edit-meal-sub'),
  aiFood: $('#ai-food'),
  aiMacros: $('#ai-macros'),
  editMealFood: $('#edit-meal-food'),
  editMealCalories: $('#edit-meal-calories'),
  editMealProtein: $('#edit-meal-protein'),
  editMealError: $('#edit-meal-error'),
  btnResetMeal: $('#btn-reset-meal'),
  btnSaveMeal: $('#btn-save-meal'),

  modalProfile: $('#modal-profile'),
  formEditProfile: $('#form-edit-profile'),
  editEmail: $('#edit-email'),
  editName: $('#edit-name'),
  editBirthDate: $('#edit-birthdate'),
  editHeight: $('#edit-height'),
  editWeight: $('#edit-weight'),
  editBodyFat: $('#edit-bodyfat'),
  editActivity: $('#edit-activity'),
  editTz: $('#edit-tz'),
  editError: $('#edit-error'),

  toast: $('#toast'),
};

const STORAGE_KEY = 'fitintake.userId';
const GENDER_LABEL = { male: 'Pria', female: 'Wanita' };
const ACTIVITY_LABEL = {
  sedentary: 'Jarang',
  light: 'Ringan',
  moderate: 'Sedang',
  active: 'Tinggi',
  very_active: 'Sangat aktif',
};
const GOAL_LABEL = { lose: 'Turun', maintain: 'Jaga', gain: 'Naik' };
const FASTING_TARGETS = [12, 14, 16, 18, 20, 24, 72];
const TZ_LABELS = { 6: 'UTC+6', 7: 'WIB (UTC+7)', 8: 'WITA (UTC+8)', 9: 'WIT (UTC+9)' };
const MEAL_LABELS = {
  breakfast: 'Sarapan',
  lunch: 'Makan siang',
  dinner: 'Makan malam',
  snack: 'Camilan',
};
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_MAX_EDGE = 1280;
const PHOTO_QUALITY = 0.72;
const PHOTO_TARGET_BYTES = 900 * 1024;
const DAY_TOTAL = 3;

/** Offset zona waktu browser bila termasuk pilihan yang didukung, selain itu WIB. */
function browserTzOffset() {
  const offset = -new Date().getTimezoneOffset() / 60;
  return Number.isInteger(offset) && TZ_LABELS[offset] ? offset : 7;
}

// Offset zona waktu pengguna (6-9). Dipakai untuk tanggal "hari ini" dan timer puasa.
let userTzOffset = browserTzOffset();

const state = {
  user: null,
  selectedDate: todayISO(),
  day: null,
  history: [],
  busyMealId: null,
  mealView: {},
  editingMeal: null,
  fastingTarget: 16,
  fastingBusy: false,
};

/* ------------------------------------------------------------------ utils */

function todayISO() {
  return new Date(Date.now() + userTzOffset * 3600000).toISOString().slice(0, 10);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(value) {
  return new Date(`${value}T00:00:00`);
}

function addDays(isoDate, amount) {
  const d = parseISO(isoDate);
  d.setDate(d.getDate() + amount);
  return toISO(d);
}

function formatLongDate(isoDate) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseISO(isoDate));
}

function formatShortDate(isoDate) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(
    parseISO(isoDate),
  );
}

function formatTime(date = new Date()) {
  const wall = new Date(date.getTime() + userTzOffset * 3600000);
  const h = String(wall.getUTCHours()).padStart(2, '0');
  const m = String(wall.getUTCMinutes()).padStart(2, '0');
  return `${h}.${m}`;
}

function formatBirthDate(isoDate) {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseISO(isoDate));
}

function formatDateTimeShort(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Durasi menit → "12 jam 30 mnt". */
function durationText(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} mnt`;
  return `${hours} jam${rest ? ` ${rest} mnt` : ''}`;
}

/** Milidetik → "08:12:45" untuk timer puasa. */
function clockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
}

/** Waktu dinding (input datetime-local) → instant, memakai zona waktu pengguna. */
function parseLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const instant = Date.UTC(y, mo - 1, d, h, mi) - userTzOffset * 3600000;
  return Number.isNaN(instant) ? null : new Date(instant);
}

/** Rekomendasi setelah puasa selesai (gaya Zero): durasi + saran target. */
function fastingFeedback(minutes, targetHours) {
  const targetMinutes = targetHours * 60;
  if (minutes >= targetMinutes) {
    return {
      tone: 'good',
      text: `Target ${targetHours} jam tercapai. Cukupi cairan saat berbuka dan pertahankan pola ini.`,
    };
  }
  if (minutes >= 16 * 60) {
    return {
      tone: 'good',
      text: `Sudah di atas 16 jam. ${durationText(targetMinutes - minutes)} lagi menuju target ${targetHours} jam.`,
    };
  }
  if (minutes >= 12 * 60) {
    return {
      tone: 'mid',
      text: `Sudah masuk rentang 12–16 jam. Tambah ${durationText(
        targetMinutes - minutes,
      )} lagi untuk mencapai target ${targetHours} jam.`,
    };
  }
  return {
    tone: 'low',
    text: 'Puasa singkat. Untuk manfaat metabolik, coba target 12–16 jam pada puasa berikutnya.',
  };
}

/** Timer puasa: berjalan real-time dari waktu makan terakhir sampai buka puasa. */
function renderFasting() {
  const target = state.fastingTarget || 16;
  const targetMinutes = target * 60;
  const isToday = state.selectedDate === todayISO();

  if (els.fastingTargets) {
    els.fastingTargets.querySelectorAll('[data-target]').forEach((button) => {
      const active = Number(button.dataset.target) === target;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  // Sesi puasa bisa berasal dari hari sebelumnya (lintas tengah malam).
  const session = state.day?.entry?.fastingSession ?? null;
  const start = parseLocalDateTime(session?.startAt ?? els.inputLastMeal.value);
  const end = session
    ? parseLocalDateTime(session.breakAt) || null
    : parseLocalDateTime(els.inputFastBreak.value);
  const setBar = (percent, done = false) => {
    els.fastingBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    els.fastingBar.classList.toggle('is-done', done);
  };

  els.fastingResult.hidden = true;
  els.fastingResult.className = 'fasting-result';
  els.fastingResult.innerHTML = '';
  els.fastingActions.hidden = !isToday;
  const running = Boolean(start) && !end;
  els.btnFastEnd.hidden = !running;
  els.btnFastStart.hidden = running;
  els.btnFastStart.textContent = end ? 'Mulai puasa lagi' : 'Mulai berpuasa';
  els.btnFastStart.disabled = state.fastingBusy;
  els.btnFastEnd.disabled = state.fastingBusy;

  if (!start) {
    els.fastingStatus.textContent = 'Puasa belum dimulai';
    els.fastingClock.textContent = '00:00:00';
    setBar(0);
    els.fastingSub.textContent = 'Tekan “Mulai berpuasa” setelah selesai makan.';
    return;
  }

  if (end) {
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes <= 0) {
      els.fastingStatus.textContent = 'Waktu belum valid';
      els.fastingClock.textContent = '—';
      setBar(0);
      els.fastingSub.textContent = 'Buka puasa harus setelah waktu makan terakhir.';
      return;
    }
    const reached = minutes >= targetMinutes;
    const feedback = fastingFeedback(minutes, target);
    els.fastingStatus.textContent = reached ? `Target ${target} jam tercapai` : 'Puasa selesai';
    els.fastingClock.textContent = durationText(minutes);
    setBar((minutes / targetMinutes) * 100, reached);
    els.fastingSub.textContent = `${formatDateTimeShort(
      session?.startAt ?? els.inputLastMeal.value,
    )} → ${formatDateTimeShort(session?.breakAt ?? els.inputFastBreak.value)} · target ${
      target
    } jam${session?.inherited ? ' · lanjut dari kemarin' : ''}`;
    els.fastingResult.hidden = false;
    els.fastingResult.className = `fasting-result is-${feedback.tone}`;
    els.fastingResult.innerHTML = `<span>Puasa selesai</span><strong>${durationText(
      minutes,
    )}</strong><p>${esc(feedback.text)}</p>`;
    return;
  }

  if (!isToday) {
    els.fastingStatus.textContent = 'Buka puasa belum dicatat';
    els.fastingClock.textContent = '—';
    setBar(0);
    els.fastingSub.textContent = `Mulai ${formatDateTimeShort(els.inputLastMeal.value)} · target ${target} jam`;
    return;
  }

  const elapsedMs = Date.now() - start.getTime();
  if (elapsedMs < 0) {
    els.fastingStatus.textContent = 'Belum dimulai';
    els.fastingClock.textContent = '00:00:00';
    setBar(0);
    els.fastingSub.textContent = 'Waktu makan terakhir masih di masa depan.';
    return;
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const remaining = targetMinutes - elapsedMinutes;
  const breakAt = new Date(start.getTime() + targetMinutes * 60000);
  els.fastingClock.textContent = clockText(elapsedMs);
  const carried = session?.inherited ? ' · lanjut dari kemarin' : '';
  els.fastingStatus.textContent =
    remaining <= 0
      ? `Target ${target} jam tercapai${carried}`
      : `Puasa berjalan · target ${target} jam${carried}`;
  setBar((elapsedMinutes / targetMinutes) * 100, remaining <= 0);
  els.fastingSub.textContent =
    remaining <= 0
      ? `Lebih ${durationText(-remaining)} dari target · target buka ${formatTime(breakAt)}`
      : `${durationText(remaining)} lagi · target buka ${formatTime(breakAt)}`;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bmiFor(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  if (!Number.isFinite(bmi)) return null;
  let category = 'Obesitas';
  if (bmi < 18.5) category = 'Kurang';
  else if (bmi < 25) category = 'Ideal';
  else if (bmi < 30) category = 'Berlebih';
  return { value: Math.round(bmi * 10) / 10, category };
}

let toastTimer = null;
function toast(message, type = 'success') {
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', type === 'error');
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
    setTimeout(() => {
      els.toast.hidden = true;
    }, 200);
  }, 3000);
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Permintaan gagal (${response.status}).`);
  }
  return payload;
}

function userPath(suffix = '') {
  return `/api/users/${state.user.id}${suffix}`;
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  setupDateInputs();
  els.inputTz.value = String(userTzOffset);
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (!savedId) {
    showOnboarding();
    return;
  }

  try {
    const { user } = await api(`/api/users/${savedId}`);
    state.user = user;
    userTzOffset = user.tzOffset ?? browserTzOffset();
    setupDateInputs();
    state.selectedDate = todayISO();
    await showDashboard();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    showOnboarding();
  }
}

function showOnboarding() {
  els.topbar.hidden = true;
  els.viewDashboard.hidden = true;
  els.viewOnboarding.hidden = false;
  els.inputName.focus();
}

async function showDashboard() {
  els.topbar.hidden = false;
  els.viewOnboarding.hidden = true;
  els.viewDashboard.hidden = false;
  renderProfile();
  els.todayLabel.textContent = formatLongDate(todayISO());
  await refreshData();
}

async function refreshData() {
  try {
    await Promise.all([loadDay(state.selectedDate), loadOverview()]);
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* --------------------------------------------------------------- profile */

function renderProfile() {
  const user = state.user;
  if (!user) return;
  const bmi = bmiFor(user.heightCm, user.weightKg);

  els.profileAvatar.textContent = (user.name.trim()[0] || 'F').toUpperCase();
  els.profileName.textContent = user.name;
  els.profileSub.textContent = `${user.age} tahun · ${GENDER_LABEL[user.gender] ?? '-'}`;
  els.profileEmail.textContent = user.email ?? '—';
  els.statBirth.textContent = formatBirthDate(user.birthDate);
  els.statGender.textContent = GENDER_LABEL[user.gender] ?? '-';
  els.statHeight.textContent = `${user.heightCm} cm`;
  els.statWeight.textContent = `${user.weightKg} kg`;
  els.statBodyFat.textContent = user.bodyFat ? `${user.bodyFat}%` : '—';
  els.statActivity.textContent = ACTIVITY_LABEL[user.activityLevel] ?? '—';
  els.statGoal.textContent = GOAL_LABEL[user.weightGoal] ?? '—';
  els.statTz.textContent = user.tzLabel ?? TZ_LABELS[user.tzOffset] ?? '—';
  els.statBmi.textContent = bmi ? bmi.value.toFixed(1) : '—';
  els.statBmiCategory.textContent = bmi ? bmi.category : '—';
  els.heroName.textContent = user.name.trim().split(/\s+/)[0];
}

/* ------------------------------------------------------------------- day */

async function loadDay(date) {
  const data = await api(userPath(`/days/${date}`));
  state.day = data;
  els.inputDeclaration.value = data.entry.declaration ?? '';
  els.inputSteps.value = data.entry.steps ?? '';
  els.inputSport.value = data.entry.sport ?? '';
  els.inputLastMeal.value = data.entry.lastMealAt ?? '';
  els.inputFastBreak.value = data.entry.fastBreakAt ?? '';
  state.fastingTarget = data.entry.fastingTargetHours ?? 16;
  renderFasting();
  showError(els.dayError, '');
  els.dayNote.textContent = '';
  renderDayStrip();
  renderMeals();
  renderHeroProgress();
}

function renderDayStrip() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(todayISO(), -i));
  if (!days.includes(state.selectedDate)) days.unshift(state.selectedDate);

  els.dayStrip.innerHTML = days
    .map((date) => {
      const isSelected = date === state.selectedDate;
      const isToday = date === todayISO();
      const previous = state.history.find((d) => d.date === date);
      const classes = ['day-btn'];
      if (isSelected) classes.push('is-selected');
      if (isToday) classes.push('is-today');
      if (previous?.complete) classes.push('is-complete');
      else if (previous?.tracked) classes.push('has-progress');

      const title = previous?.complete
        ? 'Hari lengkap'
        : previous?.tracked
          ? `${previous.progressDone}/${previous.progressTotal} bagian`
          : 'Belum ada catatan';

      return `
        <button type="button" class="${classes.join(' ')}" data-date="${date}" aria-pressed="${isSelected}" title="${title}">
          <span class="dow">${new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(parseISO(date))}</span>
          <span class="dom">${parseISO(date).getDate()}</span>
          <span class="day-dot"></span>
        </button>`;
    })
    .join('');
}

function renderRecommendation() {
  const rec = state.user?.recommendation;
  if (!rec) return;
  const totals = state.day?.totals ?? { calories: 0, proteinG: 0 };
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const n = (value) => {
    const parsed = toNumber(value);
    return parsed === null ? '—' : parsed.toLocaleString('id-ID');
  };
  const range = (min, max, unit = '') => {
    const low = toNumber(min);
    const high = toNumber(max);
    return low === null || high === null ? '—' : `${n(low)}–${n(high)}${unit}`;
  };

  const proteinMin = toNumber(rec.proteinMinG);
  const calorieMax = toNumber(rec.calorieMax);

  els.recProteinTarget.textContent = range(rec.proteinMinG, rec.proteinMaxG, ' g');
  els.recProteinNow.textContent =
    proteinMin === null
      ? `${n(totals.proteinG)} g`
      : `${n(totals.proteinG)} g · minimum ${n(proteinMin)} g`;
  els.recProteinBar.style.width =
    proteinMin && proteinMin > 0
      ? `${Math.min(100, Math.round((totals.proteinG / proteinMin) * 100))}%`
      : '0%';

  const caloriePercent = calorieMax ? Math.round((totals.calories / calorieMax) * 100) : 0;
  els.recCalorieTarget.textContent = range(rec.calorieMin, rec.calorieMax, ' kkal');
  els.recCalorieNow.textContent = `${totals.calories.toLocaleString('id-ID')} kkal`;
  els.recCalorieBar.style.width = `${Math.min(100, caloriePercent)}%`;
  els.recCalorieBar.classList.toggle('is-over', caloriePercent > 100);

  els.recProteinBasis.textContent = `${
    rec.proteinPerKgIbw ?? 1
  }–${rec.proteinMaxPerKgIbw ?? 1.5} g × BB ideal ${n(rec.ibwKg)} kg`;
  els.recCalorieBasis.textContent = `BMR ${n(rec.bmr)} kkal × ${rec.activityFactor} (${
    rec.activityLabel
  }) = ${n(rec.tdee)} kkal TDEE · ${rec.calorieBandLabel ?? 'target'} → ${n(
    rec.calorieMin,
  )}–${n(rec.calorieMax)} kkal`;
  els.recQuickMethod.textContent = `Quick method (IBW × 20–25): ${n(
    rec.quickCaloriesLow,
  )}–${n(rec.quickCaloriesHigh)} kkal`;

  els.recGoals.innerHTML = (rec.goals ?? [])
    .map(
      (goal) => `
        <div class="rec-goal ${goal.key === rec.weightGoal ? 'is-active' : ''}">
          <span>${esc(goal.label)}${goal.key === rec.weightGoal ? ' · aktif' : ''}</span>
          <strong>${n(goal.calorieMin)}–${n(goal.calorieMax)} kkal</strong>
          <em>Protein ${n(goal.proteinMinG)}–${n(goal.proteinMaxG)} g</em>
        </div>`,
    )
    .join('');
}

function renderHeroProgress() {
  const progress = state.day?.progress ?? { done: 0, total: DAY_TOTAL };
  const totals = state.day?.totals ?? { calories: 0 };
  const percent = Math.round((progress.done / DAY_TOTAL) * 100);

  els.progressRing.style.setProperty('--p', percent);
  els.progressPercent.textContent = `${percent}%`;
  els.progressCount.textContent = `${progress.done}/${DAY_TOTAL}`;
  els.caloriesValue.textContent = totals.calories.toLocaleString('id-ID');
  renderRecommendation();

  if (progress.done === 0) els.heroSub.textContent = 'Belum ada catatan.';
  else if (progress.done >= DAY_TOTAL) els.heroSub.textContent = 'Lengkap.';
  else els.heroSub.textContent = `${DAY_TOTAL - progress.done} bagian lagi.`;
}

/* ----------------------------------------------------------------- meals */

function mealCardHtml(meal) {
  const view = state.mealView[meal.id] === 'before' ? 'before' : 'after';
  const shown =
    view === 'before'
      ? meal.ai
      : { food: meal.food, calories: meal.calories, proteinG: meal.proteinG };
  const busy = state.busyMealId === meal.id;
  const label = MEAL_LABELS[meal.type] ?? meal.type;

  const status = (() => {
    if (meal.aiStatus === 'done') {
      return `<p class="meal-macros"><strong>${Math.round(shown.calories)}</strong> kkal · <strong>${shown.proteinG}</strong> g protein</p>`;
    }
    if (meal.aiStatus === 'failed') {
      return `<p class="meal-error">${esc(meal.aiError || 'Analisis gagal.')}</p>
        <button type="button" class="link-btn" data-action="reanalyze">Coba lagi</button>`;
    }
    return `<p class="meal-pending">Menganalisis…</p>`;
  })();

  const viewSwitch = meal.edited
    ? `<div class="view-switch" role="group" aria-label="Tampilan hasil">
         <button type="button" data-action="view" data-view="before" class="${view === 'before' ? 'is-active' : ''}" aria-pressed="${view === 'before'}">AI</button>
         <button type="button" data-action="view" data-view="after" class="${view === 'after' ? 'is-active' : ''}" aria-pressed="${view === 'after'}">Suntingan</button>
       </div>`
    : '';

  return `
    <article class="meal has-photo ${busy ? 'is-busy' : ''}" data-meal-id="${meal.id}">
      <div class="meal-head">
        <h3>${label}${meal.time ? `<span class="meal-time">${esc(meal.time)}</span>` : ''}</h3>
        ${meal.aiStatus === 'done' && shown.calories !== null ? `<span class="meal-badge">${Math.round(shown.calories)} kkal</span>` : ''}
      </div>

      <div class="meal-photo">
        <a href="${esc(meal.photoUrl)}" target="_blank" rel="noopener" aria-label="Lihat foto ${label}">
          <img src="${esc(meal.photoUrl)}" alt="Foto ${label}" loading="lazy" />
        </a>
        ${busy ? '<span class="meal-loading"><span class="spinner"></span>Menganalisis…</span>' : ''}
      </div>

      <div class="meal-info">
        ${shown?.food ? `<p class="meal-food">${esc(shown.food)}</p>` : ''}
        ${status}
        ${viewSwitch}
        <div class="meal-actions">
          ${meal.aiStatus === 'done' ? '<button type="button" class="link-btn" data-action="edit">Edit</button>' : ''}
          <button type="button" class="link-btn danger" data-action="remove">Hapus</button>
        </div>
      </div>
    </article>`;
}

function emptyMealsHtml() {
  return `<div class="meals-empty">
    <p>Belum ada catatan makan. Tambahkan sarapan, makan utama, atau camilan kapan saja.</p>
    <button type="button" class="btn btn-primary btn-sm" data-action="add">+ Tambah makan</button>
  </div>`;
}

function renderMeals() {
  const meals = state.day?.meals ?? [];
  els.meals.innerHTML = meals.length ? meals.map(mealCardHtml).join('') : emptyMealsHtml();

  const totals = state.day?.totals ?? { calories: 0, proteinG: 0, meals: 0 };
  els.mealCounter.textContent = `${totals.meals} makan`;
  els.totalCalories.textContent = `${totals.calories.toLocaleString('id-ID')} kkal`;
  els.totalProtein.textContent = `${totals.proteinG} g`;
}

function applyMealResponse(payload) {
  if (Array.isArray(payload.meals)) {
    state.day.meals = payload.meals;
  } else if (payload.meal) {
    const list = state.day.meals ?? [];
    const index = list.findIndex((item) => item.id === payload.meal.id);
    if (index >= 0) list[index] = payload.meal;
    else list.push(payload.meal);
    list.sort(
      (a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id - b.id,
    );
    state.day.meals = list;
  }
  state.day.totals = payload.totals ?? state.day.totals;
  state.day.progress = payload.progress ?? state.day.progress;
  renderMeals();
  renderHeroProgress();
}

/** Jam dinding sekarang di zona pengguna, format "HH:MM". */
function currentWallTime() {
  const wall = new Date(Date.now() + userTzOffset * 3600000);
  return `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
}

function defaultMealType(time) {
  const hour = Number(String(time || currentWallTime()).slice(0, 2));
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 20) return 'dinner';
  return 'snack';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File foto tidak bisa dibaca. Coba ambil ulang dengan kamera.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Foto kamera/galeri diperkecil otomatis: sisi terpanjang 1280 px, JPEG ±0,9 MB. */
async function compressPhoto(file) {
  const image = await loadImageFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Ukuran foto tidak terbaca. Coba foto lain.');

  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser ini tidak bisa memperkecil foto.');
  context.drawImage(image, 0, 0, width, height);

  let quality = PHOTO_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > PHOTO_TARGET_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob) throw new Error('Foto gagal dikompres. Coba lagi atau pilih foto lain.');

  const base = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
  const compressed = new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  return { file: compressed.size < file.size ? compressed : file, width, height };
}

function resetNewMealPhoto() {
  state.newMealFile = null;
  if (state.newMealPreviewUrl) {
    URL.revokeObjectURL(state.newMealPreviewUrl);
    state.newMealPreviewUrl = null;
  }
  els.newMealPreview.hidden = true;
  els.newMealPreview.removeAttribute('src');
  els.newMealPhotoInfo.hidden = true;
  els.newMealPhotoInfo.textContent = '';
  els.newMealPhoto.value = '';
  els.newMealGallery.value = '';
}

/** Foto dari kamera maupun galeri melewati kompresi yang sama. */
async function useNewMealPhoto(input) {
  const file = input.files?.[0] ?? null;
  resetNewMealPhoto();
  showError(els.newMealError, '');
  if (!file) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    const message = 'Format foto harus JPG, PNG, atau WEBP.';
    input.value = '';
    showError(els.newMealError, message);
    window.alert(`Foto tidak bisa dipakai: ${message}`);
    return;
  }

  els.newMealPhotoInfo.hidden = false;
  els.newMealPhotoInfo.textContent = `Memperkecil foto… (${formatBytes(file.size)})`;
  els.btnSaveNewMeal.disabled = true;
  try {
    const result = await compressPhoto(file);
    state.newMealFile = result.file;
    els.newMealPhotoInfo.textContent = `Siap diunggah: ${result.width}×${result.height} px · ${formatBytes(
      result.file.size,
    )}`;
    state.newMealPreviewUrl = URL.createObjectURL(result.file);
    els.newMealPreview.src = state.newMealPreviewUrl;
    els.newMealPreview.hidden = false;
  } catch (error) {
    input.value = '';
    showError(els.newMealError, error.message);
    window.alert(`Foto tidak bisa dipakai: ${error.message}`);
  } finally {
    els.btnSaveNewMeal.disabled = false;
  }
}

els.newMealPhoto.addEventListener('change', () => useNewMealPhoto(els.newMealPhoto));
els.newMealGallery.addEventListener('change', () => useNewMealPhoto(els.newMealGallery));
els.btnPhotoCamera.addEventListener('click', () => els.newMealPhoto.click());
els.btnPhotoGallery.addEventListener('click', () => els.newMealGallery.click());

function openAddMeal() {
  els.formAddMeal.reset();
  resetNewMealPhoto();
  els.newMealTime.value = currentWallTime();
  const type = defaultMealType(els.newMealTime.value);
  els.formAddMeal.querySelector(`input[name="newMealType"][value="${type}"]`).checked = true;
  showError(els.newMealError, '');
  openModal('modal-add-meal');
}

async function deleteMeal(meal) {
  const label = MEAL_LABELS[meal.type]?.toLowerCase() ?? 'makan';
  const ok = window.confirm(
    `Hapus catatan ${label}${meal.time ? ` pukul ${meal.time}` : ''}?`,
  );
  if (!ok) return;
  try {
    const payload = await api(userPath(`/meals/${meal.id}`), { method: 'DELETE' });
    state.day.meals = (state.day.meals ?? []).filter((item) => item.id !== meal.id);
    delete state.mealView[meal.id];
    state.day.totals = payload.totals;
    state.day.progress = payload.progress;
    renderMeals();
    renderHeroProgress();
    await loadOverview();
    toast('Catatan makan dihapus.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reanalyzeMeal(meal) {
  state.busyMealId = meal.id;
  renderMeals();
  try {
    const payload = await api(userPath(`/meals/${meal.id}/analyze`), { method: 'POST' });
    applyMealResponse(payload);
    if (payload.meal?.aiStatus === 'failed') {
      toast(payload.meal.aiError || 'Analisis AI gagal.', 'error');
    } else {
      toast('Analisis berhasil.');
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busyMealId = null;
    renderMeals();
  }
}

/* ------------------------------------------------------------ interactions */

els.dayStrip.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-date]');
  if (!button || button.dataset.date === state.selectedDate) return;
  state.selectedDate = button.dataset.date;
  try {
    await loadDay(state.selectedDate);
  } catch (error) {
    toast(error.message, 'error');
  }
});

els.formDay.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(els.dayError, '');
  els.btnSaveDay.disabled = true;

  const payload = {
    declaration: els.inputDeclaration.value.trim(),
    steps: els.inputSteps.value === '' ? null : Number(els.inputSteps.value),
    sport: els.inputSport.value.trim(),
    lastMealAt: els.inputLastMeal.value || null,
    fastBreakAt: els.inputFastBreak.value || null,
    fastingTargetHours: state.fastingTarget,
  };

  if (!payload.lastMealAt && payload.fastBreakAt) {
    showError(els.dayError, 'Isi waktu makan terakhir sebelum waktu buka puasa.');
    els.btnSaveDay.disabled = false;
    return;
  }
  if (
    payload.lastMealAt &&
    payload.fastBreakAt &&
    new Date(payload.fastBreakAt) <= new Date(payload.lastMealAt)
  ) {
    showError(els.dayError, 'Waktu buka puasa harus setelah makan terakhir.');
    els.btnSaveDay.disabled = false;
    return;
  }

  try {
    const result = await api(userPath(`/days/${state.selectedDate}/entry`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.day.entry = result.entry;
    state.day.progress = result.progress;
    els.inputDeclaration.value = result.entry.declaration;
    els.inputLastMeal.value = result.entry.lastMealAt ?? '';
    els.inputFastBreak.value = result.entry.fastBreakAt ?? '';
    state.fastingTarget = result.entry.fastingTargetHours ?? state.fastingTarget;
    renderFasting();
    els.dayNote.textContent = `Tersimpan ${formatTime()}`;
    renderHeroProgress();
    toast('Tersimpan.');
  } catch (error) {
    showError(els.dayError, error.message);
  } finally {
    els.btnSaveDay.disabled = false;
  }
});

els.btnAddMeal.addEventListener('click', openAddMeal);

els.formAddMeal.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(els.newMealError, '');

  const file =
    state.newMealFile ?? els.newMealPhoto.files?.[0] ?? els.newMealGallery.files?.[0];
  const mealType = els.formAddMeal.querySelector('input[name="newMealType"]:checked')?.value;
  const mealTime = els.newMealTime.value;

  if (!file) {
    showError(els.newMealError, 'Pilih foto makan dulu.');
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showError(els.newMealError, 'Format foto: JPG, PNG, atau WEBP.');
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const message = 'Foto masih lebih dari 6 MB setelah diperkecil. Coba ambil ulang foto.';
    showError(els.newMealError, message);
    window.alert(`Gagal mengunggah foto: ${message}`);
    return;
  }
  if (!mealType) {
    showError(els.newMealError, 'Pilih jenis makan.');
    return;
  }

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('mealType', mealType);
  formData.append('mealTime', mealTime);

  els.btnSaveNewMeal.disabled = true;
  try {
    const payload = await api(userPath(`/days/${state.selectedDate}/meals`), {
      method: 'POST',
      body: formData,
    });
    closeModal('modal-add-meal');
    applyMealResponse(payload);
    await loadOverview();
    if (payload.meal?.aiStatus === 'failed') {
      const message = payload.meal.aiError || 'Analisis AI gagal.';
      toast(message, 'error');
      window.alert(`Foto terunggah, tetapi analisis gagal: ${message}`);
    } else {
      toast(`${MEAL_LABELS[mealType] ?? 'Makan'} pukul ${mealTime} ditambahkan.`);
    }
  } catch (error) {
    const message =
      error instanceof TypeError
        ? 'Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.'
        : error.message || 'Upload gagal tanpa keterangan.';
    showError(els.newMealError, message);
    window.alert(`Gagal mengunggah foto: ${message}`);
  } finally {
    els.btnSaveNewMeal.disabled = false;
  }
});

els.meals.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  if (action === 'add') {
    openAddMeal();
    return;
  }

  const card = actionEl.closest('[data-meal-id]');
  const meal = (state.day?.meals ?? []).find((item) => item.id === Number(card?.dataset.mealId));
  if (!card || !meal) return;

  if (action === 'view') {
    state.mealView[meal.id] = actionEl.dataset.view;
    renderMeals();
    return;
  }
  if (action === 'edit') openMealEdit(meal);
  if (action === 'remove') deleteMeal(meal);
  if (action === 'reanalyze') reanalyzeMeal(meal);
});

/* ------------------------------------------------------------ edit hasil AI */

function openMealEdit(meal) {
  state.editingMeal = meal;
  els.editMealSub.textContent = `${MEAL_LABELS[meal.type] ?? meal.type}${
    meal.time ? ` · ${meal.time}` : ''
  }`;
  els.aiFood.textContent = meal.ai?.food || '—';
  els.aiMacros.textContent =
    meal.ai?.calories === null || meal.ai?.calories === undefined
      ? '—'
      : `${Math.round(meal.ai.calories)} kkal · ${meal.ai.proteinG} g protein`;

  els.editMealFood.value = meal.edited?.food ?? meal.food ?? '';
  els.editMealCalories.value = Math.round(meal.edited?.calories ?? meal.calories ?? 0);
  els.editMealProtein.value = meal.edited?.proteinG ?? meal.proteinG ?? 0;
  els.btnResetMeal.hidden = !meal.edited;
  showError(els.editMealError, '');
  openModal('modal-edit-meal');
}

els.formEditMeal.addEventListener('submit', async (event) => {
  event.preventDefault();
  const meal = state.editingMeal;
  if (!meal) return;

  const food = els.editMealFood.value.trim();
  if (food.length < 3) {
    showError(els.editMealError, 'Deskripsi minimal 3 karakter.');
    return;
  }

  const payload = {
    food,
    calories: Number(els.editMealCalories.value),
    proteinG: Number(els.editMealProtein.value),
  };
  if (!Number.isFinite(payload.calories) || !Number.isFinite(payload.proteinG)) {
    showError(els.editMealError, 'Kalori dan protein harus berupa angka.');
    return;
  }

  els.btnSaveMeal.disabled = true;
  try {
    const result = await api(userPath(`/meals/${meal.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.mealView[meal.id] = 'after';
    applyMealResponse(result);
    await loadOverview();
    closeModal('modal-edit-meal');
    toast('Suntingan tersimpan.');
  } catch (error) {
    showError(els.editMealError, error.message);
  } finally {
    els.btnSaveMeal.disabled = false;
  }
});

els.btnResetMeal.addEventListener('click', async () => {
  const meal = state.editingMeal;
  if (!meal) return;
  els.btnResetMeal.disabled = true;
  try {
    const result = await api(userPath(`/meals/${meal.id}/edit`), { method: 'DELETE' });
    state.mealView[meal.id] = 'after';
    applyMealResponse(result);
    closeModal('modal-edit-meal');
    toast('Kembali ke hasil AI.');
  } catch (error) {
    showError(els.editMealError, error.message);
  } finally {
    els.btnResetMeal.disabled = false;
  }
});

/* ------------------------------------------------------------- overview */

async function loadOverview() {
  const data = await api(userPath('/overview?days=7'));
  state.history = data.history;
  els.streakValue.textContent = data.streak;
  renderHistory(data.history);
  if (state.day) renderDayStrip();
}

function renderHistory(history) {
  const rows = [...history].reverse();
  els.historyList.innerHTML = rows
    .map((day) => {
      const percent = Math.min(100, Math.round((day.meals / 3) * 100));
      const isToday = day.date === todayISO();
      const label = isToday
        ? 'Hari ini'
        : new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(parseISO(day.date));

      return `
        <li class="history-row">
          <span class="h-date">${label}</span>
          <span class="history-bar ${day.meals ? '' : 'is-empty'}">
            <span style="width:${percent}%"></span>
          </span>
          <span class="history-count ${day.meals ? '' : 'is-muted'}">${day.meals ? `${day.meals} makan` : '—'}</span>
        </li>`;
    })
    .join('');
}

/* ----------------------------------------------------------- profile modal */

$('#btn-edit-profile').addEventListener('click', () => {
  const user = state.user;
  if (!user) return;
  els.editEmail.value = user.email ?? '';
  els.editName.value = user.name;
  els.editBirthDate.value = user.birthDate ?? '';
  els.editHeight.value = user.heightCm;
  els.editWeight.value = user.weightKg;
  els.editBodyFat.value = user.bodyFat ?? '';
  els.editActivity.value = user.activityLevel ?? 'light';
  els.editTz.value = String(user.tzOffset ?? 7);
  els.formEditProfile.querySelector(`input[name="editGender"][value="${user.gender}"]`).checked =
    true;
  els.formEditProfile.querySelector(
    `input[name="editWeightGoal"][value="${user.weightGoal ?? 'maintain'}"]`,
  ).checked = true;
  els.editError.hidden = true;
  openModal('modal-profile');
});

els.formEditProfile.addEventListener('submit', async (event) => {
  event.preventDefault();
  const gender = els.formEditProfile.querySelector('input[name="editGender"]:checked')?.value;
  const payload = {
    name: els.editName.value.trim(),
    birthDate: els.editBirthDate.value,
    gender,
    heightCm: Number(els.editHeight.value),
    weightKg: Number(els.editWeight.value),
    bodyFat: els.editBodyFat.value === '' ? null : Number(els.editBodyFat.value),
    activityLevel: els.editActivity.value,
    weightGoal: els.formEditProfile.querySelector('input[name="editWeightGoal"]:checked')?.value,
    tzOffset: Number(els.editTz.value),
  };

  const button = $('#btn-save-edit');
  button.disabled = true;
  try {
    const { user } = await api(userPath(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.user = user;
    userTzOffset = user.tzOffset ?? userTzOffset;
    renderProfile();
    renderRecommendation();
    closeModal('modal-profile');
    setupDateInputs();
    state.selectedDate = todayISO();
    els.todayLabel.textContent = formatLongDate(todayISO());
    await refreshData();
    toast('Profil tersimpan.');
  } catch (error) {
    showError(els.editError, error.message);
  } finally {
    button.disabled = false;
  }
});

$('#btn-switch-user').addEventListener('click', () => {
  if (!window.confirm('Keluar dari profil ini?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state.user = null;
  state.day = null;
  state.history = [];
  userTzOffset = browserTzOffset();
  state.selectedDate = todayISO();
  els.formProfile.reset();
  els.inputTz.value = String(userTzOffset);
  setupDateInputs();
  els.bmiValue.textContent = '—';
  els.bmiCategory.textContent = '—';
  showOnboarding();
});

/* ---------------------------------------------------------- onboarding */

els.formProfile.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(els.onboardingError, '');

  const payload = {
    email: els.inputEmail.value.trim().toLowerCase(),
    name: els.inputName.value.trim(),
    birthDate: els.inputBirthDate.value,
    gender: els.formProfile.querySelector('input[name="gender"]:checked')?.value,
    heightCm: Number(els.inputHeight.value),
    weightKg: Number(els.inputWeight.value),
    bodyFat: els.inputBodyFat.value === '' ? null : Number(els.inputBodyFat.value),
    activityLevel: els.inputActivity.value,
    weightGoal: els.formProfile.querySelector('input[name="weightGoal"]:checked')?.value,
    tzOffset: Number(els.inputTz.value),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    showError(els.onboardingError, 'Email tidak valid.');
    return;
  }
  if (payload.name.length < 2) {
    showError(els.onboardingError, 'Nama minimal 2 karakter.');
    return;
  }
  if (!payload.birthDate) {
    showError(els.onboardingError, 'Tanggal lahir wajib diisi.');
    return;
  }

  els.btnSaveProfile.disabled = true;
  try {
    const { user, existed } = await api('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.user = user;
    userTzOffset = user.tzOffset ?? browserTzOffset();
    setupDateInputs();
    state.selectedDate = todayISO();
    localStorage.setItem(STORAGE_KEY, user.id);
    els.formProfile.reset();
    els.inputTz.value = String(userTzOffset);
    await showDashboard();
    toast(existed ? 'Email dikenali — data lama dimuat.' : `Halo, ${user.name.split(' ')[0]}!`);
  } catch (error) {
    showError(els.onboardingError, error.message);
  } finally {
    els.btnSaveProfile.disabled = false;
  }
});

function updateBmiPreview() {
  const bmi = bmiFor(Number(els.inputHeight.value), Number(els.inputWeight.value));
  els.bmiValue.textContent = bmi ? bmi.value.toFixed(1) : '—';
  els.bmiCategory.textContent = bmi ? bmi.category : '—';
}

els.inputHeight.addEventListener('input', updateBmiPreview);
els.inputWeight.addEventListener('input', updateBmiPreview);

function setupDateInputs() {
  const today = todayISO();
  const nowWall = new Date(Date.now() + userTzOffset * 3600000);
  const earliest = `${nowWall.getUTCFullYear() - 110}-01-01`;
  [els.inputBirthDate, els.editBirthDate].forEach((input) => {
    input.max = today;
    input.min = earliest;
  });

  // Catatan puasa berisi waktu yang sudah terjadi, bukan rencana.
  const nowLocal = `${today}T${String(nowWall.getUTCHours()).padStart(2, '0')}:${String(
    nowWall.getUTCMinutes(),
  ).padStart(2, '0')}`;
  [els.inputLastMeal, els.inputFastBreak].forEach((input) => {
    input.max = nowLocal;
  });
}

els.inputLastMeal.addEventListener('input', renderFasting);
els.inputFastBreak.addEventListener('input', renderFasting);

async function saveFasting(action) {
  if (state.fastingBusy) return;
  state.fastingBusy = true;
  renderFasting();
  try {
    const result = await api(userPath(`/days/${state.selectedDate}/fasting`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, fastingTargetHours: state.fastingTarget }),
    });
    state.day.entry = result.entry;
    state.day.progress = result.progress ?? state.day.progress;
    els.inputLastMeal.value = result.entry.lastMealAt ?? '';
    els.inputFastBreak.value = result.entry.fastBreakAt ?? '';
    state.fastingTarget = result.entry.fastingTargetHours ?? state.fastingTarget;
    els.dayNote.textContent = `Tersimpan ${formatTime()}`;
    renderHeroProgress();
    await loadOverview();
    if (action === 'start') {
      toast(
        result.fasting?.carriedOver
          ? 'Puasa masih berjalan sejak kemarin.'
          : result.fasting?.alreadyRunning
            ? 'Puasa sudah berjalan.'
            : 'Puasa dimulai.',
      );
    } else if (action === 'end') {
      const session = result.entry?.fastingSession;
      const startedAt = parseLocalDateTime(session?.startAt);
      const brokeAt = parseLocalDateTime(session?.breakAt);
      const minutes =
        startedAt && brokeAt
          ? Math.round((brokeAt.getTime() - startedAt.getTime()) / 60000)
          : result.entry.fastingMinutes;
      toast(Number.isFinite(minutes) ? `Puasa ${durationText(minutes)} selesai.` : 'Puasa selesai.');
    } else {
      toast(`Target ${state.fastingTarget} jam disimpan.`);
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.fastingBusy = false;
    renderFasting();
  }
}

els.btnFastStart.addEventListener('click', () => saveFasting('start'));
els.btnFastEnd.addEventListener('click', () => saveFasting('end'));

els.fastingTargets.addEventListener('click', (event) => {
  const button = event.target.closest('[data-target]');
  if (!button) return;
  const target = Number(button.dataset.target);
  if (target === state.fastingTarget) return;
  state.fastingTarget = target;
  if (state.selectedDate === todayISO()) saveFasting('target');
  else renderFasting();
});

// Timer berjalan terus dan tanggal otomatis maju saat lewat tengah malam,
// sehingga puasa yang sedang berjalan tetap terlihat beserta tombol berhentinya.
let lastToday = todayISO();
setInterval(() => {
  const today = todayISO();
  if (today !== lastToday) {
    lastToday = today;
    els.todayLabel.textContent = formatLongDate(today);
    if (state.selectedDate === addDays(today, -1)) {
      state.selectedDate = today;
      loadDay(today).catch((error) => toast(error.message, 'error'));
    }
  }
  renderFasting();
}, 1000);

/* --------------------------------------------------------------- modals */

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => modal.querySelector('input, button')?.focus(), 40);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

document.addEventListener('click', (event) => {
  const closeTrigger = event.target.closest('[data-close]');
  if (closeTrigger) closeModal(closeTrigger.dataset.close);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.modal:not([hidden])').forEach((modal) => closeModal(modal.id));
});

boot();
