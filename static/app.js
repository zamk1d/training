// ==================== State ====================
const state = {
    days: [],
    templates: { exercises: [], meals: [] },
    charts: { workout: null, protein: null, weight: null, exercise: null },
    period: localStorage.getItem('period') || '30',
    goal: parseFloat(localStorage.getItem('goal')) || null,
};

// ==================== Загрузка ====================
async function loadAll() {
    const [days] = await Promise.all([fetch('/api/days').then(r => r.json()), loadTemplates()]);
    state.days = days;
    renderStats();
    renderExerciseControls();
    renderCharts();
    renderDays(days);
    renderTemplatesManagement();
}

async function refreshChartsOnly() { renderCharts(); }

const sum = (a) => a.reduce((s, x) => s + x, 0);

function periodDays() {  // по возрастанию даты, в пределах выбранного периода
    const asc = [...state.days].reverse();
    if (state.period === 'all') return asc;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (+state.period - 1));
    return asc.filter(d => new Date(d.date + 'T00:00:00') >= from);
}
function workoutSeries(days) {
    return days.filter(d => d.workout && d.workout.exercises.length).map(d => ({
        date: d.date,
        total_reps: sum(d.workout.exercises.map(e => sum(e.reps_list))),
        exercises: d.workout.exercises.map(e => ({ name: e.exercise_name, reps_list: e.reps_list, total: sum(e.reps_list) })),
        notes: d.workout.notes,
    }));
}
function proteinSeries(days) {
    return days.filter(d => d.meals.length).map(d => ({ date: d.date, total_protein: d.total_protein, meals: d.meals }));
}
function weightSeries(days) {
    return days.filter(d => d.body && d.body.weight_kg != null).map(d => ({ date: d.date, weight_kg: d.body.weight_kg }));
}
function renderCharts() {
    const pd = periodDays();
    renderWorkoutChart(workoutSeries(pd));
    renderProteinChart(proteinSeries(pd));
    renderWeightChart(weightSeries(pd));
    renderExerciseChart(pd);
}

async function loadTemplates() {
    const [ex, meals] = await Promise.all([
        fetch('/api/templates/exercises').then(r => r.json()),
        fetch('/api/templates/meals').then(r => r.json()),
    ]);
    state.templates.exercises = ex;
    state.templates.meals = meals;
}

// ==================== Theme ====================
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    const apply = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        btn.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
    };

    const current = document.documentElement.getAttribute('data-theme') || 'light';
    apply(current);

    btn.addEventListener('click', async () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        apply(next);
        if (document.getElementById('chart-workout')) await refreshChartsOnly();
    });
}

function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

function chartTheme() {
    const dark = isDark();
    return {
        tick: dark ? '#8b8f9c' : '#6b6f7d',
        grid: dark ? '#232732' : '#f0f1f5',
        label: dark ? '#e2e8f0' : '#374151',
        labelProtein: dark ? '#6ee7b7' : '#047857',
        tooltipBg: dark ? 'rgba(20,22,28,.98)' : 'rgba(15,16,21,.96)',
        tooltipBorder: dark ? '#353a48' : '#1f2937',
    };
}

function makeGradient(ctx, from, to, height = 400) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
}

