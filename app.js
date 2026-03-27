/* ==========================================
   ICCP — Single Page Application
   Pure JavaScript SPA with hash-based routing
   ========================================== */

const API = 'api'; // relative path to PHP API

// ==========================================
// State
// ==========================================
const state = {
  user: JSON.parse(localStorage.getItem('iccp_user') || 'null'),
  token: localStorage.getItem('iccp_token') || null,
  sidebarCollapsed: false,
  mobileOpen: false
};

// ==========================================
// API Helper
// ==========================================
async function api(endpoint, options = {}) {
  const headers = { ...options.headers };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}/${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (res.status === 401 && !endpoint.includes('action=login')) { logout(); return; }
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ==========================================
// Toast
// ==========================================
function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span style="font-size:18px">${icon}</span><span class="toast-message">${message}</span>
    <button onclick="this.parentElement.remove()" style="color:var(--gray-500);font-size:16px">✕</button>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ==========================================
// Auth
// ==========================================
function setAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('iccp_token', token);
  localStorage.setItem('iccp_user', JSON.stringify(user));
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('iccp_token');
  localStorage.removeItem('iccp_user');
  navigate('login');
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function isOverdue(d) { return d && new Date(d) < new Date(); }

const priorityLabel = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
const statusLabel = { todo: 'Por hacer', in_progress: 'En progreso', done: 'Completada' };
const activityIcon = { task_created: '📋', status_changed: '🔄', assigned: '👤', file_uploaded: '📎', calendar_synced: '📅', department_created: '🏢' };

// ==========================================
// Router
// ==========================================
function navigate(page) {
  window.location.hash = '#' + page;
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '';
  const [page, ...rest] = hash.split('?');
  const params = {};
  if (rest.length) {
    rest.join('?').split('&').forEach(p => {
      const [k, v] = p.split('=');
      params[k] = decodeURIComponent(v || '');
    });
  }
  return { page: page || 'dashboard', params };
}

function router() {
  const { page, params } = getRoute();

  // Auth guard
  if (!state.token && page !== 'login') {
    navigate('login');
    return;
  }
  if (state.token && page === 'login') {
    navigate('dashboard');
    return;
  }

  const app = document.getElementById('app');

  if (page === 'login') {
    app.innerHTML = '';
    renderLogin(app);
    return;
  }

  // Render layout if not already present
  if (!document.getElementById('sidebar')) {
    app.innerHTML = '';
    renderLayout(app);
  }

  // Update active nav
  document.querySelectorAll('.sidebar-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update title
  const titles = { dashboard: 'Dashboard', tasks: 'Gestión de Tareas', departments: 'Departamentos', users: 'Usuarios', calendar: 'Calendario', settings: 'Configuración' };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[page] || 'ICCP';

  // Render page content
  const content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="page-loading"><span class="spinner spinner-lg"></span></div>';

  const wrapper = document.createElement('div');
  wrapper.className = 'page-transition';

  switch (page) {
    case 'dashboard': renderDashboard(wrapper); break;
    case 'tasks': renderTasks(wrapper, params); break;
    case 'departments': renderDepartments(wrapper); break;
    case 'users': renderUsers(wrapper); break;
    case 'calendar': renderCalendar(wrapper); break;
    case 'settings': renderSettings(wrapper, params); break;
    default: wrapper.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Página no encontrada</h3></div>';
      content.innerHTML = '';
      content.appendChild(wrapper);
  }
}

// ==========================================
// Layout
// ==========================================
function renderLayout(container) {
  const navItems = [
    { page: 'dashboard', icon: '📊', label: 'Dashboard' },
    { page: 'tasks', icon: '✅', label: 'Tareas' },
    { page: 'departments', icon: '🏢', label: 'Departamentos' },
    { page: 'users', icon: '👥', label: 'Usuarios' },
    { page: 'calendar', icon: '📅', label: 'Calendario' },
    { page: 'settings', icon: '⚙️', label: 'Configuración' }
  ];

  container.innerHTML = `
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">IC</div>
        <h1>ICCP</h1>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-title">Menú Principal</div>
        ${navItems.map(n => `
          <div class="sidebar-link" data-page="${n.page}" onclick="closeMobile();navigate('${n.page}')">
            <span class="link-icon">${n.icon}</span>
            <span>${n.label}</span>
          </div>
        `).join('')}
      </nav>
      <div class="sidebar-toggle" onclick="toggleSidebar()">←</div>
    </aside>
    <div class="main-area" id="main-area">
      <header class="topbar" id="topbar">
        <div class="topbar-left">
          <div class="mobile-toggle" onclick="toggleMobile()">☰</div>
          <h1 class="topbar-title" id="page-title">Dashboard</h1>
        </div>
        <div class="topbar-right">
          <div class="topbar-user" onclick="toggleUserMenu()">
            <div class="topbar-avatar">${initials(state.user?.name)}</div>
            <div class="topbar-user-info">
              <span class="topbar-user-name">${state.user?.name || ''}</span>
              <span class="topbar-user-role">${state.user?.role || ''}</span>
            </div>
            <div class="user-dropdown" id="user-dropdown" style="display:none">
              <div class="user-dropdown-info">
                <div class="name">${state.user?.name}</div>
                <div class="email">${state.user?.email}</div>
              </div>
              <button onclick="event.stopPropagation();navigate('settings');closeUserMenu()">⚙️ Configuración</button>
              <button class="logout-btn" onclick="event.stopPropagation();logout()">🚪 Cerrar sesión</button>
            </div>
          </div>
        </div>
      </header>
      <main class="page-content" id="page-content"></main>
    </div>
  `;

  document.getElementById('sidebar-overlay').addEventListener('click', closeMobile);
  document.addEventListener('click', (e) => { if (!e.target.closest('.topbar-user')) closeUserMenu(); });
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  // For simplicity, just toggle mobile
}

function toggleMobile() {
  state.mobileOpen = !state.mobileOpen;
  document.getElementById('sidebar').classList.toggle('mobile-open', state.mobileOpen);
  document.getElementById('sidebar-overlay').classList.toggle('visible', state.mobileOpen);
}

function closeMobile() {
  state.mobileOpen = false;
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('mobile-open');
  if (ov) ov.classList.remove('visible');
}

function toggleUserMenu() {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function closeUserMenu() {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = 'none';
}

// ==========================================
// Login Page
// ==========================================
function renderLogin(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-left">
        <div class="login-brand"><div class="login-brand-icon">IC</div><h1>ICCP</h1></div>
        <p class="login-tagline">Sistema de Gestión de Tareas Departamental. Organiza, asigna y da seguimiento a cada proyecto.</p>
        <div class="login-features">
          <div class="login-feature"><div class="login-feature-icon">📋</div><span>Tableros Kanban por departamento</span></div>
          <div class="login-feature"><div class="login-feature-icon">📅</div><span>Integración con Google Calendar</span></div>
          <div class="login-feature"><div class="login-feature-icon">📊</div><span>Panel de métricas en tiempo real</span></div>
          <div class="login-feature"><div class="login-feature-icon">👥</div><span>Gestión de equipos y roles</span></div>
        </div>
      </div>
      <div class="login-right">
        <div class="login-form-wrapper">
          <div class="login-form-header">
            <h2>Bienvenido</h2>
            <p>Ingresa tus credenciales para continuar</p>
          </div>
          <div id="login-error"></div>
          <form id="login-form">
            <div class="form-group"><label class="form-label">Correo electrónico</label><input class="form-input" id="login-email" type="email" placeholder="correo@ejemplo.com" required></div>
            <div class="form-group"><label class="form-label">Contraseña</label><input class="form-input" id="login-pass" type="password" placeholder="••••••••" required minlength="6"></div>
            <button type="submit" class="btn btn-primary login-submit" id="login-btn">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Cargando...';

    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-pass').value;

      const data = await api('auth.php?action=login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setAuth(data.token, data.user);
      navigate('dashboard');
    } catch (err) {
      document.getElementById('login-error').innerHTML = `<div class="error-box">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  });
}

// ==========================================
// Dashboard
// ==========================================
async function renderDashboard(wrapper) {
  try {
    const [mRes, aRes] = await Promise.all([
      api('dashboard.php?action=metrics'),
      api('dashboard.php?action=activity&limit=15')
    ]);
    const m = mRes.metrics;
    const activity = aRes.activity;
    const s = m.statusBreakdown;
    const p = m.priorityBreakdown;
    const total = m.totalTasks || 1;
    const rate = m.totalTasks > 0 ? Math.round((s.done / m.totalTasks) * 100) : 0;
    const maxP = Math.max(p.low, p.medium, p.high, p.urgent, 1);

    // Donut segments
    const donutData = [
      { val: s.todo, color: '#a0aec0', label: 'Por hacer' },
      { val: s.in_progress, color: '#4299e1', label: 'En progreso' },
      { val: s.done, color: '#38b2ac', label: 'Completadas' }
    ];
    let cumPct = 0;
    const circles = donutData.map(d => {
      const pct = m.totalTasks > 0 ? (d.val / m.totalTasks) * 100 : 0;
      const da = `${pct * 2.83} ${283 - pct * 2.83}`;
      const doff = -cumPct * 2.83;
      cumPct += pct;
      return `<circle cx="50" cy="50" r="45" fill="none" stroke="${d.color}" stroke-width="8"
        stroke-dasharray="${da}" stroke-dashoffset="${doff}" stroke-linecap="round"
        transform="rotate(-90 50 50)" style="transition:stroke-dasharray .8s ease"/>`;
    }).join('');

    wrapper.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-icon blue">📋</div><div class="metric-info"><h4>Total Tareas</h4><div class="metric-value">${m.totalTasks}</div><span class="metric-sub positive">↑ ${m.weeklyCreated} esta semana</span></div></div>
        <div class="metric-card"><div class="metric-icon green">✅</div><div class="metric-info"><h4>Completadas</h4><div class="metric-value">${s.done}</div><span class="metric-sub positive">${rate}% tasa de éxito</span></div></div>
        <div class="metric-card"><div class="metric-icon orange">⏳</div><div class="metric-info"><h4>En Progreso</h4><div class="metric-value">${s.in_progress}</div></div></div>
        <div class="metric-card"><div class="metric-icon red">⚠️</div><div class="metric-info"><h4>Vencidas</h4><div class="metric-value">${m.overdueTasks}</div>${m.overdueTasks > 0 ? '<span class="metric-sub negative">Requiere atención</span>' : ''}</div></div>
      </div>
      <div class="grid-auto" style="margin-bottom:28px">
        <div class="card"><div class="card-header"><h3>Estado de Tareas</h3></div>
          <div class="donut-chart">
            <svg viewBox="0 0 100 100" style="width:140px;height:140px;flex-shrink:0">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--gray-200)" stroke-width="8"/>
              ${circles}
              <text x="50" y="46" text-anchor="middle" font-size="16" font-weight="700" fill="var(--primary-800)">${rate}%</text>
              <text x="50" y="58" text-anchor="middle" font-size="7" fill="var(--gray-500)">completado</text>
            </svg>
            <div class="donut-legend">
              ${donutData.map(d => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span><span>${d.label}</span><span class="legend-value">${d.val}</span></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card"><div class="card-header"><h3>Tareas por Prioridad</h3></div>
          <div class="chart-container"><div class="bar-chart">
            ${[{ k: 'low', l: 'Baja', c: 'primary', v: p.low }, { k: 'medium', l: 'Media', c: 'success', v: p.medium }, { k: 'high', l: 'Alta', c: 'warning', v: p.high }, { k: 'urgent', l: 'Urgente', c: 'danger', v: p.urgent }]
        .map(i => `<div class="bar-item"><div class="bar-value">${i.v}</div><div class="bar ${i.c}" style="height:${(i.v / maxP) * 100}%"></div><div class="bar-label">${i.l}</div></div>`).join('')}
          </div></div>
        </div>
      </div>
      <div class="grid-auto">
        <div class="card"><div class="card-header"><h3>Actividad Reciente</h3></div>
          <div class="card-body" style="max-height:400px;overflow-y:auto">
            ${activity.length === 0 ? '<div class="empty-state" style="padding:30px 0"><div class="empty-state-icon">📭</div><h3>Sin actividad aún</h3></div>' :
        '<div class="activity-list">' + activity.map(a => `
                <div class="activity-item">
                  <div class="activity-avatar">${initials(a.user_name)}</div>
                  <div><div class="activity-text"><strong>${a.user_name || ''}</strong> ${a.details || a.action}${a.task_title ? ` en <strong>${a.task_title}</strong>` : ''}</div>
                  <div class="activity-time">${activityIcon[a.action] || '📌'} ${timeAgo(a.created_at)}</div></div>
                </div>`).join('') + '</div>'}
          </div>
        </div>
        <div class="card"><div class="card-header"><h3>Resumen General</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
            ${[{ i: '🏢', l: 'Departamentos activos', v: m.totalDepartments }, { i: '👥', l: 'Usuarios registrados', v: m.totalUsers }, { i: '📋', l: 'Tareas esta semana', v: m.weeklyCreated }, { i: '✅', l: 'Completadas esta semana', v: m.weeklyCompleted }]
        .map(s => `<div class="stat-row"><div class="stat-row-icon"><span style="font-size:20px">${s.i}</span><span>${s.l}</span></div><span class="stat-row-value">${s.v}</span></div>`).join('')}
          </div>
        </div>
      </div>
    `;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Tasks (Kanban)
// ==========================================
async function renderTasks(wrapper) {
  try {
    const [tRes, dRes, uRes] = await Promise.all([
      api('tasks.php?action=list'),
      api('departments.php?action=list'),
      api('users.php?action=list')
    ]);
    let tasks = tRes.tasks;
    const depts = dRes.departments;
    const users = uRes.users;

    function buildBoard(filtered) {
      const todo = filtered.filter(t => t.status === 'todo');
      const inProg = filtered.filter(t => t.status === 'in_progress');
      const done = filtered.filter(t => t.status === 'done');

      const cols = [
        { key: 'todo', title: 'Por Hacer', tasks: todo, next: 'in_progress', btnLabel: '▶ Iniciar' },
        { key: 'in-progress', title: 'En Progreso', tasks: inProg, next: 'done', btnLabel: '✓ Completar' },
        { key: 'done', title: 'Completadas', tasks: done, next: null, btnLabel: null }
      ];

      return `<div class="kanban-board">${cols.map(c => `
        <div class="kanban-column">
          <div class="kanban-header">
            <div class="kanban-title"><span class="kanban-dot ${c.key}"></span>${c.title}</div>
            <span class="kanban-count">${c.tasks.length}</span>
          </div>
          <div class="kanban-body">
            ${c.tasks.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--gray-500);font-size:13px">No hay tareas</div>' :
          c.tasks.map(t => `
                <div class="task-card" onclick="openTaskDetail(${t.id})">
                  <div class="task-card-header">
                    <span class="task-card-title">${t.title}</span>
                    <span class="badge badge-${t.priority}">${priorityLabel[t.priority]}</span>
                  </div>
                  ${t.description ? `<p class="task-card-desc">${t.description}</p>` : ''}
                  <div class="task-card-footer">
                    <div class="task-card-meta">
                      ${t.due_date ? `<span class="${isOverdue(t.due_date) && t.status !== 'done' ? 'task-due-overdue' : ''}">📅 ${formatDate(t.due_date)}</span>` : ''}
                      ${t.attachment_count > 0 ? `<span>📎 ${t.attachment_count}</span>` : ''}
                      ${t.department_name ? `<span class="dept-tag" style="background:${t.department_color || '#2d3561'}">${t.department_name}</span>` : ''}
                    </div>
                    ${t.assignee_name ? `<div class="task-assignee" title="${t.assignee_name}">${initials(t.assignee_name)}</div>` : ''}
                  </div>
                  ${c.next ? `<div class="task-actions"><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();changeTaskStatus(${t.id},'${c.next}')">${c.btnLabel}</button></div>` : ''}
                </div>
              `).join('')}
          </div>
        </div>
      `).join('')}</div>`;
    }

    wrapper.innerHTML = `
      <div class="page-header"><h2>Gestión de Tareas</h2><div><button class="btn btn-primary" onclick="openCreateTask()">＋ Nueva Tarea</button></div></div>
      <div class="filters-bar">
        <select class="form-select" id="filter-dept" onchange="filterTasks()"><option value="">Todos los departamentos</option>${depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select>
        <select class="form-select" id="filter-priority" onchange="filterTasks()"><option value="">Todas las prioridades</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select>
      </div>
      <div id="kanban-container">${buildBoard(tasks)}</div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    // Global functions for tasks
    window._tasks = tasks;
    window._depts = depts;
    window._users = users;

    window.filterTasks = function () {
      const dept = document.getElementById('filter-dept').value;
      const pri = document.getElementById('filter-priority').value;
      let filtered = window._tasks;
      if (dept) filtered = filtered.filter(t => t.department_id == dept);
      if (pri) filtered = filtered.filter(t => t.priority === pri);
      document.getElementById('kanban-container').innerHTML = buildBoard(filtered);
    };

    window.changeTaskStatus = async function (id, status) {
      try {
        await api(`tasks.php?action=update&id=${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
        toast('Estado actualizado');
        renderTasks(document.createElement('div')).then(() => { });
        // Quick refresh
        const t = window._tasks.find(t => t.id == id);
        if (t) t.status = status;
        window.filterTasks();
      } catch (err) { toast(err.message, 'error'); }
    };

    window.openTaskDetail = async function (id) {
      try {
        const data = await api(`tasks.php?action=get&id=${id}`);
        const t = data.task;
        const att = data.attachments || [];
        const act = data.activity || [];

        showModal(`
          <div class="modal-header"><h2>${t.title}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            <div style="display:flex;gap:8px;margin-bottom:20px">
              <span class="badge badge-${t.status.replace('_', '-')}">${statusLabel[t.status]}</span>
              <span class="badge badge-${t.priority}">${priorityLabel[t.priority]}</span>
            </div>
            ${t.description ? `<div style="margin-bottom:20px"><label class="form-label">Descripción</label><p style="font-size:14px;color:var(--gray-700);line-height:1.6">${t.description}</p></div>` : ''}
            <div class="grid-2" style="margin-bottom:20px">
              <div><label class="form-label">Departamento</label><p style="font-size:14px">${t.department_name || '—'}</p></div>
              <div><label class="form-label">Asignado a</label><p style="font-size:14px">${t.assignee_name || 'Sin asignar'}</p></div>
              <div><label class="form-label">Creado por</label><p style="font-size:14px">${t.creator_name}</p></div>
              <div><label class="form-label">Fecha límite</label><p style="font-size:14px;${isOverdue(t.due_date) && t.status !== 'done' ? 'color:var(--danger-500)' : ''}">${formatDate(t.due_date)}</p></div>
            </div>
            <div style="margin-bottom:20px"><label class="form-label">Cambiar estado</label><div style="display:flex;gap:8px">
              ${['todo', 'in_progress', 'done'].map(s => `<button class="btn btn-sm ${t.status === s ? 'btn-primary' : 'btn-outline'}" onclick="changeTaskStatusModal(${t.id},'${s}')">${statusLabel[s]}</button>`).join('')}
            </div></div>
            ${att.length > 0 ? `<div style="margin-bottom:20px"><label class="form-label">Archivos (${att.length})</label><div class="file-list">${att.map(a => `<div class="file-item"><div class="file-info"><span>📄</span><a href="api/uploads/${a.filename}" target="_blank" style="color:var(--primary-600);font-weight:500">${a.original_name}</a></div><span class="file-size">${(a.file_size / 1024).toFixed(1)} KB</span></div>`).join('')}</div></div>` : ''}
            ${act.length > 0 ? `<div><label class="form-label">Historial</label><div class="activity-list">${act.map(a => `<div class="activity-item"><div class="activity-avatar" style="width:28px;height:28px;font-size:10px">${initials(a.user_name)}</div><div><div class="activity-text" style="font-size:13px"><strong>${a.user_name}</strong> ${a.details}</div><div class="activity-time">${formatDate(a.created_at)}</div></div></div>`).join('')}</div></div>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-sm btn-outline" onclick="syncCalendar(${t.id})">📅 Sincronizar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">🗑 Eliminar</button>
            <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
          </div>
        `, 'modal-lg');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.changeTaskStatusModal = async function (id, status) {
      try {
        await api(`tasks.php?action=update&id=${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
        toast('Estado actualizado');
        closeModal();
        navigate('tasks');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.deleteTask = async function (id) {
      if (!confirm('¿Eliminar esta tarea?')) return;
      try {
        await api(`tasks.php?action=delete&id=${id}`, { method: 'DELETE' });
        toast('Tarea eliminada');
        closeModal();
        navigate('tasks');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.syncCalendar = async function (id) {
      try {
        await api(`calendar.php?action=sync&id=${id}`, { method: 'POST' });
        toast('Sincronizada con Google Calendar');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.openCreateTask = function () {
      showModal(`
        <div class="modal-header"><h2>Nueva Tarea</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
        <form id="create-task-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="ct-title" placeholder="Nombre de la tarea" required></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input" id="ct-desc" placeholder="Describe la tarea..."></textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Departamento *</label><select class="form-select" id="ct-dept" required><option value="">Seleccionar...</option>${window._depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
              <div class="form-group"><label class="form-label">Prioridad</label><select class="form-select" id="ct-pri"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Asignar a</label><select class="form-select" id="ct-assign"><option value="">Sin asignar</option>${window._users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}</select></div>
              <div class="form-group"><label class="form-label">Fecha límite</label><input class="form-input" id="ct-due" type="datetime-local"></div>
            </div>
            <div class="form-group"><label class="form-label">Archivos</label>
              <div class="dropzone" onclick="document.getElementById('ct-files').click()"><div class="dropzone-icon">📂</div><div class="dropzone-text">Haz clic para seleccionar</div><div class="dropzone-hint">PDF, Word, Excel, imágenes (máx. 10MB)</div></div>
              <input type="file" id="ct-files" multiple style="display:none">
              <div id="ct-file-list" class="file-list"></div>
            </div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear Tarea</button></div>
        </form>
      `, 'modal-lg');

      document.getElementById('ct-files').addEventListener('change', function () {
        const list = document.getElementById('ct-file-list');
        list.innerHTML = Array.from(this.files).map((f, i) => `<div class="file-item"><div class="file-info"><span>📄</span><span>${f.name}</span></div></div>`).join('');
      });

      document.getElementById('create-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const fd = new FormData();
          fd.append('title', document.getElementById('ct-title').value);
          fd.append('description', document.getElementById('ct-desc').value);
          fd.append('department_id', document.getElementById('ct-dept').value);
          fd.append('priority', document.getElementById('ct-pri').value);
          fd.append('assigned_to', document.getElementById('ct-assign').value);
          fd.append('due_date', document.getElementById('ct-due').value);
          const files = document.getElementById('ct-files').files;
          for (let i = 0; i < files.length; i++) fd.append('files[]', files[i]);

          await api('tasks.php?action=create', { method: 'POST', body: fd });
          toast('Tarea creada');
          closeModal();
          navigate('tasks');
        } catch (err) { toast(err.message, 'error'); }
      });
    };

  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Departments
// ==========================================
const DEPT_COLORS = ['#2d3561', '#38b2ac', '#e53e3e', '#ecc94b', '#4299e1', '#9f7aea', '#ed8936', '#48bb78'];

async function renderDepartments(wrapper) {
  try {
    const [dRes, uRes] = await Promise.all([api('departments.php?action=list'), api('users.php?action=list')]);
    const depts = dRes.departments;
    const users = uRes.users;
    const isAdmin = state.user?.role === 'admin';

    wrapper.innerHTML = `
      <div class="page-header"><h2>Departamentos</h2>${isAdmin ? '<div><button class="btn btn-primary" onclick="openCreateDept()">＋ Nuevo Departamento</button></div>' : ''}</div>
      ${depts.length === 0 ? '<div class="card"><div class="empty-state"><div class="empty-state-icon">🏢</div><h3>Sin departamentos</h3><p>Crea tu primer departamento.</p></div></div>' :
        '<div class="dept-grid">' + depts.map(d => {
          const comp = d.task_count > 0 ? Math.round((d.completed_count / d.task_count) * 100) : 0;
          return `<div class="dept-card" onclick="openDeptDetail(${d.id})">
            <div class="dept-card-accent" style="background:${d.color}"></div>
            <div class="dept-card-body">
              <h3 class="dept-card-name">${d.name}</h3>
              <p class="dept-card-desc">${d.description || 'Sin descripción'}</p>
              <div style="margin-bottom:12px"><div class="flex-between" style="font-size:12px;margin-bottom:4px"><span style="color:var(--gray-500)">Progreso</span><span style="font-weight:600;color:var(--primary-800)">${comp}%</span></div>
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${comp}%;background:linear-gradient(90deg,${d.color},var(--success-400))"></div></div></div>
              <div class="dept-card-stats">
                <div><span class="dept-stat-value">${d.task_count || 0}</span><br><span class="dept-stat-label">Tareas</span></div>
                <div><span class="dept-stat-value">${d.member_count || 0}</span><br><span class="dept-stat-label">Miembros</span></div>
                <div><span class="dept-stat-value">${d.completed_count || 0}</span><br><span class="dept-stat-label">Hechas</span></div>
              </div>
            </div>
          </div>`;
        }).join('') + '</div>'}
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window._allUsers = users;

    window.openCreateDept = function () {
      let selectedColor = '#2d3561';
      showModal(`
        <div class="modal-header"><h2>Nuevo Departamento</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
        <form id="create-dept-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="cd-name" required placeholder="Nombre del departamento"></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input" id="cd-desc" placeholder="Describe el departamento..."></textarea></div>
            <div class="form-group"><label class="form-label">Color</label><div class="color-picker" id="cd-colors">${DEPT_COLORS.map(c => `<div class="color-swatch ${c === '#2d3561' ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`).join('')}</div></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear</button></div>
        </form>
      `);

      document.querySelectorAll('.color-swatch').forEach(el => {
        el.addEventListener('click', () => {
          document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          el.classList.add('selected');
          selectedColor = el.dataset.color;
        });
      });

      document.getElementById('create-dept-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('departments.php?action=create', {
            method: 'POST', body: JSON.stringify({
              name: document.getElementById('cd-name').value,
              description: document.getElementById('cd-desc').value,
              color: selectedColor
            })
          });
          toast('Departamento creado');
          closeModal();
          navigate('departments');
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.openDeptDetail = async function (id) {
      try {
        const data = await api(`departments.php?action=get&id=${id}`);
        const d = data.department;
        const members = data.members;
        const nonMembers = (window._allUsers || []).filter(u => !members.find(m => m.id == u.id));

        showModal(`
          <div class="modal-header"><div style="display:flex;align-items:center;gap:12px"><div style="width:16px;height:16px;border-radius:4px;background:${d.color}"></div><h2>${d.name}</h2></div><button class="modal-close" onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            ${d.description ? `<p style="font-size:14px;color:var(--gray-600);margin-bottom:20px">${d.description}</p>` : ''}
            <div style="margin-bottom:20px"><h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--primary-800)">Miembros (${members.length})</h3>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${members.map(m => `<div class="member-row"><div style="display:flex;align-items:center;gap:10px"><div class="topbar-avatar" style="width:32px;height:32px;font-size:12px">${initials(m.name)}</div><div><div style="font-size:14px;font-weight:500">${m.name}</div><div style="font-size:12px;color:var(--gray-500)">${m.email}</div></div><span class="badge badge-${m.role}">${m.role}</span></div>
                ${isAdmin ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger-500)" onclick="removeDeptMember(${d.id},${m.id})">✕</button>` : ''}</div>`).join('')}
              </div>
            </div>
            ${isAdmin && nonMembers.length > 0 ? `<div><h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--primary-800)">Agregar miembro</h3>
              <div style="display:flex;flex-direction:column;gap:6px">${nonMembers.map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:var(--radius-md);border:1px solid var(--gray-200)"><div style="display:flex;align-items:center;gap:10px"><div class="topbar-avatar" style="width:28px;height:28px;font-size:11px">${initials(u.name)}</div><span style="font-size:14px">${u.name}</span></div><button class="btn btn-sm btn-success" onclick="addDeptMember(${d.id},${u.id})">＋ Agregar</button></div>`).join('')}</div></div>` : ''}
          </div>
          <div class="modal-footer">
            ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteDept(${d.id})">🗑 Eliminar</button>` : ''}
            <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
          </div>
        `, 'modal-lg');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.addDeptMember = async function (deptId, userId) {
      try { await api(`departments.php?action=add_member&id=${deptId}`, { method: 'POST', body: JSON.stringify({ userId }) }); toast('Miembro agregado'); closeModal(); openDeptDetail(deptId); } catch (err) { toast(err.message, 'error'); }
    };
    window.removeDeptMember = async function (deptId, userId) {
      try { await api(`departments.php?action=remove_member&id=${deptId}&user_id=${userId}`, { method: 'DELETE' }); toast('Miembro eliminado'); closeModal(); openDeptDetail(deptId); } catch (err) { toast(err.message, 'error'); }
    };
    window.deleteDept = async function (id) {
      if (!confirm('¿Eliminar departamento y todas sus tareas?')) return;
      try { await api(`departments.php?action=delete&id=${id}`, { method: 'DELETE' }); toast('Eliminado'); closeModal(); navigate('departments'); } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Users
// ==========================================
async function renderUsers(wrapper) {
  try {
    const data = await api('users.php?action=list');
    const users = data.users;
    const isAdmin = state.user?.role === 'admin';

    wrapper.innerHTML = `
      <div class="page-header">
        <h2>Usuarios</h2>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="font-size:14px;color:var(--gray-500)">${users.length} usuario${users.length !== 1 ? 's' : ''}</div>
          ${isAdmin ? `<button class="btn btn-primary" onclick="openCreateUser()">＋ Nuevo Usuario</button>` : ''}
        </div>
      </div>
      <div class="card"><div class="card-body" style="padding:0;overflow:auto">
        <table class="data-table"><thead><tr><th>Usuario</th><th>Grupo / Rol</th><th>Departamentos</th><th>Registro</th><th>Acciones</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td><div class="user-cell"><div class="topbar-avatar" style="width:36px;height:36px;font-size:13px">${initials(u.name)}</div><div><div style="font-weight:600;color:var(--primary-800)">${u.name}</div><div style="font-size:12px;color:var(--gray-500)">${u.email}</div></div></div></td>
          <td>
            <div style="margin-bottom:4px"><span class="badge badge-${u.role}">${u.role}</span></div>
            <div style="font-size:12px;color:var(--gray-600);text-transform:capitalize">${(u.user_group || 'Otros eventos').replace('_', ' ')}</div>
          </td>
          <td style="font-size:13px;color:var(--gray-600)">${u.departments || '—'}</td>
          <td style="font-size:13px;color:var(--gray-500)">${formatDate(u.created_at)}</td>
          <td><div style="display:flex;gap:6px">
            ${(isAdmin || state.user.id == u.id) ? `<button class="btn btn-sm btn-outline" onclick="editUser(${u.id},'${u.name.replace(/'/g, "\\'")}','${u.email}')">✏️ Editar</button>` : ''}
            ${isAdmin && u.id != state.user.id ? `<button class="btn btn-sm ${u.role === 'admin' ? 'btn-outline' : 'btn-success'}" onclick="toggleRole(${u.id},'${u.role === 'admin' ? 'member' : 'admin'}')">${u.role === 'admin' ? '↓ Miembro' : '↑ Admin'}</button>` : ''}
            ${isAdmin && u.id != state.user.id ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger-500);padding:0 8px" onclick="deleteSystemUser(${u.id})" title="Eliminar usuario">🗑</button>` : ''}
          </div></td>
        </tr>`).join('')}</tbody></table>
      </div></div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
    window.deleteSystemUser = async function (id) {
      if (!confirm('¿Estás seguro de que deseas eliminar permanentemente a este usuario? Esta acción no se puede deshacer.')) return;
      try {
        await api(`users.php?action=delete&id=${id}`, { method: 'DELETE' });
        toast('Usuario eliminado exitosamente');
        renderUsers(document.createElement('div')).then(() => { navigate('users'); });
      } catch (err) { toast(err.message, 'error'); }
    };

    window.openCreateUser = function () {
      showModal(`
        <div class="modal-header"><h2>Crear Nuevo Usuario</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
        <form id="create-user-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre Completo *</label><input class="form-input" id="cu-name" required></div>
            <div class="form-group"><label class="form-label">Correo electrónico *</label><input class="form-input" id="cu-email" type="email" required></div>
            <div class="form-group"><label class="form-label">Contraseña *</label><input class="form-input" id="cu-pass" type="password" required minlength="6"></div>
            <div class="form-group"><label class="form-label">Grupo del Usuario</label>
              <select class="form-select" id="cu-group">
                <option value="emergencias">Emergencias</option>
                <option value="actividades">Actividades</option>
                <option value="otros_eventos" selected>Otros eventos</option>
                <option value="soporte_oficina">Soporte de oficina</option>
                <option value="superintendencia">Superintendencia (Es Admin)</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Rol inicial</label>
              <select class="form-select" id="cu-role">
                <option value="member" selected>Miembro normal</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear Usuario</button></div>
        </form>
      `);

      document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('users.php?action=create', {
            method: 'POST', body: JSON.stringify({
              name: document.getElementById('cu-name').value,
              email: document.getElementById('cu-email').value,
              password: document.getElementById('cu-pass').value,
              role: document.getElementById('cu-role').value
            })
          });
          toast('Usuario creado exitosamente');
          closeModal();
          navigate('dashboard'); // trigger reload quickly
          setTimeout(() => navigate('users'), 100);
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.editUser = function (id, name, email) {
      showModal(`
        <div class="modal-header"><h2>Editar Usuario</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
        <form id="edit-user-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="eu-name" value="${name}" required></div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="eu-email" type="email" value="${email}" required></div>
            <div class="form-group"><label class="form-label">Nueva contraseña (vacío = sin cambiar)</label><input class="form-input" id="eu-pass" type="password" placeholder="••••••••" minlength="6"></div>
            <div class="form-group"><label class="form-label">Cambiar Grupo</label>
              <select class="form-select" id="eu-group">
                <option value="">(No cambiar)</option>
                <option value="emergencias">Emergencias</option>
                <option value="actividades">Actividades</option>
                <option value="otros_eventos">Otros eventos</option>
                <option value="soporte_oficina">Soporte de oficina</option>
                <option value="superintendencia">Superintendencia (Automático Admin)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      `);
      document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const body = { name: document.getElementById('eu-name').value, email: document.getElementById('eu-email').value };
          const pass = document.getElementById('eu-pass').value;
          const grp = document.getElementById('eu-group').value;
          if (pass) body.password = pass;
          if (grp) body.user_group = grp;
          await api(`users.php?action=update&id=${id}`, { method: 'PUT', body: JSON.stringify(body) });
          toast('Actualizado'); closeModal(); navigate('users');
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.toggleRole = async function (id, role) {
      try { await api(`users.php?action=role&id=${id}`, { method: 'PUT', body: JSON.stringify({ role }) }); toast(`Rol: ${role}`); navigate('users'); }
      catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Calendar
// ==========================================
async function renderCalendar(wrapper) {
  try {
    const data = await api('calendar_events.php?action=list');
    const events = data.events;
    const isAdmin = state.user?.role === 'admin';
    const userGroup = state.user?.user_group || 'otros_eventos';

    // State for calendar dates
    if (!window.calDate) window.calDate = new Date();
    const currYear = window.calDate.getFullYear();
    const currMonth = window.calDate.getMonth();

    const firstDayIndex = new Date(currYear, currMonth, 1).getDay(); // 0 is Sunday
    const monthDays = new Date(currYear, currMonth + 1, 0).getDate();

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Group events by day (YYYY-MM-DD)
    const eventsByDate = {};
    events.forEach(e => {
      const dateStr = e.event_date.split(' ')[0];
      if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
      eventsByDate[dateStr].push(e);
    });

    const isToday = (d) => {
      const today = new Date();
      return today.getFullYear() === currYear && today.getMonth() === currMonth && today.getDate() === d;
    };

    let cellsHTML = '';
    for (let i = 0; i < firstDayIndex; i++) {
      cellsHTML += '<div class="calendar-day-empty"></div>';
    }
    for (let d = 1; d <= monthDays; d++) {
      const dateStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateStr] || [];

      const eventsHTML = dayEvents.map(e => `
            <div class="calendar-event-chip target-${e.target_group}" onclick="showEventDetails(${e.id})" title="${e.title}">
                ${e.event_date.split(' ')[1].slice(0, 5)} - ${e.title}
            </div>
        `).join('');

      cellsHTML += `
            <div class="calendar-day ${isToday(d) ? 'today' : ''}">
                <div style="display:flex;justify-content:flex-end"><span class="calendar-day-num">${d}</span></div>
                ${eventsHTML}
            </div>
        `;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingEvents = events.filter(e => e.event_date >= todayStr).sort((a, b) => a.event_date.localeCompare(b.event_date)).slice(0, 10);

    const upcomingHTML = upcomingEvents.length === 0 ? '<p style="color:var(--gray-500)">No hay eventos próximos para tu grupo.</p>' :
      '<div class="activity-list">' + upcomingEvents.map(e => `
          <div class="activity-item" style="padding:16px; border:1px solid var(--gray-200); border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;">
                <span class="badge badge-primary">📅 ${e.event_date.split(' ')[0]} ${e.event_date.split(' ')[1].slice(0, 5)}</span>
                <span class="badge badge-warning" style="text-transform:uppercase">${e.target_group.replace('_', ' ')}</span>
              </div>
              <h3 style="font-size:16px; margin:0; color:var(--gray-800)">${e.title}</h3>
              <p style="font-size:14px; color:var(--gray-600); margin:4px 0 0 0">${e.description || 'Sin descripción'}</p>
            </div>
          </div>
        `).join('') + '</div>';

    wrapper.innerHTML = `
      <div class="page-header">
        <h2>Calendario de Eventos</h2>
        <div><button class="btn btn-primary" onclick="openCreateEvent()">＋ Nuevo Evento</button></div>
      </div>
      
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-body" style="padding: 24px;">
            <div class="calendar-top-controls">
                <button class="calendar-nav-btn" onclick="calPrevMonth()">← Anterior</button>
                <div class="calendar-title">${monthNames[currMonth]} ${currYear}</div>
                <button class="calendar-nav-btn" onclick="calNextMonth()">Siguiente →</button>
            </div>
            
            <div class="calendar-grid">
                <div class="calendar-header-day">Dom</div>
                <div class="calendar-header-day">Lun</div>
                <div class="calendar-header-day">Mar</div>
                <div class="calendar-header-day">Mié</div>
                <div class="calendar-header-day">Jue</div>
                <div class="calendar-header-day">Vie</div>
                <div class="calendar-header-day">Sáb</div>
                ${cellsHTML}
            </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Próximos Eventos</h3></div>
        <div class="card-body">
            ${upcomingHTML}
        </div>
      </div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window.calPrevMonth = () => { window.calDate.setMonth(window.calDate.getMonth() - 1); renderCalendar(wrapper); };
    window.calNextMonth = () => { window.calDate.setMonth(window.calDate.getMonth() + 1); renderCalendar(wrapper); };

    window._calEventsObj = events;

    window.showEventDetails = function (id) {
      const e = window._calEventsObj.find(x => x.id === id);
      if (!e) return;
      const canDelete = isAdmin || e.created_by == state.user.id;

      showModal(`
            <div class="modal-header"><h2>Detalles del Evento</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
            <div class="modal-body">
                <div style="margin-bottom:16px">
                    <span class="badge badge-primary">📅 ${e.event_date}</span>
                    <span class="badge badge-warning" style="text-transform:uppercase">${e.target_group.replace('_', ' ')}</span>
                </div>
                <h3 style="margin:0 0 8px 0; color:var(--primary-800)">${e.title}</h3>
                <p style="color:var(--gray-700); line-height:1.5">${e.description || 'Sin descripción detallada.'}</p>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:space-between">
                ${canDelete ? `<button class="btn btn-outline" style="color:var(--danger-500); border-color:var(--danger-300)" onclick="deleteEvent(${e.id})">🗑 Eliminar Evento</button>` : '<div></div>'}
                <button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button>
            </div>
        `);
    };

    window.openCreateEvent = function () {
      showModal(`
        <div class="modal-header"><h2>Nuevo Evento del Calendario</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
        <form id="create-event-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Título del Evento *</label><input class="form-input" id="ce-title" required></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input" id="ce-desc"></textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Fecha y Hora *</label><input class="form-input" type="datetime-local" id="ce-date" required></div>
              ${isAdmin ? `
              <div class="form-group"><label class="form-label">Dirigido a (Grupo) *</label>
                <select class="form-select" id="ce-group">
                  <option value="todos">Para Todos (General)</option>
                  <option value="emergencias">Emergencias</option>
                  <option value="actividades">Actividades</option>
                  <option value="otros_eventos">Otros eventos</option>
                  <option value="soporte_oficina">Soporte de oficina</option>
                  <option value="superintendencia">Superintendencia</option>
                </select>
              </div>` : `
              <div class="form-group"><label class="form-label">Dirigido a (Grupo) *</label>
                <input class="form-input" id="ce-group" value="${userGroup}" disabled style="background:var(--gray-100); text-transform:capitalize">
              </div>
              `}
            </div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear Evento</button></div>
        </form>
      `);
      document.getElementById('create-event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('calendar_events.php?action=create', {
            method: 'POST', body: JSON.stringify({
              title: document.getElementById('ce-title').value,
              description: document.getElementById('ce-desc').value,
              event_date: document.getElementById('ce-date').value,
              target_group: document.getElementById('ce-group').value
            })
          });
          toast('Evento creado');
          closeModal();
          renderCalendar(document.createElement('div')).then(() => { navigate('calendar'); });
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.deleteEvent = async function (id) {
      if (!confirm('¿Estás seguro de eliminar este evento?')) return;
      try {
        await api(`calendar_events.php?action=delete&id=${id}`, { method: 'DELETE' });
        toast('Evento eliminado');
        closeModal();
        renderCalendar(document.createElement('div')).then(() => { navigate('calendar'); });
      } catch (err) { toast(err.message, 'error'); }
    }
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Settings
// ==========================================
async function renderSettings(wrapper, params) {
  try {
    const calRes = await api('calendar.php?action=status');
    const connected = calRes.connected;

    if (params.calendar === 'connected') toast('Google Calendar conectado');
    if (params.calendar === 'error') toast('Error al conectar', 'error');

    wrapper.innerHTML = `
      <div class="page-header"><h2>Configuración</h2></div>
      <div class="settings-card card"><div class="card-header"><h3>👤 Perfil</h3></div><div class="card-body">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="topbar-avatar" style="width:60px;height:60px;font-size:22px">${initials(state.user?.name)}</div>
          <div><div style="font-size:18px;font-weight:600;color:var(--primary-800)">${state.user?.name}</div><div style="font-size:14px;color:var(--gray-500)">${state.user?.email}</div><span class="badge badge-${state.user?.role}" style="margin-top:4px">${state.user?.role}</span></div>
        </div>
      </div></div>
      <div class="settings-card card"><div class="card-header"><h3>📅 Google Calendar</h3></div><div class="card-body">
        <p style="font-size:14px;color:var(--gray-600);margin-bottom:16px">Conecta tu cuenta para sincronizar tareas con tu calendario.</p>
        <div class="google-cal-status ${connected ? 'connected' : 'disconnected'}"><span class="status-dot ${connected ? 'green' : 'gray'}"></span><span style="font-size:14px;font-weight:500">${connected ? 'Conectado' : 'No conectado'}</span></div>
        ${connected ? '<button class="btn btn-outline" onclick="disconnectCal()">Desconectar</button>' : '<button class="btn btn-primary" onclick="connectCal()">🔗 Conectar Google Calendar</button>'}
      </div></div>
      <div class="settings-card card"><div class="card-header"><h3>ℹ️ Acerca de</h3></div><div class="card-body">
        ${[['Sistema', 'ICCP - Gestión de Tareas'], ['Versión', '1.0.0'], ['Frontend', 'HTML + CSS + JavaScript'], ['Backend', 'PHP + MySQL']].map(([l, v]) => `<div class="info-row"><span class="info-label">${l}</span><span class="info-value">${v}</span></div>`).join('')}
      </div></div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window.connectCal = async function () {
      try { const d = await api('calendar.php?action=auth-url'); window.location.href = d.authUrl; } catch (err) { toast(err.message, 'error'); }
    };
    window.disconnectCal = async function () {
      if (!confirm('¿Desconectar?')) return;
      try { await api('calendar.php?action=disconnect', { method: 'POST' }); toast('Desconectado'); navigate('settings'); } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box">${err.message}</div>`;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Modal
// ==========================================
function showModal(content, extraClass = '') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  const modal = document.createElement('div');
  modal.className = `modal ${extraClass}`;
  modal.innerHTML = content;
  modal.onclick = (e) => e.stopPropagation();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

// ==========================================
// Init
// ==========================================
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
