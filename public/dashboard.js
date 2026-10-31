/* 201Fitful — dashboard semua pengguna */

const $ = (selector) => document.querySelector(selector);

const els = {
  today: $('#dash-today'),
  summary: $('#dash-summary'),
  users: $('#dash-users'),
  empty: $('#dash-empty'),
  count: $('#user-count'),
  periodSwitch: $('#period-switch'),
};

const state = { period: 'daily', data: null };

const PERIOD_LABEL = { daily: 'hari ini', weekly: 'minggu ini', monthly: 'bulan ini' };

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

function clampPercent(value, max) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

function fastingText(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} jam${rest ? ` ${rest} mnt` : ''}`;
}

function dateTimeShort(value) {
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

function formatLongDate(isoDate) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00`));
}

/* ------------------------------------------------------------------ render */

function renderSummary() {
  const summary = state.data.summary;
  els.summary.innerHTML = `
    <div class="stat"><span>Pengguna</span><strong>${fmt(summary.users)}</strong></div>
    <div class="stat"><span>Aktif hari ini</span><strong>${fmt(summary.activeToday)}</strong></div>
    <div class="stat"><span>Makan hari ini</span><strong>${fmt(summary.mealsToday)}</strong></div>
    <div class="stat"><span>Target gizi</span><strong>${fmt(summary.targetMetToday)}/${fmt(summary.users)}</strong></div>`;
}

function badge(text, tone) {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function dailyBars(user) {
  const daily = user.daily;
  const caloriePercent = clampPercent(daily.calories, daily.calorieTarget);
  const proteinPercent = clampPercent(daily.proteinG, daily.proteinTargetG);

  return `
    <div class="u-bars">
      <div>
        <div class="u-bar-line">
          <span>Kalori</span>
          <strong>${fmt(daily.calories)} / ${fmt(daily.calorieTarget)} kkal</strong>
        </div>
        <div class="u-bar is-calorie"><span style="width:${caloriePercent}%" class="${daily.calorieOver ? 'is-over' : ''}"></span></div>
      </div>
      <div>
        <div class="u-bar-line">
          <span>Protein</span>
          <strong>${fmt(daily.proteinG)} / ${fmt(daily.proteinTargetG)} g</strong>
        </div>
        <div class="u-bar"><span style="width:${proteinPercent}%"></span></div>
      </div>
    </div>`;
}

function dailyGrid(user) {
  const daily = user.daily;
  const sport = daily.sport || '—';
  const fastingRange =
    daily.lastMealAt && daily.fastBreakAt
      ? `${dateTimeShort(daily.lastMealAt)} → ${dateTimeShort(daily.fastBreakAt)}`
      : '';

  return `
    <dl class="u-grid">
      <div><dt>Makan</dt><dd>${daily.meals}/3</dd></div>
      <div><dt>Langkah</dt><dd>${daily.steps === null || daily.steps === undefined ? '—' : fmt(daily.steps)}</dd></div>
      <div><dt>Olahraga</dt><dd>${esc(sport)}</dd></div>
      <div><dt>Puasa</dt><dd title="${esc(fastingRange)}">${fastingText(daily.fastingMinutes)}</dd></div>
      <div><dt>Progres</dt><dd>${daily.progressDone}/${daily.progressTotal}</dd></div>
    </dl>`;
}

function dailyBadges(user) {
  const daily = user.daily;
  return `
    <div class="u-badges">
      ${badge(daily.proteinMet ? 'Protein tercapai' : 'Protein kurang', daily.proteinMet ? 'ok' : 'warn')}
      ${badge(daily.calorieOver ? 'Kalori melebihi' : 'Kalori dalam batas', daily.calorieOver ? 'bad' : 'ok')}
      ${badge(
        daily.progressDone >= daily.progressTotal
          ? 'Hari lengkap'
          : `Progres ${daily.progressDone}/${daily.progressTotal}`,
        daily.progressDone >= daily.progressTotal ? 'ok' : 'muted',
      )}
    </div>`;
}

function periodGrid(user, period) {
  const data = user[period];
  return `
    <dl class="u-grid">
      <div><dt>Rata-rata kalori</dt><dd>${fmt(data.avgCalories)} kkal</dd></div>
      <div><dt>Protein tercapai</dt><dd>${data.proteinMetDays}/${data.days} hari</dd></div>
      <div><dt>Kalori lebih</dt><dd>${data.calorieOverDays} hari</dd></div>
      <div><dt>Hari lengkap</dt><dd>${data.completeDays}/${data.days}</dd></div>
      <div><dt>Hari tercatat</dt><dd>${data.trackedDays}/${data.days}</dd></div>
      <div><dt>Total makan</dt><dd>${fmt(data.meals)}</dd></div>
      <div><dt>Langkah</dt><dd>${fmt(data.steps)}</dd></div>
    </dl>`;
}

function cardHtml(user) {
  const period = state.period;
  const chips = [
    user.bmi !== null ? `BMI ${user.bmi}` : null,
    user.bodyFat !== null ? `BF ${user.bodyFat}%` : null,
    user.streak > 0 ? `Streak ${user.streak}` : null,
  ].filter(Boolean);

  const isDaily = period === 'daily';
  const hasData = isDaily ? user.daily.tracked : user[period].trackedDays > 0;

  const body = hasData
    ? `${isDaily ? dailyBars(user) : ''}${isDaily ? dailyGrid(user) : periodGrid(user, period)}${
        isDaily ? dailyBadges(user) : ''
      }`
    : `<p class="u-empty">Belum ada catatan ${PERIOD_LABEL[period]}.</p>`;

  return `
    <article class="u-card">
      <header class="u-head">
        <div class="avatar">${esc((user.name.trim()[0] || '?').toUpperCase())}</div>
        <div class="u-id">
          <h2>${esc(user.name)}</h2>
          <p>${esc(user.email ?? '—')}</p>
        </div>
        <div class="u-chips">${chips.map((chip) => `<span>${esc(chip)}</span>`).join('')}</div>
      </header>
      ${isDaily && user.daily.declaration ? `<p class="u-decl">“${esc(user.daily.declaration)}”</p>` : ''}
      ${body}
      <a class="u-detail" href="/dashboard/${user.id}">
        Lihat detail
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </article>`;
}

function renderUsers() {
  const users = state.data.users;
  els.empty.hidden = users.length > 0;
  els.users.innerHTML = users.map(cardHtml).join('');
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Gagal memuat data dashboard.');
    state.data = await response.json();

    els.today.textContent = formatLongDate(state.data.today);
    els.count.textContent = `${state.data.summary.users} pengguna`;
    renderSummary();
    renderUsers();
  } catch (error) {
    els.empty.hidden = false;
    els.empty.textContent = error.message;
    els.count.textContent = '';
  }
}

els.periodSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('[data-period]');
  if (!button || !state.data || button.dataset.period === state.period) return;

  state.period = button.dataset.period;
  els.periodSwitch.querySelectorAll('button').forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  renderUsers();
});

boot();
