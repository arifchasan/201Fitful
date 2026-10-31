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

  dayStrip: $('#day-strip'),
  formDay: $('#form-day'),
  inputDeclaration: $('#input-declaration'),
  inputSteps: $('#input-steps'),
  inputSport: $('#input-sport'),
  inputLastMeal: $('#input-lastmeal'),
  inputFastBreak: $('#input-fastbreak'),
  fastingNote: $('#fasting-note'),
  dayError: $('#day-error'),
  dayNote: $('#day-note'),
  btnSaveDay: $('#btn-save-day'),

  meals: $('#meals'),
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
  statBmi: $('#stat-bmi'),
  statBmiCategory: $('#stat-bmi-category'),
  historyList: $('#history-list'),

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
  editError: $('#edit-error'),

  toast: $('#toast'),
};

const STORAGE_KEY = 'fitintake.userId';
const GENDER_LABEL = { male: 'Pria', female: 'Wanita' };
const MEAL_LABELS = { breakfast: 'Sarapan', lunch: 'Siang', dinner: 'Malam' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const DAY_TOTAL = 3;

const state = {
  user: null,
  selectedDate: todayISO(),
  day: null,
  history: [],
  uploadingMeal: null,
  mealView: {},
  editingMeal: null,
};

/* ------------------------------------------------------------------ utils */

function todayISO() {
  return toISO(new Date());
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
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date);
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

/** Catatan puasa: tanggal + jam terakhir makan dan buka puasa, beserta durasinya. */
function fastingLabel(lastMealAt, fastBreakAt) {
  const startLabel = formatDateTimeShort(lastMealAt);
  const endLabel = formatDateTimeShort(fastBreakAt);
  if (!startLabel || !endLabel) return 'Durasi puasa: —';

  const minutes = Math.round((new Date(fastBreakAt).getTime() - new Date(lastMealAt).getTime()) / 60000);
  if (!(minutes > 0)) return 'Waktu buka puasa harus setelah terakhir makan.';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${startLabel} → ${endLabel} · ${hours} jam${rest ? ` ${rest} menit` : ''}`;
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
  const response = await fetch(path, options);
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
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (!savedId) {
    showOnboarding();
    return;
  }

  try {
    const { user } = await api(`/api/users/${savedId}`);
    state.user = user;
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
  els.fastingNote.textContent = fastingLabel(data.entry.lastMealAt, data.entry.fastBreakAt);
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

  els.recProteinTarget.textContent = `${rec.proteinMinG} g`;
  els.recProteinNow.textContent = `${totals.proteinG} g`;
  els.recProteinBar.style.width = `${Math.min(
    100,
    Math.round((totals.proteinG / rec.proteinMinG) * 100),
  )}%`;

  const caloriePercent = Math.round((totals.calories / rec.calorieMax) * 100);
  els.recCalorieTarget.textContent = `${rec.calorieMax.toLocaleString('id-ID')} kkal`;
  els.recCalorieNow.textContent = `${totals.calories.toLocaleString('id-ID')} kkal`;
  els.recCalorieBar.style.width = `${Math.min(100, caloriePercent)}%`;
  els.recCalorieBar.classList.toggle('is-over', caloriePercent > 100);
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

function mealSlotHtml(type, meal) {
  const busy = state.uploadingMeal === type;
  const hasPhoto = Boolean(meal);
  const view = state.mealView[type] === 'before' ? 'before' : 'after';
  const shown =
    meal && view === 'before'
      ? meal.ai
      : meal
        ? { food: meal.food, calories: meal.calories, proteinG: meal.proteinG }
        : null;

  const status = (() => {
    if (!meal) return '';
    if (meal.aiStatus === 'done') {
      return `<p class="meal-macros"><strong>${Math.round(shown.calories)}</strong> kkal · <strong>${shown.proteinG}</strong> g protein</p>`;
    }
    if (meal.aiStatus === 'failed') {
      return `<p class="meal-error">${esc(meal.aiError || 'Analisis gagal.')}</p>
        <button type="button" class="link-btn" data-action="reanalyze">Coba lagi</button>`;
    }
    return `<p class="meal-pending">Menganalisis…</p>`;
  })();

  const viewSwitch = meal?.edited
    ? `<div class="view-switch" role="group" aria-label="Tampilan hasil">
         <button type="button" data-action="view" data-view="before" class="${view === 'before' ? 'is-active' : ''}" aria-pressed="${view === 'before'}">AI</button>
         <button type="button" data-action="view" data-view="after" class="${view === 'after' ? 'is-active' : ''}" aria-pressed="${view === 'after'}">Suntingan</button>
       </div>`
    : '';

  const actions = hasPhoto
    ? `<div class="meal-actions">
         ${meal.aiStatus === 'done' ? '<button type="button" class="link-btn" data-action="edit">Edit</button>' : ''}
         <button type="button" class="link-btn danger" data-action="remove">Hapus</button>
       </div>`
    : '';

  return `
    <article class="meal ${hasPhoto ? 'has-photo' : ''} ${busy ? 'is-busy' : ''}" data-type="${type}">
      <div class="meal-head">
        <h3>${MEAL_LABELS[type]}</h3>
        ${meal?.aiStatus === 'done' ? `<span class="meal-badge">${Math.round(shown.calories)} kkal</span>` : ''}
      </div>

      <label class="meal-photo" aria-label="Foto ${MEAL_LABELS[type]}">
        <input type="file" accept="image/jpeg,image/png,image/webp" data-role="meal-input" hidden />
        ${
          hasPhoto
            ? `<img src="${esc(meal.photoUrl)}" alt="Foto ${MEAL_LABELS[type]}" loading="lazy" />`
            : `<span class="meal-empty">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                   <path d="M4 8a2 2 0 012-2h1.5l1.2-1.6A1 1 0 019.5 4h5a1 1 0 01.8.4L16.5 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke-linejoin="round" />
                   <circle cx="12" cy="12.5" r="3.4" />
                 </svg>
                 <strong>Tambah foto</strong>
               </span>`
        }
        ${busy ? '<span class="meal-loading"><span class="spinner"></span>Menganalisis…</span>' : ''}
      </label>

      <div class="meal-info">
        ${shown?.food ? `<p class="meal-food">${esc(shown.food)}</p>` : ''}
        ${status}
        ${viewSwitch}
        ${actions}
      </div>
    </article>`;
}

function renderMeals() {
  const meals = state.day?.meals ?? {};
  els.meals.innerHTML = MEAL_ORDER.map((type) => mealSlotHtml(type, meals[type])).join('');

  const totals = state.day?.totals ?? { calories: 0, proteinG: 0, meals: 0 };
  els.mealCounter.textContent = `${totals.meals}/3`;
  els.totalCalories.textContent = `${totals.calories.toLocaleString('id-ID')} kkal`;
  els.totalProtein.textContent = `${totals.proteinG} g`;
}

function applyMealResponse(payload) {
  if (payload.meal) state.day.meals[payload.meal.type] = payload.meal;
  state.day.totals = payload.totals ?? state.day.totals;
  state.day.progress = payload.progress ?? state.day.progress;
  renderMeals();
  renderHeroProgress();
}

async function uploadMeal(type, file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Format: JPG, PNG, atau WEBP.', 'error');
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    toast('Maksimal 6 MB.', 'error');
    return;
  }

  state.uploadingMeal = type;
  renderMeals();

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('mealType', type);

  try {
    const payload = await api(userPath(`/days/${state.selectedDate}/meals`), {
      method: 'POST',
      body: formData,
    });
    applyMealResponse(payload);
    await loadOverview();
    if (payload.meal?.aiStatus === 'failed') {
      toast(payload.meal.aiError || 'Analisis AI gagal.', 'error');
    } else {
      toast(`${MEAL_LABELS[type]} dianalisis.`);
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingMeal = null;
    renderMeals();
  }
}

async function deleteMeal(meal) {
  const ok = window.confirm(`Hapus foto ${MEAL_LABELS[meal.type].toLowerCase()}?`);
  if (!ok) return;
  try {
    const payload = await api(userPath(`/meals/${meal.id}`), { method: 'DELETE' });
    state.day.meals[meal.type] = null;
    delete state.mealView[meal.type];
    state.day.totals = payload.totals;
    state.day.progress = payload.progress;
    renderMeals();
    renderHeroProgress();
    await loadOverview();
    toast('Foto dihapus.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reanalyzeMeal(meal) {
  state.uploadingMeal = meal.type;
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
    state.uploadingMeal = null;
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
  };

  if (Boolean(payload.lastMealAt) !== Boolean(payload.fastBreakAt)) {
    showError(
      els.dayError,
      'Isi tanggal & waktu terakhir makan dan buka puasa sekaligus, atau kosongkan keduanya.',
    );
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
    els.fastingNote.textContent = fastingLabel(result.entry.lastMealAt, result.entry.fastBreakAt);
    els.dayNote.textContent = `Tersimpan ${formatTime()}`;
    renderHeroProgress();
    toast('Tersimpan.');
  } catch (error) {
    showError(els.dayError, error.message);
  } finally {
    els.btnSaveDay.disabled = false;
  }
});

els.meals.addEventListener('change', (event) => {
  const input = event.target.closest('[data-role="meal-input"]');
  if (!input) return;
  const card = input.closest('.meal');
  const file = input.files?.[0];
  input.value = '';
  if (card && file) uploadMeal(card.dataset.type, file);
});

els.meals.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const card = actionEl.closest('.meal');
  const meal = state.day?.meals?.[card?.dataset.type];
  if (!card || !meal) return;

  const action = actionEl.dataset.action;
  if (action === 'view') {
    state.mealView[meal.type] = actionEl.dataset.view;
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
  els.editMealSub.textContent = MEAL_LABELS[meal.type];
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
    state.mealView[meal.type] = 'after';
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
    state.mealView[meal.type] = 'after';
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
      const percent = Math.round((day.meals / 3) * 100);
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
          <span class="history-count ${day.meals ? '' : 'is-muted'}">${day.meals ? `${day.meals}/3` : '—'}</span>
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
  els.formEditProfile.querySelector(`input[name="editGender"][value="${user.gender}"]`).checked =
    true;
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
    renderProfile();
    renderRecommendation();
    closeModal('modal-profile');
    await loadOverview();
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
  state.selectedDate = todayISO();
  els.formProfile.reset();
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
    state.selectedDate = todayISO();
    localStorage.setItem(STORAGE_KEY, user.id);
    els.formProfile.reset();
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
  const earliest = `${new Date().getFullYear() - 110}-01-01`;
  [els.inputBirthDate, els.editBirthDate].forEach((input) => {
    input.max = today;
    input.min = earliest;
  });

  // Catatan puasa berisi waktu yang sudah terjadi, bukan rencana.
  const now = new Date();
  const nowLocal = `${today}T${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
  [els.inputLastMeal, els.inputFastBreak].forEach((input) => {
    input.max = nowLocal;
  });
}

function updateFastingNote() {
  els.fastingNote.textContent = fastingLabel(
    els.inputLastMeal.value || null,
    els.inputFastBreak.value || null,
  );
}

els.inputLastMeal.addEventListener('input', updateFastingNote);
els.inputFastBreak.addEventListener('input', updateFastingNote);

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