// ==================== Stats ====================
function renderStats() {
    const pd = periodDays();
    const w = workoutSeries(pd);
    const p = proteinSeries(pd).filter(x => x.total_protein > 0);
    const per = state.period === 'all' ? 'за всё время' : `за ${state.period} дн.`;
    const set = (id, v, sub) => {
        document.getElementById('stat-' + id).textContent = v;
        document.getElementById('stat-' + id + '-sub').textContent = sub;
    };
    const vol = sum(w.map(x => x.total_reps));
    set('workouts', w.length, per);
    set('volume', vol.toLocaleString('ru-RU'), w.length ? `≈${Math.round(vol / w.length)} за тренировку` : per);
    const avg = p.length ? Math.round(sum(p.map(x => x.total_protein)) / p.length) : null;
    set('protein', avg != null ? avg + ' г' : '—',
        state.goal && p.length
            ? `цель ${state.goal} г: ${p.filter(x => x.total_protein >= state.goal).length} из ${p.length} дн.`
            : `в день, ${per}`);
    const all = weightSeries([...state.days].reverse());
    const wp = weightSeries(pd);
    const delta = wp.length > 1 ? wp[wp.length - 1].weight_kg - wp[0].weight_kg : null;
    set('weight', all.length ? all[all.length - 1].weight_kg + ' кг' : '—',
        delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} кг ${per}` : 'последнее измерение');
}

// ==================== Utils ====================
function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
function fmtDateLong(iso) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
const CHART_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
};

// ==================== Workout chart ====================
function renderWorkoutChart(data) {
    const canvas = document.getElementById('chart-workout');
    const ctx = canvas.getContext('2d');
    if (state.charts.workout) state.charts.workout.destroy();
    const t = chartTheme();

    const violetFrom = isDark() ? '#c4b5fd' : '#a78bfa';
    const violetTo = isDark() ? '#a78bfa' : '#8b5cf6';
    const barGradient = makeGradient(ctx, violetFrom, violetTo, 380);

    state.charts.workout = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => fmtDate(d.date)),
            datasets: [{
                label: 'Повторений',
                data: data.map(d => d.total_reps),
                backgroundColor: barGradient,
                hoverBackgroundColor: isDark() ? '#c4b5fd' : '#7c3aed',
                borderRadius: 8,
                maxBarThickness: 60,
                borderSkipped: false,
            }],
        },
        plugins: [ChartDataLabels],
        options: {
            ...CHART_OPTS,
            onClick: (evt, els) => {
                if (!els.length) return;
                openDayModal(data[els[0].index].date);
            },
            onHover: (evt, els) => {
                evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: (ctx) => data.length <= 12,
                    anchor: 'end',
                    align: 'end',
                    offset: 4,
                    color: t.label,
                    font: { size: 10, weight: '600' },
                    formatter: (v, ctx) => {
                        const d = data[ctx.dataIndex];
                        const names = d.exercises.map(e => e.name);
                        if (names.length === 0) return '';
                        if (names.length === 1) return truncate(names[0], 14);
                        return `${truncate(names[0], 8)} +${names.length - 1}`;
                    },
                },
                tooltip: {
                    backgroundColor: t.tooltipBg,
                    borderColor: t.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    bodySpacing: 4,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => fmtDateLong(data[items[0].dataIndex].date),
                        label: (item) => {
                            const d = data[item.dataIndex];
                            const lines = [`Всего: ${d.total_reps} повторений`];
                            d.exercises.forEach(ex => {
                                lines.push(`• ${ex.name}: ${ex.reps_list.join(' · ')} (${ex.total})`);
                            });
                            if (d.notes) lines.push(`📝 ${d.notes}`);
                            lines.push('Кликни → открыть день');
                            return lines;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { color: t.grid },
                    border: { display: false },
                },
            },
        },
    });
}

// ==================== Protein chart ====================
function renderProteinChart(data) {
    const canvas = document.getElementById('chart-protein');
    const ctx = canvas.getContext('2d');
    if (state.charts.protein) state.charts.protein.destroy();
    const t = chartTheme();

    const emeraldFrom = isDark() ? '#6ee7b7' : '#34d399';
    const emeraldTo = isDark() ? '#34d399' : '#10b981';
    const barGradient = makeGradient(ctx, emeraldFrom, emeraldTo, 380);

    state.charts.protein = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => fmtDate(d.date)),
            datasets: [{
                label: 'Белок, г',
                data: data.map(d => d.total_protein),
                backgroundColor: barGradient,
                hoverBackgroundColor: isDark() ? '#6ee7b7' : '#059669',
                borderRadius: 8,
                maxBarThickness: 60,
                borderSkipped: false,
            }, ...(state.goal ? [{
                type: 'line', label: 'Цель', data: data.map(() => state.goal),
                borderColor: isDark() ? '#fbbf24' : '#d97706', borderDash: [6, 4],
                borderWidth: 1.5, pointRadius: 0, datalabels: { display: false },
            }] : [])],
        },
        plugins: [ChartDataLabels],
        options: {
            ...CHART_OPTS,
            onClick: (evt, els) => {
                if (!els.length) return;
                openDayModal(data[els[0].index].date);
            },
            onHover: (evt, els) => {
                evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: (ctx) => data.length <= 20,
                    anchor: 'end',
                    align: 'end',
                    offset: 4,
                    color: t.labelProtein,
                    font: { size: 10, weight: '600' },
                    formatter: (v) => v > 0 ? Math.round(v) : '',
                },
                tooltip: {
                    backgroundColor: t.tooltipBg,
                    borderColor: t.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    bodySpacing: 4,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => fmtDateLong(data[items[0].dataIndex].date),
                        label: (item) => {
                            const d = data[item.dataIndex];
                            if (item.datasetIndex === 1) return `Цель: ${state.goal} г`;
                            const lines = [`Белок: ${d.total_protein} г`];
                            d.meals.forEach(m => {
                                const desc = m.description || 'без описания';
                                const protein = m.protein_g != null ? `${m.protein_g} г` : '—';
                                lines.push(`• ${desc}: ${protein}`);
                            });
                            lines.push('Кликни → открыть день');
                            return lines;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { color: t.grid },
                    border: { display: false },
                },
            },
        },
    });
}

// ==================== Weight chart ====================
function renderWeightChart(data) {
    const canvas = document.getElementById('chart-weight');
    const ctx = canvas.getContext('2d');
    if (state.charts.weight) state.charts.weight.destroy();
    const t = chartTheme();

    const lineColor = isDark() ? '#38bdf8' : '#0ea5e9';
    const fillTop = isDark() ? 'rgba(56,189,248,.30)' : 'rgba(14,165,233,.22)';
    const fillBottom = 'rgba(14,165,233,0)';
    const fillGradient = makeGradient(ctx, fillTop, fillBottom, 300);

    state.charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => fmtDate(d.date)),
            datasets: [{
                label: 'Вес, кг',
                data: data.map(d => d.weight_kg),
                borderColor: lineColor,
                backgroundColor: fillGradient,
                borderWidth: 2.5,
                tension: .35,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: lineColor,
                pointBorderColor: isDark() ? '#0a0b0f' : '#ffffff',
                pointBorderWidth: 2,
            }],
        },
        options: {
            ...CHART_OPTS,
            onClick: (evt, els) => {
                if (!els.length) return;
                openDayModal(data[els[0].index].date);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: t.tooltipBg,
                    borderColor: t.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => fmtDateLong(data[items[0].dataIndex].date),
                        label: (item) => `${item.parsed.y} кг`,
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    ticks: { color: t.tick, font: { size: 11 } },
                    grid: { color: t.grid },
                    border: { display: false },
                },
            },
        },
    });
}

// ==================== Days list ====================
function renderDays(days) {
    document.getElementById('days-count').textContent = days.length ? `${days.length} с записями` : '';
    document.getElementById('tab-count-days').textContent = days.length || '';
    const el = document.getElementById('days-list');
    if (!days.length) {
        el.innerHTML = '<div class="empty">Пока нет записей. Нажми «+ Добавить день» сверху.</div>';
        return;
    }
    const open = el.querySelector('details')
        ? new Set([...el.querySelectorAll('details[open]')].map(x => x.dataset.m))
        : new Set([days[0].date.slice(0, 7)]);
    const groups = new Map();
    days.forEach(d => {
        const k = d.date.slice(0, 7);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(d);
    });
    el.innerHTML = [...groups].map(([k, list]) => {
        const [y, m] = k.split('-').map(Number);
        const title = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const workouts = list.filter(d => d.workout).length;
        return `<details class="month-group" data-m="${k}" ${open.has(k) ? 'open' : ''}>
            <summary><span class="month-title">${title}</span>
            <span class="muted">${list.length} дн. · ${workouts} тренировок</span></summary>
            <div class="days-list">${list.map(dayCardHTML).join('')}</div>
        </details>`;
    }).join('');
}

function dayCardHTML(day) {
    const d = new Date(day.date);
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dateStr = fmtDateLong(day.date);

    const tags = [];
    if (day.workout) tags.push('<span class="tag tag-workout">🏋️ тренировка</span>');
    if (day.meals.length) tags.push('<span class="tag tag-food">🍽️ еда</span>');
    if (day.body) tags.push('<span class="tag tag-body">⚖️ тело</span>');

    let sections = '';

    if (day.workout && day.workout.exercises.length) {
        const total = day.workout.exercises.reduce(
            (s, ex) => s + ex.reps_list.reduce((a, b) => a + b, 0), 0);
        sections += `<div class="day-section">
            <div class="day-section-title">🏋️ Упражнения · ${total} повторений</div>
            ${day.workout.exercises.map(ex => `
                <div class="exercise-line">
                    <span class="ex-name">${escapeHtml(ex.exercise_name)}</span>
                    <span class="ex-sets">${ex.reps_list.map(r => `<span class="rep-badge">${r}</span>`).join('')}</span>
                </div>`).join('')}
            ${day.workout.notes ? `<div class="day-notes">📝 ${escapeHtml(day.workout.notes)}</div>` : ''}
        </div>`;
    }

    if (day.meals.length) {
        sections += `<div class="day-section">
            <div class="day-section-title">🍽️ Питание · ${day.total_protein} г белка</div>
            ${day.meals.map(m => `
                <div class="meal-line">
                    <span>${escapeHtml(m.description || 'Без описания')}</span>
                    <span class="meal-macros">
                        ${m.protein_g != null ? `<span class="macro-protein">${m.protein_g} г</span>` : ''}
                        ${m.calories != null ? `<span>${m.calories} ккал</span>` : ''}
                    </span>
                </div>`).join('')}
        </div>`;
    }

    if (day.body) {
        const parts = [];
        if (day.body.weight_kg != null) parts.push(`${day.body.weight_kg} кг`);
        if (day.body.height_cm != null) parts.push(`${day.body.height_cm} см`);
        const info = parts.join(' · ') + (day.body.notes ? ` · ${escapeHtml(day.body.notes)}` : '');
        sections += `<div class="day-section">
            <div class="day-section-title">⚖️ Тело</div>
            <div class="body-line">${info || '—'}</div>
        </div>`;
    }

    return `<div class="day-card" onclick="openDayModal('${day.date}')">
        <div class="day-head">
            <div>
                <div class="day-date">${dateStr}</div>
                <div class="day-weekday">${weekday}</div>
            </div>
            <div class="day-tags">${tags.join('')}</div>
        </div>
        ${sections || '<div class="muted">Нет данных</div>'}
    </div>`;
}

// ==================== Export ====================
function openExportModal() {
    document.getElementById('export-modal-overlay').classList.add('active');
}

function closeExportModal() {
    document.getElementById('export-modal-overlay').classList.remove('active');
}

document.getElementById('export-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'export-modal-overlay') closeExportModal();
});

async function doExport() {
    const includeWorkouts = document.getElementById('export-workouts').checked;
    const includeFood = document.getElementById('export-food').checked;
    const includeBody = document.getElementById('export-body').checked;

    if (!includeWorkouts && !includeFood && !includeBody) {
        alert('Выбери хотя бы одну категорию');
        return;
    }

    const params = new URLSearchParams();
    if (includeWorkouts) params.set('workouts', 'true');
    if (includeFood) params.set('food', 'true');
    if (includeBody) params.set('body', 'true');

    try {
        const res = await fetch('/api/export?' + params.toString());
        if (!res.ok) { alert('Ошибка экспорта'); return; }
        const data = await res.json();

        if (!data.days || data.days.length === 0) {
            alert('Нет данных по выбранным категориям.');
            return;
        }

        const parts = [];
        if (includeWorkouts) parts.push('workouts');
        if (includeFood) parts.push('food');
        if (includeBody) parts.push('body');

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sport-${parts.join('-')}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        closeExportModal();
    } catch (e) {
        alert('Ошибка экспорта: ' + e.message);
    }
}

// ==================== Templates management ====================
function renderTemplatesManagement() {
    document.getElementById('tab-count-templates').textContent =
        (state.templates.exercises.length + state.templates.meals.length) || '';
    const exList = document.getElementById('templates-exercises-list');
    if (exList) {
        if (!state.templates.exercises.length) {
            exList.innerHTML = '<div class="muted">Нет шаблонов упражнений</div>';
        } else {
            exList.innerHTML = state.templates.exercises.map(t => `
                <div class="template-item" onclick="openTemplateModal('exercise', ${t.id})">
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(t.name)}</div>
                        <div class="template-item-detail">${t.default_reps_list.length} подходов: ${t.default_reps_list.join(' · ')}</div>
                    </div>
                    <button class="icon-btn-sm" title="Удалить"
                            onclick="event.stopPropagation(); deleteExerciseTemplate(${t.id})">×</button>
                </div>
            `).join('');
        }
    }

    const mealList = document.getElementById('templates-meals-list');
    if (mealList) {
        if (!state.templates.meals.length) {
            mealList.innerHTML = '<div class="muted">Нет шаблонов еды</div>';
        } else {
            mealList.innerHTML = state.templates.meals.map(t => {
                const parts = [];
                if (t.default_protein_g != null) parts.push(`${t.default_protein_g} г белка`);
                if (t.default_calories != null) parts.push(`${t.default_calories} ккал`);
                return `
                <div class="template-item" onclick="openTemplateModal('meal', ${t.id})">
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(t.name)}</div>
                        <div class="template-item-detail">${parts.join(' · ') || 'без значений'}</div>
                    </div>
                    <button class="icon-btn-sm" title="Удалить"
                            onclick="event.stopPropagation(); deleteMealTemplate(${t.id})">×</button>
                </div>`;
            }).join('');
        }
    }
}

function addExerciseTemplatePrompt() { openTemplateModal('exercise'); }
function addMealTemplatePrompt() { openTemplateModal('meal'); }

let tplCtx = null;
function openTemplateModal(kind, id = null, pre = null) {
    const list = kind === 'exercise' ? state.templates.exercises : state.templates.meals;
    const t = id != null ? list.find(x => x.id === id) : null;
    tplCtx = { kind, id, oldName: t?.name };
    const name = t?.name ?? pre?.name ?? '';
    document.getElementById('tpl-modal-title').textContent =
        `${t ? 'Изменить' : 'Новый'} шаблон: ${kind === 'exercise' ? 'упражнение' : 'еда'}`;
    document.getElementById('tpl-modal-body').innerHTML =
        `<label>Название <input type="text" id="tpl-name" value="${escapeHtml(name)}"></label>` +
        (kind === 'exercise'
            ? `<label>Повторы по подходам через запятую
                <input type="text" id="tpl-reps" placeholder="10, 10, 8"
                       value="${escapeHtml((t?.default_reps_list ?? pre?.reps ?? [10, 10, 10]).join(', '))}"></label>`
            : `<div class="grid-2">
                <label>Белок, г <input type="number" id="tpl-protein" step="0.1" min="0" value="${t?.default_protein_g ?? pre?.protein ?? ''}"></label>
                <label>Ккал <input type="number" id="tpl-cal" min="0" value="${t?.default_calories ?? pre?.calories ?? ''}"></label>
               </div>`) +
        '<div class="form-error hidden" id="tpl-error"></div>';
    document.getElementById('tpl-modal-overlay').classList.add('active');
    document.getElementById('tpl-name').focus();
}

function closeTemplateModal() {
    document.getElementById('tpl-modal-overlay').classList.remove('active');
}

async function saveTemplateModal() {
    const { kind, id, oldName } = tplCtx;
    const err = (m) => {
        const e = document.getElementById('tpl-error');
        e.textContent = m;
        e.classList.remove('hidden');
    };
    const name = document.getElementById('tpl-name').value.trim();
    if (!name) return err('Укажи название');
    let url, payload;
    if (kind === 'exercise') {
        const reps = document.getElementById('tpl-reps').value.split(',')
            .map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
        if (!reps.length || reps.some(n => n < 1 || n > 1000)) return err('Повторы — целые числа от 1 до 1000 через запятую');
        url = '/api/templates/exercises';
        payload = { name, default_reps_list: reps };
    } else {
        const p = document.getElementById('tpl-protein').value;
        const c = document.getElementById('tpl-cal').value;
        url = '/api/templates/meals';
        payload = { name, default_protein_g: p ? parseFloat(p) : null, default_calories: c ? parseFloat(c) : null };
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) return err('Не удалось сохранить — проверь значения');
    if (id != null && oldName !== name) await fetch(`${url}/${id}`, { method: 'DELETE' });  // переименование
    closeTemplateModal();
    await loadTemplates();
    renderTemplatesManagement();
    renderTemplateChips();
}

async function deleteExerciseTemplate(id) {
    if (!confirm('Удалить шаблон упражнения?')) return;
    await fetch(`/api/templates/exercises/${id}`, { method: 'DELETE' });
    await loadTemplates();
    renderTemplatesManagement();
    renderTemplateChips();
}

async function deleteMealTemplate(id) {
    if (!confirm('Удалить шаблон еды?')) return;
    await fetch(`/api/templates/meals/${id}`, { method: 'DELETE' });
    await loadTemplates();
    renderTemplatesManagement();
    renderTemplateChips();
}

// ==================== Template chips ====================
function renderTemplateChips() {
    const exContainer = document.getElementById('template-chips-exercises');
    const mealContainer = document.getElementById('template-chips-meals');
    if (!exContainer || !mealContainer) return;

    if (!state.templates.exercises.length) {
        exContainer.innerHTML = '';
    } else {
        exContainer.innerHTML = state.templates.exercises.map((t, i) =>
            `<button type="button" class="template-chip" data-ex-idx="${i}">
                ${escapeHtml(t.name)} · ${t.default_reps_list.join('·')}
            </button>`
        ).join('');
        exContainer.querySelectorAll('[data-ex-idx]').forEach(btn => {
            btn.onclick = () => {
                const t = state.templates.exercises[parseInt(btn.dataset.exIdx, 10)];
                addExerciseRow(t.name, t.default_reps_list);
            };
        });
    }

    if (!state.templates.meals.length) {
        mealContainer.innerHTML = '';
    } else {
        mealContainer.innerHTML = state.templates.meals.map((t, i) => {
            const parts = [escapeHtml(t.name)];
            if (t.default_protein_g != null) parts.push(`${t.default_protein_g}г Б`);
            if (t.default_calories != null) parts.push(`${t.default_calories} ккал`);
            return `<button type="button" class="template-chip" data-meal-idx="${i}">
                ${parts.join(' · ')}
            </button>`;
        }).join('');
        mealContainer.querySelectorAll('[data-meal-idx]').forEach(btn => {
            btn.onclick = () => {
                const t = state.templates.meals[parseInt(btn.dataset.mealIdx, 10)];
                addMealRow({
                    description: t.name,
                    protein_g: t.default_protein_g,
                    calories: t.default_calories,
                });
            };
        });
    }
}

// ==================== Day modal ====================
const modalOverlay = () => document.getElementById('modal-overlay');
const modalBody = () => document.getElementById('modal-body');

async function openDayModal(dateISO) {
    const day = state.days.find(d => d.date === dateISO);
    renderModal(dateISO, day);
    modalOverlay().classList.add('active');
}

function openNewDayModal() {
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    renderModal(today, state.days.find(d => d.date === today) || null);
    modalOverlay().classList.add('active');
}

function closeModal() {
    modalOverlay().classList.remove('active');
}

modalOverlay()?.addEventListener('click', (e) => {
    if (e.target === modalOverlay()) closeModal();
});

function renderModal(dateISO, day) {
    document.getElementById('modal-title').textContent = fmtDateLong(dateISO);

    const workout = day?.workout;
    const meals = day?.meals || [];
    const body = day?.body;

    modalBody().innerHTML = `
        <div class="modal-date-row">
            <label>Дата</label>
            <input type="date" id="modal-date" value="${dateISO}">
        </div>

        <section class="modal-section">
            <h3>🏋️ Тренировка</h3>
            <label class="toggle">
                <input type="checkbox" id="modal-workout-toggle" ${workout ? 'checked' : ''}>
                <span>Был тренировочный день</span>
            </label>
            <div id="modal-workout-body" class="${workout ? '' : 'hidden'}">
                <label>Заметки
                    <textarea id="modal-workout-notes" rows="2">${workout?.notes || ''}</textarea>
                </label>
                <div class="template-chips" id="template-chips-exercises"></div>
                <div id="modal-exercises"></div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="addExerciseRow()">+ Упражнение</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="copyLastWorkout()">↺ Как в прошлый раз</button>
            </div>
        </section>

        <section class="modal-section">
            <h3>🍽️ Питание</h3>
            <div class="template-chips" id="template-chips-meals"></div>
            <div id="modal-meals"></div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addMealRow()">+ Приём пищи</button>
        </section>

        <section class="modal-section">
            <h3>⚖️ Тело</h3>
            <div class="grid-2">
                <label>Вес (кг)
                    <input type="number" id="modal-weight" step="0.1" value="${body?.weight_kg ?? ''}">
                </label>
                <label>Рост (см)
                    <input type="number" id="modal-height" step="0.1" value="${body?.height_cm ?? ''}">
                </label>
            </div>
            <label>Заметка
                <input type="text" id="modal-body-notes" value="${body?.notes || ''}">
            </label>
        </section>
    `;

    renderTemplateChips();

    if (workout) workout.exercises.forEach(ex => addExerciseRow(ex.exercise_name, ex.reps_list));
    meals.forEach(m => addMealRow(m));
    document.getElementById('modal-date').addEventListener('change',
        () => document.querySelectorAll('.exercise-edit-row').forEach(updateLastHint));

    document.getElementById('modal-workout-toggle').addEventListener('change', (e) => {
        document.getElementById('modal-workout-body').classList.toggle('hidden', !e.target.checked);
    });

    document.getElementById('btn-save').onclick = () => saveDay(dateISO);
    document.getElementById('btn-delete').onclick = async () => {
        if (!confirm('Удалить все данные за этот день?')) return;
        await fetch(`/api/day/${dateISO}`, { method: 'DELETE' });
        closeModal();
        await loadAll();
    };
}

// ==================== Exercise rows ====================
function addExerciseRow(name = '', repsList = [10]) {
    const container = document.getElementById('modal-exercises');
    const row = document.createElement('div');
    row.className = 'exercise-edit-row';
    row.innerHTML = `
        <div class="exercise-edit-head">
            <input type="text" class="ex-name-input" list="exercise-suggestions"
                   placeholder="Название упражнения" value="${escapeHtml(name)}">
            <button type="button" class="icon-btn-sm save-template-btn"
                    title="Сохранить как шаблон">💾</button>
            <button type="button" class="icon-btn-sm remove-btn" title="Удалить">×</button>
        </div>
        <div class="exercise-sets">
            <span class="muted">Повторы по подходам:</span>
            <div class="sets-container"></div>
            <button type="button" class="btn btn-secondary btn-sm add-set-btn">+ подход</button>
        </div>
        <button type="button" class="ex-last hidden"></button>
    `;
    const setsContainer = row.querySelector('.sets-container');
    repsList.forEach(r => setsContainer.appendChild(makeSetInput(r)));
    row.querySelector('.add-set-btn').onclick = () => {
        setsContainer.appendChild(makeSetInput(10));
    };
    row.querySelector('.remove-btn').onclick = () => row.remove();
    row.querySelector('.save-template-btn').onclick = () => saveRowAsExerciseTemplate(row);
    row.querySelector('.ex-name-input').addEventListener('input', () => updateLastHint(row));
    row.querySelector('.ex-last').onclick = (e) => {
        setsContainer.innerHTML = '';
        e.currentTarget._reps.forEach(r => setsContainer.appendChild(makeSetInput(r)));
    };
    updateLastHint(row);
    container.appendChild(row);
}

function makeSetInput(value) {
    const wrap = document.createElement('div');
    wrap.className = 'set-input-wrap';
    wrap.innerHTML = `
        <input type="number" class="set-input" min="1" max="1000" value="${value}" title="Повторы">
        <button type="button" class="icon-btn-xs" title="Убрать подход">×</button>
    `;
    wrap.querySelector('.icon-btn-xs').onclick = () => wrap.remove();
    return wrap;
}

function saveRowAsExerciseTemplate(row) {
    const name = row.querySelector('.ex-name-input').value.trim();
    const reps = [...row.querySelectorAll('.set-input')]
        .map(i => parseInt(i.value, 10)).filter(r => Number.isFinite(r) && r > 0);
    if (!name || !reps.length) { alert('Впиши название и хотя бы один подход'); return; }
    openTemplateModal('exercise', null, { name, reps });
}

// ==================== Meal rows ====================
function addMealRow(meal = {}) {
    const container = document.getElementById('modal-meals');
    const row = document.createElement('div');
    row.className = 'meal-edit-row';
    row.innerHTML = `
        <input type="text" class="meal-desc" placeholder="Что съел?" value="${escapeHtml(meal.description || '')}">
        <input type="number" class="meal-protein" placeholder="Белок, г" step="0.1" min="0" value="${meal.protein_g ?? ''}">
        <input type="number" class="meal-cal" placeholder="Ккал" step="1" min="0" value="${meal.calories ?? ''}">
        <button type="button" class="icon-btn-sm save-template-btn" title="Сохранить как шаблон">💾</button>
        <button type="button" class="icon-btn-sm remove-btn" title="Удалить">×</button>
    `;
    row.querySelector('.remove-btn').onclick = () => row.remove();
    row.querySelector('.save-template-btn').onclick = () => saveRowAsMealTemplate(row);
    container.appendChild(row);
}

function saveRowAsMealTemplate(row) {
    const name = row.querySelector('.meal-desc').value.trim();
    if (!name) { alert('Сначала впиши описание еды'); return; }
    openTemplateModal('meal', null, {
        name,
        protein: row.querySelector('.meal-protein').value,
        calories: row.querySelector('.meal-cal').value,
    });
}

// ==================== Save day ====================
async function saveDay(originalDate) {
    const newDate = document.getElementById('modal-date').value;
    if (!newDate) { alert('Укажи дату'); return; }

    const workoutEnabled = document.getElementById('modal-workout-toggle').checked;

    const exercises = [];
    if (workoutEnabled) {
        document.querySelectorAll('.exercise-edit-row').forEach(row => {
            const name = row.querySelector('.ex-name-input').value.trim();
            const repsList = [...row.querySelectorAll('.set-input')]
                .map(i => parseInt(i.value, 10))
                .filter(r => Number.isFinite(r) && r > 0);
            if (name && repsList.length) {
                exercises.push({ exercise_name: name, reps_list: repsList });
            }
        });
    }

    const meals = [];
    document.querySelectorAll('.meal-edit-row').forEach(row => {
        const desc = row.querySelector('.meal-desc').value.trim();
        const protein = row.querySelector('.meal-protein').value;
        const cal = row.querySelector('.meal-cal').value;
        if (desc || protein || cal) {
            meals.push({
                date: newDate,
                description: desc || null,
                protein_g: protein ? parseFloat(protein) : null,
                calories: cal ? parseFloat(cal) : null,
            });
        }
    });

    const w = document.getElementById('modal-weight').value;
    const h = document.getElementById('modal-height').value;
    const bNotes = document.getElementById('modal-body-notes').value.trim();
    const body = (w || h || bNotes) ? {
        date: newDate,
        weight_kg: w ? parseFloat(w) : null,
        height_cm: h ? parseFloat(h) : null,
        notes: bNotes || null,
    } : null;

    const payload = {
        workout: workoutEnabled && exercises.length
            ? {
                date: newDate,
                notes: document.getElementById('modal-workout-notes').value.trim() || null,
                exercises,
            }
            : null,
        meals,
        body,
    };

    if (newDate !== originalDate && state.days.some(d => d.date === newDate)
        && !confirm('На эту дату уже есть запись — она будет заменена. Продолжить?')) return;

    const res = await fetch(`/api/day/${newDate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let msg = 'Ошибка сохранения';
        try { const e = await res.json(); msg += ': ' + JSON.stringify(e); } catch {}
        alert(msg);
        return;
    }

    if (newDate !== originalDate && state.days.some(d => d.date === originalDate)) {
        await fetch(`/api/day/${originalDate}`, { method: 'DELETE' });
    }

    closeModal();
    await loadAll();
}

