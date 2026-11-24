// ==================== State ====================
const state = {
    days: [],
    templates: { exercises: [], meals: [] },
    charts: { workout: null, protein: null, weight: null },
};

// ==================== Загрузка ====================
async function loadAll() {
    const [days, workouts, protein, weight] = await Promise.all([
        fetch('/api/days').then(r => r.json()),
        fetch('/api/chart/workouts').then(r => r.json()),
        fetch('/api/chart/protein').then(r => r.json()),
        fetch('/api/chart/weight').then(r => r.json()),
    ]);
    await loadTemplates();
    state.days = days;
    renderStats(workouts, protein, weight);
    renderWorkoutChart(workouts);
    renderProteinChart(protein);
    renderWeightChart(weight);
    renderDays(days);
    renderTemplatesManagement();
}

async function refreshChartsOnly() {
    const [workouts, protein, weight] = await Promise.all([
        fetch('/api/chart/workouts').then(r => r.json()),
        fetch('/api/chart/protein').then(r => r.json()),
        fetch('/api/chart/weight').then(r => r.json()),
    ]);
    renderWorkoutChart(workouts);
    renderProteinChart(protein);
    renderWeightChart(weight);
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
        await refreshChartsOnly();
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
function renderStats(workouts, protein, weight) {
    document.getElementById('stat-workouts').textContent = workouts.length;
    document.getElementById('stat-volume').textContent =
        workouts.reduce((s, w) => s + w.total_reps, 0).toLocaleString('ru-RU');
    document.getElementById('stat-protein').textContent =
        Math.round(protein.reduce((s, p) => s + p.total_protein, 0)).toLocaleString('ru-RU') + ' г';
    const w = weight.length ? weight[weight.length - 1].weight_kg : null;
    document.getElementById('stat-weight').textContent = w != null ? w + ' кг' : '—';
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
    const el = document.getElementById('days-list');
    if (!days.length) {
        el.innerHTML = '<div class="empty">Пока нет записей. Нажми «+ Добавить день» сверху.</div>';
        return;
    }
    el.innerHTML = days.map(dayCardHTML).join('');
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
    const exList = document.getElementById('templates-exercises-list');
    if (exList) {
        if (!state.templates.exercises.length) {
            exList.innerHTML = '<div class="muted">Нет шаблонов упражнений</div>';
        } else {
            exList.innerHTML = state.templates.exercises.map(t => `
                <div class="template-item">
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(t.name)}</div>
                        <div class="template-item-detail">${t.default_reps_list.length} подходов: ${t.default_reps_list.join(' · ')}</div>
                    </div>
                    <button class="icon-btn-sm" title="Удалить"
                            onclick="deleteExerciseTemplate(${t.id})">×</button>
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
                <div class="template-item">
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(t.name)}</div>
                        <div class="template-item-detail">${parts.join(' · ') || 'без значений'}</div>
                    </div>
                    <button class="icon-btn-sm" title="Удалить"
                            onclick="deleteMealTemplate(${t.id})">×</button>
                </div>`;
            }).join('');
        }
    }
}

async function addExerciseTemplatePrompt() {
    const name = prompt('Название упражнения:');
    if (!name || !name.trim()) return;
    const repsStr = prompt('Повторы по подходам через запятую (например: 10,10,10,8):', '10,10,10');
    if (!repsStr) return;
    const reps = repsStr.split(',').map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n > 0);
    if (!reps.length) { alert('Нужен хотя бы один подход'); return; }

    const res = await fetch('/api/templates/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), default_reps_list: reps }),
    });
    if (!res.ok) { alert('Ошибка создания шаблона'); return; }
    await loadTemplates();
    renderTemplatesManagement();
    renderTemplateChips();
}

async function addMealTemplatePrompt() {
    const name = prompt('Название (например: "Творог 200г"):');
    if (!name || !name.trim()) return;
    const proteinStr = prompt('Белок (г), можно оставить пустым:', '');
    const calStr = prompt('Калории (ккал), можно оставить пустым:', '');

    const payload = {
        name: name.trim(),
        default_protein_g: proteinStr ? parseFloat(proteinStr) : null,
        default_calories: calStr ? parseFloat(calStr) : null,
    };

    const res = await fetch('/api/templates/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) { alert('Ошибка создания шаблона'); return; }
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
    const today = new Date().toISOString().slice(0, 10);
    renderModal(today, null);
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
    `;
    const setsContainer = row.querySelector('.sets-container');
    repsList.forEach(r => setsContainer.appendChild(makeSetInput(r)));
    row.querySelector('.add-set-btn').onclick = () => {
        setsContainer.appendChild(makeSetInput(10));
    };
    row.querySelector('.remove-btn').onclick = () => row.remove();
    row.querySelector('.save-template-btn').onclick = () => saveRowAsExerciseTemplate(row);
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

async function saveRowAsExerciseTemplate(row) {
    const name = row.querySelector('.ex-name-input').value.trim();
    if (!name) { alert('Сначала впиши название упражнения'); return; }
    const reps = [...row.querySelectorAll('.set-input')]
        .map(i => parseInt(i.value, 10))
        .filter(r => Number.isFinite(r) && r > 0);
    if (!reps.length) { alert('Добавь хотя бы один подход'); return; }

    const templateName = prompt('Название шаблона:', name);
    if (!templateName || !templateName.trim()) return;

    const res = await fetch('/api/templates/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), default_reps_list: reps }),
    });
    if (!res.ok) { alert('Ошибка сохранения шаблона'); return; }
    await loadTemplates();
    renderTemplateChips();
    renderTemplatesManagement();
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

async function saveRowAsMealTemplate(row) {
    const desc = row.querySelector('.meal-desc').value.trim();
    if (!desc) { alert('Сначала впиши описание еды'); return; }
    const protein = row.querySelector('.meal-protein').value;
    const cal = row.querySelector('.meal-cal').value;

    const templateName = prompt('Название шаблона:', desc);
    if (!templateName || !templateName.trim()) return;

    const res = await fetch('/api/templates/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: templateName.trim(),
            default_protein_g: protein ? parseFloat(protein) : null,
            default_calories: cal ? parseFloat(cal) : null,
        }),
    });
    if (!res.ok) { alert('Ошибка сохранения шаблона'); return; }
    await loadTemplates();
    renderTemplateChips();
    renderTemplatesManagement();
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

    if (newDate !== originalDate) {
        await fetch(`/api/day/${originalDate}`, { method: 'DELETE' });
    }

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

    closeModal();
    await loadAll();
}

// ==================== Init ====================
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadAll();
});