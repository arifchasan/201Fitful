/* 201Fitful — detail satu peserta */

const $ = (selector) => document.querySelector(selector);

const els = {
  state: $('#detail-state'),
  body: $('#detail-body'),
};

const state = { data: null };

const GENDER_LABEL = { male: 'Pria', female: 'Wanita' };
const MEAL_LABEL = { breakfast: 'Sarapan', lunch: 'Siang', dinner: 'Malam' };

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmt(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatBirthDate(isoDate) {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00`));
}

function formatDayTitle(isoDate) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00`));
}

function fastingText(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} jam${rest ? ` ${rest} mnt` : ''}`;
}

function percentOf(value, max) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

/* ---------------------------------------------------------------- profile */

function profileHtml() {
  const { user, streak } = state.data;
  const chips = [
    user.bmi !== null ? `BMI ${user.bmi}` : null,
    user.bodyFat !== null ? `BF ${user.bodyFat}%` : null,
    streak > 0 ? `Streak ${streak} hari` : null,
  ].filter(Boolean);

  return `
    <a class="back-link" href="/dashboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Semua peserta
    </a>

    <section class="card detail-hero">
      <header class="detail-id">
        <div class="avatar">${esc((user.name.trim()[0] || '?').toUpperCase())}</div>
        <div class="detail-id-main">
          <h1>${esc(user.name)}</h1>
          <p>${esc(user.email ?? '—')}</p>
        </div>
      </header>
      ${chips.length ? `<div class="chips">${chips.map((chip) => `<span>${esc(chip)}</span>`).join('')}</div>` : ''}

      <dl class="detail-facts">
        <div><dt>Tanggal lahir</dt><dd>${esc(formatBirthDate(user.birthDate))}</dd></div>
        <div><dt>Usia</dt><dd>${fmt(user.age)} tahun</dd></div>
        <div><dt>Gender</dt><dd>${esc(GENDER_LABEL[user.gender] ?? '—')}</dd></div>
        <div><dt>Tinggi</dt><dd>${fmt(user.heightCm)} cm</dd></div>
        <div><dt>Berat</dt><dd>${fmt(user.weightKg)} kg</dd></div>
        <div><dt>Body fat</dt><dd>${user.bodyFat !== null ? `${user.bodyFat}%` : '—'}</dd></div>
        <div><dt>BMI</dt><dd>${user.bmi !== null ? `${user.bmi} · ${esc(user.bmiCategory ?? '')}` : '—'}</dd></div>
        <div><dt>Gabung</dt><dd>${esc(formatBirthDate((user.createdAt ?? '').slice(0, 10)) || '—')}</dd></div>
      </dl>

      <div class="detail-targets">
        <div class="u-bar-line">
          <span>Protein minimal</span>
          <strong>${fmt(user.recommendation.proteinMinG)} g</strong>
        </div>
        <div class="u-bar"><span style="width:${percentOf(
          state.data.summary.daily.proteinG,
          user.recommendation.proteinMinG,
        )}%"></span></div>
        <div class="u-bar-line detail-target-second">
          <span>Kalori maksimal</span>
          <strong>${fmt(user.recommendation.calorieMax)} kkal</strong>
        </div>
        <div class="u-bar is-calorie"><span class="${state.data.summary.daily.calorieOver ? 'is-over' : ''}" style="width:${percentOf(
          state.data.summary.daily.calories,
          user.recommendation.calorieMax,
        )}%"></span></div>
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- summary */

function sumItem(value, text) {
  return `<li><strong>${value}</strong> ${esc(text)}</li>`;
}

function summaryHtml() {
  const { summary, user } = state.data;
  const daily = summary.daily;
  const weekly = summary.weekly;
  const monthly = summary.monthly;
  const today = state.data.days.find((day) => day.date === state.data.today);
  const fasting = today?.entry?.fastingMinutes ?? null;

  const rows = [
    {
      label: 'Hari ini',
      items: [
        sumItem(`${fmt(daily.calories)}`, `/ ${fmt(user.recommendation.calorieMax)} kkal`),
        sumItem(`${fmt(round1(daily.proteinG))}`, `/ ${fmt(user.recommendation.proteinMinG)} g protein`),
        sumItem(`${daily.meals}`, '/ 3 makan'),
        sumItem(fastingText(fasting), 'puasa'),
      ],
    },
    {
      label: '7 hari',
      items: [
        sumItem(`${fmt(weekly.avgCalories)}`, 'kkal/hari'),
        sumItem(`${weekly.proteinMetDays}`, `/ ${weekly.days} hari protein tercapai`),
        sumItem(`${weekly.completeDays}`, '/ 7 hari lengkap'),
        sumItem(`${weekly.trackedDays}`, '/ 7 hari tercatat'),
      ],
    },
    {
      label: '30 hari',
      items: [
        sumItem(`${fmt(monthly.avgCalories)}`, 'kkal/hari'),
        sumItem(`${monthly.proteinMetDays}`, `/ 30 hari protein tercapai`),
        sumItem(`${monthly.calorieOverDays}`, 'hari melebihi kalori'),
        sumItem(`${monthly.completeDays}`, '/ 30 hari lengkap'),
      ],
    },
  ];

  return `
    <section class="card detail-summary">
      <div class="card-head"><h2>Ringkasan</h2></div>
      ${rows
        .map(
          (row) => `
        <div class="sum-row">
          <span class="sum-period">${row.label}</span>
          <ul class="sum-items">${row.items.join('')}</ul>
        </div>`,
        )
        .join('')}
    </section>`;
}

/* -------------------------------------------------------------- day cards */