// ==================== Init ====================
function switchTab(name) {
    if (!document.getElementById('tab-' + name)) name = 'overview';
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.getElementById('period-switch').classList.toggle('hidden', name !== 'overview');
    if (name === 'overview') Object.values(state.charts).forEach(c => c && c.resize());
}

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    if (!document.getElementById('days-list')) return;  // страница импорта
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        history.replaceState(null, '', t.dataset.tab === 'overview' ? location.pathname : '#' + t.dataset.tab);
        switchTab(t.dataset.tab);
    }));
    window.addEventListener('hashchange', () => switchTab(location.hash.slice(1)));
    switchTab(location.hash.slice(1));

    document.querySelectorAll('#period-switch [data-period]').forEach(b => {
        b.classList.toggle('active', b.dataset.period === state.period);
        b.addEventListener('click', () => {
            state.period = b.dataset.period;
            localStorage.setItem('period', state.period);
            document.querySelectorAll('#period-switch [data-period]').forEach(x => x.classList.toggle('active', x === b));
            renderStats();
            renderCharts();
        });
    });
    const goal = document.getElementById('protein-goal');
    goal.value = state.goal ?? '';
    goal.addEventListener('change', () => {
        state.goal = parseFloat(goal.value) || null;
        state.goal ? localStorage.setItem('goal', state.goal) : localStorage.removeItem('goal');
        renderStats();
        renderProteinChart(proteinSeries(periodDays()));
    });
    ['exercise-select', 'exercise-metric'].forEach(id =>
        document.getElementById(id).addEventListener('change', () => {
            localStorage.setItem('exercise', document.getElementById('exercise-select').value);
            renderExerciseChart(periodDays());
        }));
    document.getElementById('tpl-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'tpl-modal-overlay') closeTemplateModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        ['tpl-modal-overlay', 'export-modal-overlay', 'modal-overlay'].some(id => {
            const el = document.getElementById(id);
            if (!el.classList.contains('active')) return false;
            el.classList.remove('active');
            return true;
        });
    });
    loadAll();
});
// ==================== Подсказки «прошлый раз» ====================
function lastResult(name, before) {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    for (const d of state.days) {  // дни идут от новых к старым
        if (d.date >= before) continue;
        const ex = d.workout?.exercises.find(e => e.exercise_name.trim().toLowerCase() === n);
        if (ex) return { date: d.date, reps: ex.reps_list };
    }
    return null;
}