function mealHtml(type, meal) {
  if (!meal) {
    return `
      <figure class="d-meal is-empty">
        <span class="d-meal-thumb is-empty" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 8a2 2 0 012-2h1.5l1.2-1.6A1 1 0 019.5 4h5a1 1 0 01.8.4L16.5 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke-linejoin="round" />
            <circle cx="12" cy="12.5" r="3.4" />
          </svg>
        </span>
        <figcaption class="d-meal-body">
          <span class="d-meal-label">${MEAL_LABEL[type]}</span>
          <p class="d-meal-food is-muted">Tidak diisi</p>
        </figcaption>
      </figure>`;
  }

  const edited = Boolean(meal.edited);
  const statusLine = (() => {
    if (meal.aiStatus === 'failed') {
      return `<p class="d-meal-error">${esc(meal.aiError || 'Analisis AI gagal.')}</p>`;
    }
    if (meal.aiStatus === 'pending') return '<p class="d-meal-food is-muted">Menganalisis…</p>';
    return meal.food
      ? `<p class="d-meal-food">${esc(meal.food)}</p>`
      : '<p class="d-meal-food is-muted">—</p>';
  })();

  const macros =
    meal.calories === null || meal.calories === undefined
      ? ''
      : `<p class="d-meal-macros"><strong>${fmt(Math.round(meal.calories))}</strong> kkal · <strong>${fmt(round1(meal.proteinG))}</strong> g protein</p>`;

  const original =
    edited && meal.ai?.food
      ? `<p class="d-meal-original">AI: ${esc(meal.ai.food)}${
          meal.ai.calories !== null && meal.ai.calories !== undefined
            ? ` · ${fmt(Math.round(meal.ai.calories))} kkal · ${fmt(round1(meal.ai.proteinG))} g`
            : ''
        }</p>`
      : '';

  return `
    <figure class="d-meal">
      <a class="d-meal-thumb" href="${esc(meal.photoUrl)}" target="_blank" rel="noopener" aria-label="Lihat foto ${esc(MEAL_LABEL[meal.type])}">
        <img src="${esc(meal.photoUrl)}" alt="Foto ${esc(MEAL_LABEL[meal.type])}" loading="lazy" />
      </a>
      <figcaption class="d-meal-body">
        <span class="d-meal-label">${MEAL_LABEL[meal.type]}
          <em class="d-meal-tag ${edited ? 'is-edited' : ''}">${edited ? 'Suntingan' : 'AI'}</em>
        </span>
        ${statusLine}
        ${macros}
        ${original}
      </figcaption>
    </figure>`;
}

function dayHtml(day) {
  const user = state.data.user;
  const entry = day.entry;
  const sport = entry.sport ? esc(entry.sport) : '—';
  const declarations = entry.declaration ? `<p class="day-decl">“${esc(entry.declaration)}”</p>` : '';

  const meals = ['breakfast', 'lunch', 'dinner']
    .map((type) => mealHtml(type, day.meals.find((meal) => meal.type === type)))
    .join('');

  return `
    <article class="day-card ${day.today ? 'is-today' : ''}">
      <header class="day-card-head">
        <div>
          <h3>${esc(formatDayTitle(day.date))}</h3>
          <p>${day.today ? 'Hari ini' : `${day.progress.done}/${day.progress.total} bagian`}</p>
        </div>
        <div class="day-kcal">
          <strong>${fmt(day.totals.calories)}</strong>
          <span>kkal</span>
        </div>
      </header>

      ${declarations}

      <dl class="day-grid">
        <div><dt>Steps</dt><dd>${entry.steps === null ? '—' : fmt(entry.steps)}</dd></div>
        <div><dt>Olahraga</dt><dd>${sport}</dd></div>
        <div><dt>Durasi</dt><dd>${entry.durationMinutes === null ? '—' : `${fmt(entry.durationMinutes)} mnt`}</dd></div>
        <div><dt>Puasa</dt><dd>${fastingText(entry.fastingMinutes)}${
          entry.lastMealTime && entry.fastBreakTime
            ? `<span class="day-sub">${esc(entry.lastMealTime)} → ${esc(entry.fastBreakTime)}</span>`
            : ''
        }</dd></div>
        <div><dt>Protein</dt><dd>${fmt(round1(day.totals.proteinG))} g <span class="day-sub">/ ${fmt(user.recommendation.proteinMinG)} g</span></dd></div>
        <div><dt>Kalori</dt><dd class="${day.totals.calories > user.recommendation.calorieMax ? 'is-over' : ''}">${fmt(day.totals.calories)} kkal</dd></div>
      </dl>

      <div class="day-meals">${meals}</div>
    </article>`;
}

function daysHtml() {
  const tracked = state.data.days.filter((day) => day.tracked).reverse();
  if (!tracked.length) {
    return `<section class="card"><p class="u-empty">Belum ada catatan dalam 30 hari terakhir.</p></section>`;
  }

  return `
    <div class="detail-days-head">
      <h2>Catatan harian</h2>
      <span class="dash-count">${tracked.length} hari tercatat</span>
    </div>
    ${tracked.map(dayHtml).join('')}`;
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  const match = window.location.pathname.match(/\/dashboard\/(\d+)/);
  if (!match) {
    els.state.textContent = 'Peserta tidak ditemukan.';
    return;
  }

  try {
    const response = await fetch(`/api/dashboard/users/${match[1]}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Gagal memuat detail peserta.');
    }
    state.data = await response.json();
    document.title = `201Fitful — ${state.data.user.name}`;
    els.body.innerHTML = `${profileHtml()}${summaryHtml()}${daysHtml()}`;
    els.body.hidden = false;
    els.state.hidden = true;
  } catch (error) {
    els.state.textContent = error.message;
  }
}

boot();