function updateLastHint(row) {
    const btn = row.querySelector('.ex-last');
    const last = lastResult(row.querySelector('.ex-name-input').value, document.getElementById('modal-date').value);
    btn.classList.toggle('hidden', !last);
    if (!last) return;
    btn._reps = last.reps;
    btn.textContent = `Прошлый раз (${fmtDate(last.date)}): ${last.reps.join(' · ')} — подставить`;
}

function copyLastWorkout() {
    const before = document.getElementById('modal-date').value;
    const d = state.days.find(x => x.date < before && x.workout?.exercises.length);
    if (!d) { alert('Предыдущих тренировок нет'); return; }
    d.workout.exercises.forEach(e => addExerciseRow(e.exercise_name, e.reps_list));
}

// ==================== Прогресс по упражнению ====================
function renderExerciseControls() {
    const sel = document.getElementById('exercise-select');
    const counts = new Map();
    state.days.forEach(d => d.workout?.exercises.forEach(e => {
        const k = e.exercise_name.trim().toLowerCase();
        const o = counts.get(k) || { name: e.exercise_name.trim(), n: 0 };
        o.n++;
        counts.set(k, o);
    }));
    const names = [...counts.values()].sort((a, b) => b.n - a.n).map(o => o.name);
    const cur = sel.value || localStorage.getItem('exercise');
    sel.innerHTML = names.map(n => `<option>${escapeHtml(n)}</option>`).join('');
    if (names.includes(cur)) sel.value = cur;
}

function renderExerciseChart(pd) {
    const canvas = document.getElementById('chart-exercise');
    const ctx = canvas.getContext('2d');
    if (state.charts.exercise) state.charts.exercise.destroy();
    state.charts.exercise = null;
    const key = document.getElementById('exercise-select').value.trim().toLowerCase();
    const best = document.getElementById('exercise-metric').value === 'best';
    const rows = pd.map(d => {
        const reps = (d.workout?.exercises || [])
            .filter(e => e.exercise_name.trim().toLowerCase() === key)
            .flatMap(e => e.reps_list);
        return reps.length ? { date: d.date, reps, v: best ? Math.max(...reps) : sum(reps) } : null;
    }).filter(Boolean);

    const t = chartTheme();
    if (!rows.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = t.tick;
        ctx.textAlign = 'center';
        ctx.font = `${13 * (window.devicePixelRatio || 1)}px sans-serif`;
        ctx.fillText('Нет данных за период', canvas.width / 2, canvas.height / 2);
        return;
    }
    const color = isDark() ? '#a78bfa' : '#8b5cf6';
    const label = best ? 'Лучший подход' : 'Всего повторений';
    state.charts.exercise = new Chart(ctx, {
        type: 'line',
        data: {
            labels: rows.map(r => fmtDate(r.date)),
            datasets: [{
                label, data: rows.map(r => r.v),
                borderColor: color, backgroundColor: color, borderWidth: 2.5,
                tension: .3, pointRadius: 4, pointHoverRadius: 6,
            }],
        },
        options: {
            ...CHART_OPTS,
            onClick: (e, els) => { if (els.length) openDayModal(rows[els[0].index].date); },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, borderWidth: 1,
                    padding: 12, cornerRadius: 10, displayColors: false,
                    callbacks: {
                        title: (i) => fmtDateLong(rows[i[0].dataIndex].date),
                        label: (i) => [`${label}: ${i.parsed.y}`, `Подходы: ${rows[i.dataIndex].reps.join(' · ')}`],
                    },
                },
            },
            scales: {
                x: { ticks: { color: t.tick, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
                y: { beginAtZero: true, ticks: { color: t.tick, font: { size: 11 } }, grid: { color: t.grid }, border: { display: false } },
            },
        },
    });
}