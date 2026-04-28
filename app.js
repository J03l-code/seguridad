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

  try {
    const res = await fetch(`${API}/${endpoint}`, { ...options, headers });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Error de Servidor: ' + text.substring(0, 150));
    }
    if (res.status === 401 && !endpoint.includes('action=login')) { logout(); return; }
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  }
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
    <button onclick="this.parentElement.remove()"style="color:var(--gray-500);font-size:16px">✕</button>`;
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

function getSLAStatus(dateStr, status) {
  if (!dateStr || status === 'done') return '';
  const due = new Date(dateStr).getTime();
  const now = new Date().getTime();
  if (due < now) return 'overdue';
  if (due - now <= 86400000) return 'warning'; // 24 hours
  return '';
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
const groupLabels = { emergencias: 'Emergencias', actividades: 'Actividades', otros_eventos: 'Otros Eventos', soporte_oficina: 'Soporte Oficina', superintendencia: 'Superintendencia' };

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
    if (state.token) {
      if (window.fetchNotifications) window.fetchNotifications();
      if (!window.notifInterval) window.notifInterval = setInterval(() => { if (window.fetchNotifications) window.fetchNotifications(); }, 30000);
    }
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
    case 'mytasks': renderMyTasks(wrapper); break;
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
    { page: 'mytasks', icon: '📋', label: 'Mis Tareas' },
    { page: 'tasks', icon: '✅', label: 'Tareas' },
    { page: 'departments', icon: '🏢', label: 'Departamentos' },
    { page: 'users', icon: '👥', label: 'Usuarios' },
    { page: 'calendar', icon: '📅', label: 'Calendario' },
    { page: 'settings', icon: '⚙️', label: 'Configuración' }
  ];

  container.innerHTML = `
    <div class="sidebar-overlay"id="sidebar-overlay"></div>
    <aside class="sidebar"id="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">IC</div>
        <h1>ICCP</h1>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-title">Menú Principal</div>
        ${navItems.map(n => `
          <div class="sidebar-link"data-page="${n.page}"onclick="closeMobile();navigate('${n.page}')">
            <span class="link-icon">${n.icon}</span>
            <span>${n.label}</span>
          </div>
        `).join('')}
      </nav>
      <div class="sidebar-toggle"onclick="toggleSidebar()">←</div>
    </aside>
    <div class="main-area"id="main-area">
      <header class="topbar"id="topbar">
        <div class="topbar-left">
          <div class="mobile-toggle"onclick="toggleMobile()">☰</div>
          <h1 class="topbar-title"id="page-title">Dashboard</h1>
        </div>
        <div class="topbar-right">
          <div class="notifications-container"style="position:relative; margin-right: 12px; cursor: pointer;"onclick="toggleNotifications()">
            <span style="font-size: 22px;">🔔</span>
            <span id="notif-badge"class="badge"style="background:var(--danger-500); color:white; position:absolute; top:-4px; right:-6px; font-size:10px; padding:2px 5px; display:none;">0</span>
            <div id="notif-dropdown"class="user-dropdown"style="display:none; width: 300px; right: -10px; padding: 0;">
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--gray-200); font-weight: 600; font-size: 14px; background: var(--gray-50); display:flex; justify-content:space-between">
                    Notificaciones
                    <span style="font-size: 12px; color: var(--primary-600); cursor: pointer;"onclick="event.stopPropagation();markNotifsRead()">Marcar leídas</span>
                </div>
                <div id="notif-list"style="max-height: 300px; overflow-y: auto;">
                    <div style="padding: 16px; text-align: center; color: var(--gray-500); font-size: 13px;">Sin notificaciones nuevas</div>
                </div>
            </div>
          </div>
          <div class="topbar-user"onclick="toggleUserMenu()">
            <div class="topbar-avatar">${initials(state.user?.name)}</div>
            <div class="topbar-user-info">
              <span class="topbar-user-name">${state.user?.name || ''}</span>
              <span class="topbar-user-role">${state.user?.role || ''}</span>
            </div>
            <div class="user-dropdown"id="user-dropdown"style="display:none">
              <div class="user-dropdown-info">
                <div class="name">${state.user?.name}</div>
                <div class="email">${state.user?.email}</div>
              </div>
              <button onclick="event.stopPropagation();navigate('settings');closeUserMenu()">⚙️ Configuración</button>
              <button class="logout-btn"onclick="event.stopPropagation();logout()">🚪 Cerrar sesión</button>
            </div>
          </div>
        </div>
      </header>
      <main class="page-content"id="page-content"></main>
    </div>
  `;

  document.getElementById('sidebar-overlay').addEventListener('click', closeMobile);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-user')) closeUserMenu();
    if (!e.target.closest('.notifications-container')) {
      const nd = document.getElementById('notif-dropdown');
      if (nd) nd.style.display = 'none';
    }
  });

  // Global window functions for notifications
  window.fetchNotifications = async function () {
    try {
      const data = await api('notifications.php?action=list');
      const count = parseInt(data.unread);
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.style.display = count > 0 ? 'inline-block' : 'none';
        badge.textContent = count > 99 ? '99+' : count;
      }

      let html = '';
      if (data.notifications && data.notifications.length > 0) {
        html = data.notifications.map(n => `
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; ${n.is_read ? 'opacity: 0.6;' : 'background: rgba(66, 153, 225, 0.05);'}"onclick="handleNotificationClick(${n.id}, \`${n.message.replace(/`/g, '')}\`)">
                    <div style="font-size: 13px; color: var(--gray-800); line-height: 1.4;">${n.message}</div>
                    <div style="font-size: 11px; color: var(--gray-500); margin-top: 4px;">${timeAgo(n.created_at)}</div>
                </div>
            `).join('');
      } else {
        html = '<div style="padding: 16px; text-align: center; color: var(--gray-500); font-size: 13px;">Sin notificaciones</div>';
      }
      const notifList = document.getElementById('notif-list');
      if (notifList) notifList.innerHTML = html;
    } catch (err) { console.error(err); }
  };

  window.toggleNotifications = function () {
    const drop = document.getElementById('notif-dropdown');
    if (!drop) return;
    const isVisible = drop.style.display === 'block';
    if (!isVisible) {
      document.getElementById('user-dropdown').style.display = 'none';
      drop.style.display = 'block';
    } else {
      drop.style.display = 'none';
    }
  };

  window.markNotifsRead = async function () {
    try {
      await api('notifications.php?action=mark_read', { method: 'POST' });
      window.fetchNotifications();
    } catch (err) { toast('Error', 'error'); }
  };
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
        <div class="login-brand"><div class="login-brand-icon">IC</div><h1>Panel de Gestión</h1></div>
        <p class="login-tagline">Departamento De Seguridad HC3</p>
      </div>
      <div class="login-right">
        <div class="login-form-wrapper">
          <div class="login-form-header">
            <h2>Bienvenido</h2>
            <p>Ingresa tus credenciales para continuar</p>
          </div>
          <div id="login-error"></div>
          <form id="login-form">
            <div class="form-group"><label class="form-label">Correo electrónico</label><input class="form-input"id="login-email"type="email"placeholder="correo@ejemplo.com"required></div>
            <div class="form-group"><label class="form-label">Contraseña</label><input class="form-input"id="login-pass"type="password"placeholder="••••••••"required minlength="6"></div>
            <button type="submit"class="btn btn-primary login-submit"id="login-btn">Iniciar Sesión</button>
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
      return `<circle cx="50"cy="50"r="45"fill="none"stroke="${d.color}"stroke-width="8"
        stroke-dasharray="${da}"stroke-dashoffset="${doff}"stroke-linecap="round"
        transform="rotate(-90 50 50)"style="transition:stroke-dasharray .8s ease"/>`;
    }).join('');

    wrapper.innerHTML = `
      <div class="page-header"style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2>Dashboard Gerencial</h2>
        ${state.user?.role === 'admin' ? `<button class="btn btn-primary"onclick="exportTasksCSV()"style="display:flex;align-items:center;gap:6px">📥 Descargar Reporte (CSV)</button>` : ''}
      </div>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-icon blue">📋</div><div class="metric-info"><h4>Total Tareas</h4><div class="metric-value">${m.totalTasks}</div><span class="metric-sub positive">↑ ${m.weeklyCreated} esta semana</span></div></div>
        <div class="metric-card"><div class="metric-icon green">✅</div><div class="metric-info"><h4>Completadas</h4><div class="metric-value">${s.done}</div><span class="metric-sub positive">${rate}% tasa de éxito</span></div></div>
        <div class="metric-card"><div class="metric-icon orange">⏳</div><div class="metric-info"><h4>En Progreso</h4><div class="metric-value">${s.in_progress}</div></div></div>
        <div class="metric-card"><div class="metric-icon red">⚠️</div><div class="metric-info"><h4>Vencidas</h4><div class="metric-value">${m.overdueTasks}</div>${m.overdueTasks > 0 ? '<span class="metric-sub negative">Requiere atención</span>' : ''}</div></div>
      </div>
      <div class="grid-auto"style="margin-bottom:28px">
        <div class="card"><div class="card-header"><h3>Estado de Tareas</h3></div>
          <div class="donut-chart">
            <svg viewBox="0 0 100 100"style="width:140px;height:140px;flex-shrink:0">
              <circle cx="50"cy="50"r="45"fill="none"stroke="var(--gray-200)"stroke-width="8"/>
              ${circles}
              <text x="50"y="46"text-anchor="middle"font-size="16"font-weight="700"fill="var(--primary-800)">${rate}%</text>
              <text x="50"y="58"text-anchor="middle"font-size="7"fill="var(--gray-500)">completado</text>
            </svg>
            <div class="donut-legend">
              ${donutData.map(d => `<div class="legend-item"><span class="legend-dot"style="background:${d.color}"></span><span>${d.label}</span><span class="legend-value">${d.val}</span></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card"><div class="card-header"><h3>Tareas por Prioridad</h3></div>
          <div class="chart-container"><div class="bar-chart">
            ${[{ k: 'low', l: 'Baja', c: 'primary', v: p.low }, { k: 'medium', l: 'Media', c: 'success', v: p.medium }, { k: 'high', l: 'Alta', c: 'warning', v: p.high }, { k: 'urgent', l: 'Urgente', c: 'danger', v: p.urgent }]
        .map(i => `<div class="bar-item"><div class="bar-value">${i.v}</div><div class="bar ${i.c}"style="height:${(i.v / maxP) * 100}%"></div><div class="bar-label">${i.l}</div></div>`).join('')}
          </div></div>
        </div>
      </div>
      <div class="grid-auto">
        <div class="card"><div class="card-header"><h3>Actividad Reciente</h3></div>
          <div class="card-body"style="max-height:400px;overflow-y:auto">
            ${activity.length === 0 ? '<div class="empty-state"style="padding:30px 0"><div class="empty-state-icon">📭</div><h3>Sin actividad aún</h3></div>' :
        '<div class="activity-list">' + activity.map(a => `
                <div class="activity-item">
                  <div class="activity-avatar">${initials(a.user_name)}</div>
                  <div><div class="activity-text"><strong>${a.user_name || ''}</strong> ${a.details || a.action}${a.task_title ? ` en <strong>${a.task_title}</strong>` : ''}</div>
                  <div class="activity-time">${activityIcon[a.action] || '📌'} ${timeAgo(a.created_at)}</div></div>
                </div>`).join('') + '</div>'}
          </div>
        </div>
        <div class="card"><div class="card-header"><h3>Resumen General</h3></div>
          <div class="card-body"style="display:flex;flex-direction:column;gap:16px">
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
          c.tasks.map(t => {
            const sla = getSLAStatus(t.due_date, t.status);
            return `
                <div class="task-card ${sla ? 'task-card-' + sla : ''}"onclick="openTaskDetail(${t.id})">
                  <div class="task-card-header">
                    <span class="task-card-title">${t.title}</span>
                    <span class="badge badge-${t.priority}">${priorityLabel[t.priority]}</span>
                  </div>
                  ${t.description ? `<p class="task-card-desc">${t.description}</p>` : ''}
                  <div class="task-card-footer">
                    <div class="task-card-meta">
                      ${t.due_date ? `<span class="${isOverdue(t.due_date) && t.status !== 'done' ? 'task-due-overdue' : ''}">📅 ${formatDate(t.due_date)}</span>` : ''}
                      ${t.attachment_count > 0 ? `<span>📎 ${t.attachment_count}</span>` : ''}
                      ${t.target_group ? `<span class="dept-tag"style="background:#2d3561">${groupLabels[t.target_group] || t.target_group}</span>` : ''}
                    </div>
                  </div>
                  ${c.next && (canManage || (t.target_group === myGroup)) ? `<div class="task-actions"><button class="btn btn-sm btn-outline"onclick="event.stopPropagation();changeTaskStatus(${t.id},'${c.next}')">${c.btnLabel}</button></div>` : ''}
                </div>
              `;
          }).join('')}
          </div>
        </div>
      `).join('')}</div>`;
    }

    const myGroup = users.find(u => u.id == state.user.id)?.user_group;
    const canManage = true; // All users can manage tasks

    wrapper.innerHTML = `
      <div class="page-header"><h2>Gestión de Tareas</h2><div><button class="btn btn-primary"onclick="openCreateTask()">＋ Nueva Tarea</button></div></div>
      <div class="filters-bar">
        <select class="form-select"id="filter-dept"onchange="filterTasks()"><option value="">Todos los departamentos</option><option value="emergencias">Emergencias</option><option value="actividades">Actividades</option><option value="otros_eventos">Otros Eventos</option><option value="soporte_oficina">Soporte de Oficina</option><option value="superintendencia">Superintendencia</option></select>
        <select class="form-select"id="filter-priority"onchange="filterTasks()"><option value="">Todas las prioridades</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select>
      </div>
      <div id="kanban-container">${buildBoard(tasks)}</div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    // Global functions for tasks
    window._tasks = tasks;
    window._depts = [];
    window._users = users;

    window.filterTasks = function () {
      const dept = document.getElementById('filter-dept').value;
      const pri = document.getElementById('filter-priority').value;
      let filtered = window._tasks;
      if (dept) filtered = filtered.filter(t => t.target_group === dept);
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
          <div class="modal-header"><h2>${t.title}</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            <div style="display:flex;gap:8px;margin-bottom:20px">
              <span class="badge badge-${t.status.replace('_', '-')}">${statusLabel[t.status]}</span>
              <span class="badge badge-${t.priority}">${priorityLabel[t.priority]}</span>
            </div>
            ${t.description ? `<div style="margin-bottom:20px"><label class="form-label">Descripción</label><p style="font-size:14px;color:var(--gray-700);line-height:1.6">${t.description}</p></div>` : ''}
            <div class="grid-2"style="margin-bottom:20px">
              <div><label class="form-label">Departamento</label><p style="font-size:14px">${t.target_group ? (groupLabels[t.target_group] || t.target_group) : '—'}</p></div>
              <div><label class="form-label">Sector</label><p style="font-size:14px">Tarea de Equipo</p></div>
              <div><label class="form-label">Creado por</label><p style="font-size:14px">${t.creator_name}</p></div>
              <div><label class="form-label">Fecha límite</label><p style="font-size:14px;${isOverdue(t.due_date) && t.status !== 'done' ? 'color:var(--danger-500)' : ''}">${formatDate(t.due_date)}</p></div>
            </div>
            ${(canManage || (t.target_group === myGroup)) ? `
            <div style="margin-bottom:20px"><label class="form-label">Cambiar estado</label><div style="display:flex;gap:8px">
              ${['todo', 'in_progress', 'done'].map(s => `<button class="btn btn-sm ${t.status === s ? 'btn-primary' : 'btn-outline'}"onclick="changeTaskStatusModal(${t.id},'${s}')">${statusLabel[s]}</button>`).join('')}
            </div></div>` : `<div style="margin-bottom:20px;font-size:13px;color:var(--gray-500)">No tienes permisos departamentales para cambiar estatus.</div>`}
            ${att.length > 0 ? `<div style="margin-bottom:20px"><label class="form-label">Archivos (${att.length})</label><div class="file-list">${att.map(a => `<div class="file-item"><div class="file-info"><span>📄</span><a href="api/uploads/${a.filename}"target="_blank"style="color:var(--primary-600);font-weight:500">${a.original_name}</a></div><span class="file-size">${(a.file_size / 1024).toFixed(1)} KB</span></div>`).join('')}</div></div>` : ''}
            ${act.length > 0 ? `<div><label class="form-label">Historial y Comentarios</label><div class="activity-list">${act.map(a => `<div class="activity-item"><div class="activity-avatar"style="width:28px;height:28px;font-size:10px">${initials(a.user_name)}</div><div style="flex:1"><div class="activity-text"style="font-size:13px"><strong>${a.user_name}</strong> ${a.action === 'commented' ? `<div style="margin-top:4px;padding:8px;background:var(--gray-50);border-radius:6px;border:1px solid var(--gray-200);color:var(--gray-800)">${a.details}</div>` : a.details}</div><div class="activity-time">${formatDate(a.created_at)}</div></div></div>`).join('')}</div></div>` : ''}
            
            <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--gray-200)">
              <label class="form-label">Añadir Comentario</label>
              <div style="display:flex;gap:8px">
                <textarea id="task-comment-input"class="form-input"placeholder="Escribe un comentario o actualización..."style="height:40px; min-height:40px; resize:vertical;"></textarea>
                <button class="btn btn-primary"style="white-space:nowrap"onclick="addComment(${t.id})">Enviar</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-sm btn-outline"onclick="syncCalendar(${t.id})">📅 Sincronizar</button>
            <button class="btn btn-sm btn-danger"onclick="deleteTask(${t.id})">🗑 Eliminar</button>
            <button class="btn btn-outline"onclick="closeModal()">Cerrar</button>
          </div>
        `, 'modal-lg');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.changeTaskStatusModal = async function (id, status) {
      document.getElementById('task-comment-input').disabled = true; // small hack to prevent UI glitches during loading
      await changeTaskStatus(id, status);
      openTaskDetail(id); // Reload modal
    };

    window.addComment = async function (id) {
      const input = document.getElementById('task-comment-input');
      const comment = input.value.trim();
      if (!comment) return;
      input.disabled = true;
      try {
        await api('tasks.php?action=comment&id=' + id, {
          method: 'POST',
          body: JSON.stringify({ comment })
        });
        toast('Comentario añadido');
        openTaskDetail(id); // Reload modal
        renderTasks(document.createElement('div')).then(() => { }); // Background refresh
      } catch (err) {
        toast(err.message, 'error');
        input.disabled = false;
      }
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
        <div class="modal-header"><h2>Nueva Tarea</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="create-task-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Título *</label><input class="form-input"id="ct-title"placeholder="Nombre de la tarea"required></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input"id="ct-desc"placeholder="Describe la tarea..."></textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Departamento *</label><select class="form-select"id="ct-target_group"required><option value="">Seleccionar...</option><option value="emergencias">Emergencias</option><option value="actividades">Actividades</option><option value="otros_eventos">Otros Eventos</option><option value="soporte_oficina">Soporte de Oficina</option><option value="superintendencia">Superintendencia</option></select></div>
              <div class="form-group"><label class="form-label">Prioridad</label><select class="form-select"id="ct-pri"><option value="low">Baja</option><option value="medium"selected>Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Fecha límite</label><input class="form-input"id="ct-due"type="datetime-local"></div>
              <div></div>
            </div>
            <div class="form-group"><label class="form-label">Archivos</label>
              <div class="dropzone"onclick="document.getElementById('ct-files').click()"><div class="dropzone-icon">📂</div><div class="dropzone-text">Haz clic para seleccionar</div><div class="dropzone-hint">PDF, Word, Excel, imágenes (máx. 10MB)</div></div>
              <input type="file"id="ct-files"multiple style="display:none">
              <div id="ct-file-list"class="file-list"></div>
            </div>
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Crear Tarea</button></div>
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
          fd.append('target_group', document.getElementById('ct-target_group').value);
          fd.append('priority', document.getElementById('ct-pri').value);
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
    const [dRes, uRes, orgRes, extRes] = await Promise.all([api('departments.php?action=list'), api('users.php?action=list'), api('users.php?action=org_chart'), api('external_members.php?action=list')]);
    const depts = dRes.departments;
    const users = uRes.users;
    const orgUsers = [...orgRes.users, ...(extRes?.members || [])];
    window.currentOrgUsers = orgUsers;
    const isAdmin = state.user?.role === 'admin';
    state.orgViewMode = state.orgViewMode || 'tree';

    const groups = { superintendencia: [], actividades: [], emergencias: [], soporte_oficina: [], otros_eventos: [] };
    depts.forEach(d => groups[d.id] = []);

    orgUsers.forEach(u => {
      const uGroups = (u.user_group || 'otros_eventos').split(',').map(g => g.trim());
      uGroups.forEach(g => {
        if (!groups[g]) groups[g] = [];
        groups[g].push(u);
      });
    });

    const BASE_COLORS = {
      emergencias: '#ef4444',     // danger-500
      actividades: '#10b981',     // success-500
      soporte_oficina: '#3b82f6', // primary-500
      otros_eventos: '#f59e0b'    // warning-500
    };

    const renderOrgNode = (gName, key, grpUsers, color = null, isSub = false) => {
      const mappedUsers = grpUsers.map(u => {
        // Per-group hierarchy: check hierarchy_map[key] first, fallback to global hierarchy_level
        let hMap = {};
        try { hMap = u.hierarchy_map ? JSON.parse(u.hierarchy_map) : {}; } catch (e) { }
        const effectiveHierarchy = hMap[key] || u.hierarchy_level || 'auxiliar';

        const isJefe = effectiveHierarchy === 'superintendente';
        const isVol = effectiveHierarchy === 'voluntario_clave';

        let roleText = effectiveHierarchy.replace('_', ' ').toUpperCase();
        if (u.role === 'admin' && !hMap[key]) roleText = 'ADMIN';

        if (u.job_title) roleText += ` (${u.job_title})`;

        const hoverCursor = isAdmin ? 'cursor:pointer; transition: transform 0.2s;' : '';
        const onClickAction = isAdmin ? `onclick="openEditOrgUser('${u.id}', ${u.is_external ? 'true' : 'false'})"` : '';
        const avatarContent = u.avatar ? `<img src="api/uploads/${u.avatar}" alt="" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : initials(u.name);

        return `
          <div class="org-member org-interactive-card" ${onClickAction} style="${hoverCursor} ${isJefe ? 'border-left:3px solid var(--primary-500);background:var(--primary-50)' : isVol ? 'border-left:3px solid var(--success-500);background:var(--success-50)' : ''}" onmouseover="if(${isAdmin}) this.style.transform='translateY(-2px)';" onmouseout="if(${isAdmin}) this.style.transform='translateY(0)';">
              <div class="avatar"style="${isJefe ? 'background:var(--primary-600)' : isVol ? 'background:var(--success-600)' : ''}; overflow:hidden;">${avatarContent}</div>
              <div class="info">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                      <span class="name"style="${isJefe ? 'font-weight:700;color:var(--primary-900)' : isVol ? 'font-weight:600;color:var(--success-900)' : ''}; margin-bottom:2px;">
                          ${u.name}
                      </span>
                  </div>
                  <span class="role">${roleText}</span>
                  ${u.meeting_day ? `<div style="font-size:10px; color:var(--primary-600); margin-top:4px; font-weight:600;"><span style="margin-right:2px">📅</span> ${u.meeting_day}</div>` : ''}
                  ${u.phone ? `<div style="font-size:10px; color:var(--gray-600); margin-top:2px; font-weight:500;"><span style="margin-right:2px">📞</span> ${u.phone}</div>` : ''}
                  ${u.jwpub_email ? `<div style="font-size:10px; color:var(--primary-600); margin-top:2px; word-break:break-all;"><span style="margin-right:2px">📘</span> ${u.jwpub_email}</div>` : ''}
              </div>
          </div>
        `;
      }).join('') || '<div class="org-member empty">Sin miembros</div>';

      const nodeClass = !isSub && BASE_COLORS[key] ? `target-${key}` : '';
      const inlineBox = isSub && color ? `border-top: 4px solid ${color}; background: ${color}15;` : '';
      const inlineHeader = isSub && color ? `background: ${color}35; color: #1e293b;` : '';

      return `
        <div class="org-node ${nodeClass}"style="${inlineBox}">
            <h3 style="${inlineHeader}">${gName}</h3>
            <div class="org-members">${mappedUsers}</div>
        </div>
      `;
    };

    const renderTree = (deptId, deptName, forceColor = null, isSub = false) => {
      const color = forceColor || BASE_COLORS[deptId] || '#64748b';
      const children = depts.filter(d => d.parent_id == deptId);
      
      let topUsers = [];
      let bottomUsers = [];
      const grpUsers = groups[deptId] || [];

      if (!isSub) {
          grpUsers.forEach(u => {
            let hMap = {};
            try { hMap = u.hierarchy_map ? JSON.parse(u.hierarchy_map) : {}; } catch (e) { }
            const effectiveHierarchy = hMap[deptId] || u.hierarchy_level || 'auxiliar';
            const isSup = effectiveHierarchy === 'superintendente';
            const isAux = effectiveHierarchy === 'auxiliar';
            
            if (isSup || isAux) {
               topUsers.push(u);
            } else {
               bottomUsers.push(u);
            }
          });
      } else {
          topUsers = grpUsers;
      }

      const html = renderOrgNode(deptName, deptId, topUsers, color, isSub);
      
      if (children.length === 0 && bottomUsers.length === 0) return html;

      let subBoxes = '';
      if (deptId === 'emergencias') {
          const soporteBox = renderTree('soporte_oficina', 'Soporte de Oficina', BASE_COLORS['soporte_oficina'], true);
          const cBoxes = children.map(c => renderTree(c.id, c.name, color, true)).join('');
          
          if (bottomUsers.length > 0) {
             const emergenciasBox = renderOrgNode(deptName, deptId, bottomUsers, color, true);
             subBoxes = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                    ${emergenciasBox}
                    <div style="width:1px; height:20px; border-left:1px solid #ccc;"></div>
                    ${soporteBox}
                </div>
                ${cBoxes}
             `;
          } else {
             subBoxes = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                    ${soporteBox}
                </div>
                ${cBoxes}
             `;
          }
      } else {
          subBoxes = children.map(c => renderTree(c.id, c.name, color, true)).join('');
          if (bottomUsers.length > 0) {
             subBoxes = renderOrgNode(deptName, deptId, bottomUsers, color, true) + subBoxes;
          }
      }

      return `
        <div style="display:flex; flex-direction:column; align-items:center;">
          ${html}
          <div class="org-lines"></div>
          <div class="org-level-2-wrapper"style="margin-top:-20px; width:100%">
             <div class="org-horizontal-line"style="width: 80%; left: 10%"></div>
             <div class="org-level-2"style="gap:20px; align-items:flex-start">
                 ${subBoxes}
             </div>
          </div>
        </div>
      `;
    };

    const generateTableView = () => {
       return `
          <div class="org-table-container" id="org-table-view" style="display:${state.orgViewMode === 'table' ? 'block' : 'none'}; overflow-x: auto; padding: 20px;">
              <table class="data-table" style="width: 100%;">
                 <thead>
                    <tr>
                       <th>Avatar</th>
                       <th>Nombre</th>
                       <th>Asignación / Puesto</th>
                       <th>Jerarquía</th>
                       <th>Dpto.</th>
                       <th>Teléfono</th>
                       <th>Correo / JWPub</th>
                    </tr>
                 </thead>
                 <tbody id="org-table-body">
                    ${orgUsers.map(u => {
                        let roleText = (u.hierarchy_level||'').replace('_', ' ').toUpperCase();
                        const isJefe = u.hierarchy_level === 'superintendente';
                        const isVol = u.hierarchy_level === 'voluntario_clave';
                        const badgeStyle = isJefe ? 'background:var(--danger-100);color:var(--danger-700)' : isVol ? 'background:var(--success-100);color:var(--success-700)' : 'background:var(--primary-100);color:var(--primary-700)';

                        const avatarContent = u.avatar ? `<img src="api/uploads/${u.avatar}" alt="" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">` : `<span style="color:var(--gray-500)">${initials(u.name)}</span>`;
                        const hoverCursor = isAdmin ? 'cursor:pointer; transition:background 0.2s;' : '';
                        const onClickAction = isAdmin ? `onclick="openEditOrgUser('${u.id}', ${u.is_external ? 'true' : 'false'})"` : '';
                        
                        return `<tr class="table-member-row" ${onClickAction} style="${hoverCursor}" onmouseover="if(${isAdmin}) this.style.background='var(--primary-50)';" onmouseout="if(${isAdmin}) this.style.background='transparent';">
                            <td><div style="width:30px; height:30px; border-radius:50%; background:var(--gray-200); display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:12px; font-weight:bold;">${avatarContent}</div></td>
                            <td><strong class="searchable-name">${u.name}</strong></td>
                            <td class="searchable-title">${u.job_title || '-'}</td>
                            <td><span style="font-size:11px; padding:2px 6px; border-radius:10px; font-weight:bold; ${badgeStyle}">${roleText}</span></td>
                            <td>${(u.user_group||'').replace(/_/g, ' ').toUpperCase()}</td>
                            <td>${u.phone || '-'}</td>
                            <td>
                                ${u.jwpub_email ? `<div style="font-size:11px; color:var(--primary-600)">📘 ${u.jwpub_email}</div>` : '-'}
                            </td>
                        </tr>`;
                    }).join('')}
                 </tbody>
              </table>
          </div>
       `;
    };

    const orgChartHTML = `
      <div class="card"style="margin-bottom: 30px; background:var(--gray-50); overflow-x:auto;">
        <div class="card-header"style="background:#fff; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                <h3 style="margin:0">Organigrama de Personal</h3>
                <input type="text" id="org-search-input" class="form-input" placeholder="🔍 Buscar nombre o cargo..." style="width:250px; padding:6px 12px;" onkeyup="filterOrg(this.value)">
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="display:flex; background:var(--gray-200); padding:3px; border-radius:var(--radius-md);">
                    <button id="btn-view-tree" class="btn btn-sm" style="background:${state.orgViewMode==='tree'?'#fff':'transparent'}; color:${state.orgViewMode==='tree'?'var(--primary-700)':'var(--gray-600)'}; box-shadow:${state.orgViewMode==='tree'?'0 1px 3px rgba(0,0,0,0.1)':'none'}" onclick="toggleOrgView('tree')">🌳 Árbol</button>
                    <button id="btn-view-table" class="btn btn-sm" style="background:${state.orgViewMode==='table'?'#fff':'transparent'}; color:${state.orgViewMode==='table'?'var(--primary-700)':'var(--gray-600)'}; box-shadow:${state.orgViewMode==='table'?'0 1px 3px rgba(0,0,0,0.1)':'none'}" onclick="toggleOrgView('table')">📋 Tabla</button>
                </div>
                <button class="btn btn-sm" style="background:var(--primary-100); color:var(--primary-700);" onclick="exportOrgChart()" title="Exportar a Imagen PNG">🖼️ Exportar</button>
                ${isAdmin ? `<button class="btn btn-sm btn-primary" onclick="openCreateExtMember()">➕ Miembro Externo</button>` : ''}
            </div>
        </div>
        <div class="card-body"style="min-width: 800px; padding:0;">
            <div id="org-tree-view" class="org-chart-container" style="display:${state.orgViewMode === 'tree' ? 'flex' : 'none'}; padding:20px;">
                <div class="org-level">
                    ${renderOrgNode('Superintendencia', 'superintendencia', groups.superintendencia)}
                </div>
                <div class="org-lines"></div>
                <div class="org-level-2-wrapper">
                    <div class="org-horizontal-line"></div>
                    <div class="org-level-2"style="align-items:flex-start">
                        ${renderTree('emergencias', 'Emergencias', null, false)}
                        ${renderTree('actividades', 'Actividades', null, false)}
                        ${renderTree('otros_eventos', 'Otros Eventos', null, false)}
                        ${depts.filter(d => !d.parent_id || d.parent_id === 'null' || d.parent_id === '').map(d => renderTree(d.id, d.name, d.color, false)).join('')}
                    </div>
                </div>
            </div>
            ${generateTableView()}
        </div>
      </div>
    `;

    wrapper.innerHTML = `
      <div class="page-header"><h2>Departamentos y Organigrama</h2>${isAdmin ? '<div><button class="btn btn-primary"onclick="openCreateDept()">＋ Nuevo Dpto. Organizacional</button></div>' : ''}</div>
      
      ${orgChartHTML}
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window._allUsers = users;

    window.openCreateDept = function () {
      let selectedColor = '#2d3561';
      showModal(`
        <div class="modal-header"><h2>Nuevo Departamento</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="create-dept-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input"id="cd-name"required placeholder="Nombre del departamento"></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input"id="cd-desc"placeholder="Describe el departamento..."></textarea></div>
            <div class="form-group"><label class="form-label">Color</label><div class="color-picker"id="cd-colors">${DEPT_COLORS.map(c => `<div class="color-swatch ${c === '#2d3561' ? 'selected' : ''}"style="background:${c}"data-color="${c}"></div>`).join('')}</div></div>
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Crear</button></div>
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
          <div class="modal-header"><div style="display:flex;align-items:center;gap:12px"><div style="width:16px;height:16px;border-radius:4px;background:${d.color}"></div><h2>${d.name}</h2>${isAdmin ? `<button class="btn btn-sm btn-outline"style="margin-left:10px"onclick="openEditDept(${d.id})">✏️ Editar Dept.</button>` : ''}</div><button class="modal-close"onclick="closeModal()">✕</button></div>
          <div class="modal-body">
            ${d.description ? `<p style="font-size:14px;color:var(--gray-600);margin-bottom:20px">${d.description}</p>` : ''}
            <div style="margin-bottom:20px"><h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--primary-800)">Miembros (${members.length})</h3>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${members.map(m => `<div class="member-row"><div style="display:flex;align-items:center;gap:10px"><div class="topbar-avatar"style="width:32px;height:32px;font-size:12px">${initials(m.name)}</div><div><div style="font-size:14px;font-weight:500">${m.name}</div><div style="font-size:12px;color:var(--gray-500)">${m.email}</div></div><span class="badge badge-${m.role}">${m.role}</span></div>
                ${isAdmin ? `<button class="btn btn-sm btn-ghost"style="color:var(--danger-500)"onclick="removeDeptMember(${d.id},${m.id})">✕</button>` : ''}</div>`).join('')}
              </div>
            </div>
            ${isAdmin && nonMembers.length > 0 ? `<div><h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--primary-800)">Agregar miembro</h3>
              <div style="display:flex;flex-direction:column;gap:6px">${nonMembers.map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:var(--radius-md);border:1px solid var(--gray-200)"><div style="display:flex;align-items:center;gap:10px"><div class="topbar-avatar"style="width:28px;height:28px;font-size:11px">${initials(u.name)}</div><span style="font-size:14px">${u.name}</span></div><button class="btn btn-sm btn-success"onclick="addDeptMember(${d.id},${u.id})">＋ Agregar</button></div>`).join('')}</div></div>` : ''}
          </div>
          <div class="modal-footer">
            ${isAdmin ? `<button class="btn btn-sm btn-danger"onclick="deleteDept(${d.id})">🗑 Eliminar</button>` : ''}
            <button class="btn btn-outline"onclick="closeModal()">Cerrar</button>
          </div>
        `, 'modal-lg');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.openEditDept = async function (id) {
      try {
        const data = await api(`departments.php?action=get&id=${id}`);
        const d = data.department;
        let selectedColor = d.color || '#2d3561';

        showModal(`
             <div class="modal-header"><h2>Editar Departamento</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
             <form id="edit-dept-form">
               <div class="modal-body">
                 <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input"id="ed-name"required value="${d.name.replace(/"/g, '&quot;')}"></div>
                 <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input"id="ed-desc">${d.description || ''}</textarea></div>
                 
                 <div class="form-group"><label class="form-label">Subdepartamento de (Opcional)</label>
                  <select class="form-select"id="ed-parent">
                    <option value="">Ninguno</option>
                    <optgroup label="Grupos Base">
                      <option value="emergencias"${d.parent_id === 'emergencias' ? 'selected' : ''}>Emergencias (Base)</option>
                      <option value="actividades"${d.parent_id === 'actividades' ? 'selected' : ''}>Actividades (Base)</option>
                      <option value="otros_eventos"${d.parent_id === 'otros_eventos' ? 'selected' : ''}>Otros eventos (Base)</option>
                      <option value="soporte_oficina"${d.parent_id === 'soporte_oficina' ? 'selected' : ''}>Soporte de oficina (Base)</option>
                      <option value="superintendencia"${d.parent_id === 'superintendencia' ? 'selected' : ''}>Superintendencia (Base)</option>
                    </optgroup>
                    <optgroup label="Otros Departamentos">
                      ${depts.filter(dept => dept.id != id).map(dept => `<option value="${dept.id}"${d.parent_id == dept.id ? 'selected' : ''}>${dept.name}</option>`).join('')}
                    </optgroup>
                  </select>
                 </div>

                 <div class="form-group"><label class="form-label">Color</label><div class="color-picker"id="ed-colors">${DEPT_COLORS.map(c => `<div class="color-swatch ${c === selectedColor ? 'selected' : ''}"style="background:${c}"data-color="${c}"></div>`).join('')}</div></div>
               </div>
               <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Guardar Cambios</button></div>
             </form>
           `);

        document.querySelectorAll('#ed-colors .color-swatch').forEach(el => {
          el.addEventListener('click', () => {
            document.querySelectorAll('#ed-colors .color-swatch').forEach(s => s.classList.remove('selected'));
            el.classList.add('selected');
            selectedColor = el.dataset.color;
          });
        });

        document.getElementById('edit-dept-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await api(`departments.php?action=update&id=${id}`, {
              method: 'PUT', body: JSON.stringify({
                name: document.getElementById('ed-name').value,
                description: document.getElementById('ed-desc').value,
                color: selectedColor,
                parent_id: document.getElementById('ed-parent').value || null
              })
            });
            toast('Departamento actualizado');
            closeModal();
            navigate('departments');
          } catch (err) { toast(err.message, 'error'); }
        });
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
    const deptData = await api('departments.php?action=list');
    window._depts = deptData.departments || [];
    const users = data.users;
    const isAdmin = state.user?.role === 'admin';

    wrapper.innerHTML = `
      <div class="page-header">
        <h2>Usuarios</h2>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="font-size:14px;color:var(--gray-500)">${users.length} usuario${users.length !== 1 ? 's' : ''}</div>
          ${isAdmin ? `<button class="btn btn-primary"onclick="openCreateUser()">＋ Nuevo Usuario</button>` : ''}
        </div>
      </div>
      <div class="card"><div class="card-body"style="padding:0;overflow:auto">
        <table class="data-table"><thead><tr><th>Usuario</th><th>Grupo / Rol</th><th>Departamentos</th><th>Registro</th><th>Acciones</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td><div class="user-cell"><div class="topbar-avatar"style="width:36px;height:36px;font-size:13px">${initials(u.name)}</div><div><div style="font-weight:600;color:var(--primary-800)">${u.name}</div><div style="font-size:12px;color:var(--gray-500)">${u.email}</div></div></div></td>
          <td>
            <div style="margin-bottom:4px"><span class="badge badge-${u.role}">${u.role}</span></div>
            <div style="font-size:12px;color:var(--gray-600);text-transform:capitalize">${(u.user_group || 'Otros eventos').replace(/_/g, ' ')}</div>
          </td>
          <td style="font-size:13px;color:var(--gray-600)">${u.departments || '—'}</td>
          <td style="font-size:13px;color:var(--gray-500)">${formatDate(u.created_at)}</td>
          <td><div style="display:flex;gap:6px">
            ${(isAdmin || state.user.id == u.id) ? `<button class="btn btn-sm btn-outline"onclick='editUser(${u.id},${JSON.stringify(u.name)},${JSON.stringify(u.email)},${JSON.stringify(u.hierarchy_level || "auxiliar")},${JSON.stringify(u.job_title || "")},${JSON.stringify(u.user_group || "otros_eventos")},${JSON.stringify(u.hierarchy_map || "{}")})'>✏️ Editar</button>` : ''}
            ${isAdmin && u.id != state.user.id ? `<button class="btn btn-sm ${u.role === 'admin' ? 'btn-outline' : 'btn-success'}"onclick="toggleRole(${u.id},'${u.role === 'admin' ? 'member' : 'admin'}')">${u.role === 'admin' ? '↓ Miembro' : '↑ Admin'}</button>` : ''}
            ${isAdmin && u.id != state.user.id ? `<button class="btn btn-sm btn-ghost"style="color:var(--danger-500);padding:0 8px"onclick="deleteSystemUser(${u.id})"title="Eliminar usuario">🗑</button>` : ''}
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
        <div class="modal-header"><h2>Crear Nuevo Usuario</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="create-user-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre Completo *</label><input class="form-input"id="cu-name"required></div>
            <div class="form-group"><label class="form-label">Correo electrónico *</label><input class="form-input"id="cu-email"type="email"required></div>
            <div class="form-group"><label class="form-label">Contraseña *</label><input class="form-input"id="cu-pass"type="password"required minlength="6"></div>
            <div class="form-group"><label class="form-label">Departamento (Cmd/Ctrl + click para varios)</label>
              <select class="form-select"id="cu-group"multiple size="7"style="height:auto">
                <option value="emergencias">Emergencias (Base)</option>
                <option value="actividades">Actividades (Base)</option>
                <option value="otros_eventos">Otros eventos (Base)</option>
                <option value="soporte_oficina">Soporte de oficina (Base)</option>
                <option value="superintendencia">Superintendencia (Base)</option>
                ${(window._depts || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Nombre del Rol (Ej: Capitán, Otros Eventos)</label><input class="form-input"id="cu-job"placeholder="Rol descriptivo que aparecerá en el organigrama"></div>
            <div class="form-group"><label class="form-label">Rol inicial</label>
              <select class="form-select"id="cu-role">
                <option value="member"selected>Miembro normal</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Cargo (Organigrama)</label>
              <select class="form-select"id="cu-hierarchy">
                <option value="auxiliar"selected>Auxiliar</option>
                <option value="voluntario_clave">Voluntario Clave</option>
                <option value="superintendente">Superintendente</option>
              </select>
            </div>
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Crear Usuario</button></div>
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
              role: document.getElementById('cu-role').value,
              hierarchy_level: document.getElementById('cu-hierarchy').value,
              job_title: document.getElementById('cu-job').value,
              user_group: Array.from(document.getElementById('cu-group').selectedOptions).map(o => o.value).join(',')
            })
          });
          toast('Usuario creado exitosamente');
          closeModal();
          navigate('dashboard'); // trigger reload quickly
          setTimeout(() => navigate('users'), 100);
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.editUser = function (id, name, email, currentHierarchy, jobTitle, userGroup, hierarchyMapStr) {
      let hMap = {};
      try { hMap = JSON.parse(hierarchyMapStr || '{}'); } catch (e) { }
      const userGroups = (userGroup || 'otros_eventos').split(',').map(g => g.trim());
      const groupLabels = { emergencias: 'Emergencias', actividades: 'Actividades', otros_eventos: 'Otros Eventos', soporte_oficina: 'Soporte de Oficina', superintendencia: 'Superintendencia' };

      const perGroupHTML = userGroups.map(g => {
        const effectiveH = hMap[g] || currentHierarchy || 'auxiliar';
        const label = groupLabels[g] || g.replace(/_/g, ' ');
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="min-width:140px;font-size:13px;color:var(--gray-700)">${label}:</span>
            <select class="form-select eu-grp-hierarchy"data-group="${g}"style="flex:1;padding:4px 8px;font-size:13px">
              <option value="auxiliar"${effectiveH === 'auxiliar' ? 'selected' : ''}>Auxiliar</option>
              <option value="voluntario_clave"${effectiveH === 'voluntario_clave' ? 'selected' : ''}>Voluntario Clave</option>
              <option value="superintendente"${effectiveH === 'superintendente' ? 'selected' : ''}>Superintendente</option>
            </select>
          </div>`;
      }).join('');

      showModal(`
        <div class="modal-header"><h2>Editar Usuario</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="edit-user-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nombre</label><input class="form-input"id="eu-name"value="${name}"required></div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-input"id="eu-email"type="email"value="${email}"required></div>
            <div class="form-group"><label class="form-label">Nueva contraseña (vacío = sin cambiar)</label><input class="form-input"id="eu-pass"type="password"placeholder="••••••••"minlength="6"></div>
            <div class="form-group"><label class="form-label">Cambiar Grupo (Cmd/Ctrl + click)</label>
              <select class="form-select"id="eu-group"multiple size="7"style="height:auto">
                <option value="emergencias">Emergencias (Base)</option>
                <option value="actividades">Actividades (Base)</option>
                <option value="otros_eventos">Otros eventos (Base)</option>
                <option value="soporte_oficina">Soporte de oficina (Base)</option>
                <option value="superintendencia">Superintendencia (Base)</option>
                ${(window._depts || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
              </select>
              <small style="color:var(--gray-500);font-size:11px">Deja sin seleccionar si no quieres cambiar los grupos actuales.</small>
            </div>
            <div class="form-group"><label class="form-label">Nombre del Rol (Ej: Capitán, Otros Eventos)</label><input class="form-input"id="eu-job"value="${jobTitle === 'null' || !jobTitle ? '' : jobTitle}"placeholder="Rol descriptivo que aparecerá en el organigrama"></div>
            <div class="form-group"><label class="form-label">Cargo por Departamento</label>
              <div id="eu-hierarchy-per-group"style="border:1px solid var(--gray-300);border-radius:6px;padding:10px;background:#fafafa">
                ${perGroupHTML}
              </div>
              <small style="color:var(--gray-500);font-size:11px">Asigna el cargo de este usuario en cada departamento al que pertenece.</small>
            </div>
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Guardar</button></div>
        </form>
      `);
      document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const body = { name: document.getElementById('eu-name').value, email: document.getElementById('eu-email').value };
          const pass = document.getElementById('eu-pass').value;
          if (pass) body.password = pass;
          body.job_title = document.getElementById('eu-job').value;
          const selGrp = document.getElementById('eu-group');
          if (selGrp && selGrp.selectedOptions.length > 0) {
            body.user_group = Array.from(selGrp.selectedOptions).map(o => o.value).join(',');
          }
          // Build hierarchy_map from per-group selectors
          const newHMap = {};
          document.querySelectorAll('.eu-grp-hierarchy').forEach(sel => {
            newHMap[sel.dataset.group] = sel.value;
          });
          body.hierarchy_map = newHMap;
          // Set global hierarchy_level to the "highest"role across groups
          const levels = Object.values(newHMap);
          if (levels.includes('superintendente')) body.hierarchy_level = 'superintendente';
          else if (levels.includes('voluntario_clave')) body.hierarchy_level = 'voluntario_clave';
          else body.hierarchy_level = 'auxiliar';
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
// My Tasks (Personal Agenda)
// ==========================================
async function renderMyTasks(wrapper) {
  try {
    const [tasksData, eventsData] = await Promise.all([
      api('tasks.php?action=list'),
      api('calendar_events.php?action=list')
    ]);
    const allTasks = tasksData.tasks || [];
    const allEvents = eventsData.events || [];
    const userId = state.user?.id;
    const userGroups = (state.user?.user_group || 'otros_eventos').split(',').map(g => g.trim());

    // Filter tasks that belong to the user's groups, or assigned to 'todos', or created by user
    const myTasks = allTasks.filter(t => {
      const tGroups = (t.target_group || 'otros_eventos').split(',').map(g => g.trim());
      if (tGroups.includes('todos')) return true;
      if (t.created_by == userId) return true;
      return tGroups.some(g => userGroups.includes(g));
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const completed = myTasks.filter(t => t.status === 'done');
    const pending = myTasks.filter(t => t.status !== 'done');
    const overdue = pending.filter(t => t.due_date && t.due_date.split(' ')[0] < todayStr);
    const totalCount = myTasks.length || 1;
    const progressPct = Math.round((completed.length / totalCount) * 100);

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityLabel = { high: '🔴 Alta', medium: '🟡 Media', low: '🟢 Baja' };
    const statusLabel = { todo: 'Por hacer', in_progress: 'En progreso', done: 'Completada' };
    const statusBadge = { todo: 'badge-outline', in_progress: 'badge-warning', done: 'badge-success' };

    const sortedPending = [...pending].sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    // Expand recurring events for "Mis Reuniones" checking
    const expandedEvents = [];
    allEvents.forEach(e => {
      expandedEvents.push(e);
      if (e.recurrence) {
        let count = 0;
        let rType = '';
        if (e.recurrence === 'daily_14') { count = 14; rType = 'daily'; }
        else if (e.recurrence === 'weekly_12') { count = 12; rType = 'weekly'; }
        else if (e.recurrence === 'monthly_6') { count = 6; rType = 'monthly'; }

        if (count > 0) {
          const baseDate = new Date(e.event_date.replace(' ', 'T'));
          for (let i = 1; i < count; i++) {
            const nextDate = new Date(baseDate);
            if (rType === 'daily') nextDate.setDate(nextDate.getDate() + i);
            else if (rType === 'weekly') nextDate.setDate(nextDate.getDate() + (i * 7));
            else if (rType === 'monthly') nextDate.setMonth(nextDate.getMonth() + i);

            const y = nextDate.getFullYear();
            const m = String(nextDate.getMonth() + 1).padStart(2, '0');
            const d = String(nextDate.getDate()).padStart(2, '0');
            const hh = String(nextDate.getHours()).padStart(2, '0');
            const mm = String(nextDate.getMinutes()).padStart(2, '0');
            const ss = String(nextDate.getSeconds()).padStart(2, '0');

            expandedEvents.push({
              ...e,
              id: e.id + '_rec_' + i,
              event_date: `${y}-${m}-${d} ${hh}:${mm}:${ss}`
            });
          }
        }
      }
    });

    const isAdmin = state.user?.role === 'admin';
    const isSupportUser = isAdmin || userGroups.some(g => g.includes('soporte_oficina'));
    const supportEvents = isSupportUser
      ? expandedEvents.filter(e => e.assigned_to && e.event_date.split(' ')[0] >= todayStr)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
      : [];

    const assignedContent = supportEvents.length === 0
      ? '<div style="text-align:center;padding:24px;color:var(--gray-500);font-size:14px">🛌 No hay asignaciones pendientes para el equipo de soporte.</div>'
      : `<div class="activity-list">
          ${supportEvents.map(e => `
            <div class="activity-item" style="padding:16px; border:1px solid var(--gray-200); border-left:4px solid var(--primary-500); border-radius:8px; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:8px">
                  <div style="display:flex; gap:6px">
                    <span class="badge badge-primary" style="font-size:12px; font-weight:600">📅 ${e.event_date.split(' ')[0]} ${e.event_date.split(' ')[1].slice(0, 5)}</span>
                    <span class="badge badge-outline" style="text-transform:uppercase">DEPARTAMENTO: ${e.target_group ? e.target_group.replace(/_/g, ' ') : 'TODOS'}</span>
                  </div>
                  <span class="badge" style="background:var(--warning-100); color:var(--warning-800); border:1px solid var(--warning-300)">ASIGNADO A: ${e.assigned_name || 'Soporte General'}</span>
              </div>
              <h3 style="font-size:16px; margin:0 0 6px 0; color:var(--gray-800)">${e.title} ${e.recurrence ? '<span title="Evento recurrente" style="font-size:12px; margin-left:4px">🔄</span>' : ''}</h3>
              <p style="font-size:14px; color:var(--gray-600); margin:0 0 10px 0">${e.description || 'Sin descripción'}</p>
              <div style="font-size:13px; color:var(--gray-600); font-weight:600; padding-top:8px; border-top:1px dashed var(--gray-200)">
                Agendado por: <span style="color:var(--primary-600); text-transform:uppercase">${e.creator_name || 'ADMINISTRACIÓN'}</span>
              </div>
            </div>
          `).join('')}
        </div>`;

    const assignedHTML = !isSupportUser
      ? ''
      : `<div class="card" style="margin-bottom:24px; border-left:4px solid var(--primary-500); border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div class="card-header" style="background:var(--primary-50); border-bottom:1px solid var(--primary-100); text-align:center"><h3 style="color:var(--primary-700); font-weight:800; text-transform:uppercase; margin:0">📋 asignaciones de soporte de oficina en reuniones</h3></div>
          <div class="card-body">${assignedContent}</div>
        </div>`;

    const supportDelegatedTasks = isSupportUser
      ? allTasks.filter(t => t.creator_group && t.creator_group.includes('soporte_oficina'))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      : [];

    const delegatedHTML = !isSupportUser
      ? ''
      : '<div class="card" style="margin-bottom:24px; border-left:4px solid var(--info-500); border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);">' +
      '<div class="card-header" style="background:var(--info-50); border-bottom:1px solid var(--info-100); text-align:center">' +
      '<h3 style="color:var(--info-700); font-weight:800; text-transform:uppercase; margin:0">📋 Mis tareas asignadas (Registro de Departamentos)</h3>' +
      '</div>' +
      '<div class="card-body">' +
      (supportDelegatedTasks.length === 0
        ? '<div style="text-align:center;padding:24px;color:var(--gray-500);font-size:14px">📭 No hay tareas asignadas a otros departamentos.</div>'
        : '<div class="activity-list">' +
        supportDelegatedTasks.map(t => {
          const isOverdue = t.due_date && t.due_date.split(' ')[0] < todayStr;
          return '<div class="activity-item" style="padding:16px; border:1px solid ' + (isOverdue ? 'var(--danger-200)' : 'var(--gray-200)') + '; border-left:4px solid ' + (isOverdue ? 'var(--danger-500)' : 'var(--info-500)') + '; border-radius:8px; margin-bottom:12px; cursor:pointer;" onclick="openTaskDetail(\'' + t.id + '\')">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:8px">' +
            '<div style="display:flex; gap:6px">' +
            '<span class="badge ' + statusBadge[t.status] + '" style="font-size:12px; font-weight:600">' + statusLabel[t.status] + '</span>' +
            '<span class="badge badge-outline" style="text-transform:uppercase">DEPARTAMENTO ASIGNADO: ' + (t.target_group || '').replace(/_/g, ' ') + '</span>' +
            '</div>' +
            '</div>' +
            '<h3 style="font-size:16px; margin:0 0 6px 0; color:var(--gray-800)">' + t.title + '</h3>' +
            '<p style="font-size:14px; color:var(--gray-600); margin:0 0 10px 0">' + (t.description || 'Sin descripción') + '</p>' +
            '<div style="font-size:13px; color:var(--gray-600); font-weight:600; padding-top:8px; border-top:1px dashed var(--gray-200); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px">' +
            '<span>Fecha límite: <span style="color:' + (isOverdue ? 'var(--danger-600)' : 'var(--primary-600)') + '">' + (t.due_date ? t.due_date.split(' ')[0] : 'Sin fecha') + '</span></span>' +
            '<span>Asignada por: <span style="color:var(--primary-600); text-transform:uppercase">' + (t.creator_name || 'Desconocido') + '</span></span>' +
            '</div>' +
            '</div>';
        }).join('') +
        '</div>'
      ) +
      '</div>' +
      '</div>';

    const pendingHTML = sortedPending.length === 0
      ? '<div style="text-align:center;padding:32px;color:var(--gray-500)"><div style="font-size:48px;margin-bottom:12px">🎉</div><p>¡No tienes tareas pendientes!</p></div>'
      : sortedPending.map(t => {
        const isOverdue = t.due_date && t.due_date.split(' ')[0] < todayStr;
        return `
        <div class="activity-item"style="padding:14px 16px; border:1px solid ${isOverdue ? 'var(--danger-200)' : 'var(--gray-200)'}; border-left:4px solid ${isOverdue ? 'var(--danger-500)' : t.priority === 'high' ? 'var(--danger-400)' : t.priority === 'medium' ? 'var(--warning-400)' : 'var(--success-400)'}; border-radius:8px; margin-bottom:10px; cursor:pointer; background:${isOverdue ? 'var(--danger-50)' : '#fff'}; transition:transform .15s;"onclick="navigate('tasks')"onmouseover="this.style.transform='translateX(4px)'"onmouseout="this.style.transform=''">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1">
              <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                <span class="badge ${statusBadge[t.status]}"style="font-size:11px">${statusLabel[t.status]}</span>
                <span class="badge"style="font-size:11px">${priorityLabel[t.priority]}</span>
                ${isOverdue ? '<span class="badge badge-danger"style="font-size:11px">⚠️ VENCIDA</span>' : ''}
              </div>
              <h4 style="margin:0;font-size:15px;color:var(--gray-800)">${t.title}</h4>
              ${t.description ? `<p style="margin:4px 0 0;font-size:13px;color:var(--gray-500);max-width:500px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.description}</p>` : ''}
            </div>
            <div style="text-align:right;min-width:100px">
              ${t.due_date ? `<div style="font-size:12px;color:${isOverdue ? 'var(--danger-600)' : 'var(--gray-500)'};font-weight:${isOverdue ? '600' : '400'}">📅 ${t.due_date.split(' ')[0]}</div>` : '<div style="font-size:12px;color:var(--gray-400)">Sin fecha</div>'}
              <div style="font-size:11px;color:var(--gray-400);margin-top:2px;text-transform:capitalize">${(t.target_group || '').replace(/_/g, ' ')}</div>
            </div>
          </div>
        </div>`;
      }).join('');

    // Upcoming events (next 7 days)
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 14);
    const weekStr = weekFromNow.toISOString().split('T')[0];
    const upcomingEvents = allEvents.filter(e => {
      const d = e.event_date.split(' ')[0];
      return d >= todayStr && d <= weekStr;
    }).slice(0, 8);

    const eventsHTML = upcomingEvents.length === 0
      ? '<p style="color:var(--gray-500);text-align:center;padding:16px">No hay eventos próximos</p>'
      : upcomingEvents.map(e => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
          <div style="width:48px;height:48px;border-radius:10px;background:var(--primary-100);color:var(--primary-700);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">
            <span style="font-size:16px;line-height:1">${e.event_date.split(' ')[0].split('-')[2]}</span>
            <span style="font-size:9px;text-transform:uppercase">${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(e.event_date.split(' ')[0].split('-')[1]) - 1]}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;color:var(--gray-800);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title}</div>
            <div style="font-size:12px;color:var(--gray-500)">${e.event_date.split(' ')[1] ? e.event_date.split(' ')[1].slice(0, 5) : ''} · ${(e.target_group || 'General').replace(/_/g, ' ')}</div>
          </div>
        </div>
      `).join('');

    wrapper.innerHTML = `
      <div class="page-header">
        <h2>Mi Agenda Personal</h2>
        <span class="badge badge-primary"style="font-size:13px">👤 ${state.user?.name || 'Usuario'}</span>
      </div>

      <!-- Progress Stats -->
      <div class="stats-grid"style="margin-bottom:24px">
        <div class="card"style="text-align:center;padding:20px">
          <div style="font-size:32px;font-weight:800;color:var(--success-600)">${completed.length}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:4px">✅ Completadas</div>
        </div>
        <div class="card"style="text-align:center;padding:20px">
          <div style="font-size:32px;font-weight:800;color:var(--warning-600)">${pending.length}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:4px">⏳ Pendientes</div>
        </div>
        <div class="card"style="text-align:center;padding:20px">
          <div style="font-size:32px;font-weight:800;color:var(--danger-600)">${overdue.length}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:4px">🔴 Vencidas</div>
        </div>
        <div class="card"style="text-align:center;padding:20px">
          <div style="font-size:32px;font-weight:800;color:var(--primary-600)">${progressPct}%</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:4px">📈 Progreso</div>
          <div style="margin-top:8px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,var(--primary-500),var(--success-500));border-radius:3px;transition:width .6s ease"></div>
          </div>
        </div>
      </div>
      
      ${assignedHTML}
      ${delegatedHTML}

      <div style="display:grid;grid-template-columns:1fr 380px;gap:24px">
        <!-- Pending Tasks -->
        <div class="card">
          <div class="card-header"style="display:flex;justify-content:space-between;align-items:center">
            <h3>⏳ Tareas Pendientes (${pending.length})</h3>
            <button class="btn btn-sm btn-primary"onclick="navigate('tasks')">Ver todas →</button>
          </div>
          <div class="card-body"style="max-height:500px;overflow-y:auto">${pendingHTML}</div>
        </div>

        <!-- Upcoming Events -->
        <div class="card">
          <div class="card-header"><h3>📅 Próximos Eventos</h3></div>
          <div class="card-body"style="max-height:500px;overflow-y:auto">${eventsHTML}</div>
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
// Calendar
// ==========================================
async function renderCalendar(wrapper) {
  try {
    const [eventsData, tasksData] = await Promise.all([
      api('calendar_events.php?action=list'),
      api('tasks.php?action=list')
    ]);
    const events = eventsData.events;
    const allTasks = tasksData.tasks || [];
    const isAdmin = state.user?.role === 'admin';
    const userGroup = state.user?.user_group || 'otros_eventos';

    // Check Google Calendar link status
    let googleLinked = false;
    try {
      const gStatus = await api('google_auth.php?action=status');
      googleLinked = gStatus.linked;
    } catch (e) { }

    // State for calendar dates
    if (!window.calDate) window.calDate = new Date();
    const currYear = window.calDate.getFullYear();
    const currMonth = window.calDate.getMonth();

    const firstDayIndex = new Date(currYear, currMonth, 1).getDay(); // 0 is Sunday
    const monthDays = new Date(currYear, currMonth + 1, 0).getDate();

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Expand recurring events
    const expandedEvents = [];
    events.forEach(e => {
      expandedEvents.push(e);
      if (e.recurrence) {
        let count = 0;
        let rType = '';
        if (e.recurrence === 'daily_14') { count = 14; rType = 'daily'; }
        else if (e.recurrence === 'weekly_12') { count = 12; rType = 'weekly'; }
        else if (e.recurrence === 'monthly_6') { count = 6; rType = 'monthly'; }

        if (count > 0) {
          const baseDate = new Date(e.event_date.replace(' ', 'T'));
          for (let i = 1; i < count; i++) {
            const nextDate = new Date(baseDate);
            if (rType === 'daily') nextDate.setDate(nextDate.getDate() + i);
            else if (rType === 'weekly') nextDate.setDate(nextDate.getDate() + (i * 7));
            else if (rType === 'monthly') nextDate.setMonth(nextDate.getMonth() + i);

            const y = nextDate.getFullYear();
            const m = String(nextDate.getMonth() + 1).padStart(2, '0');
            const d = String(nextDate.getDate()).padStart(2, '0');
            const hh = String(nextDate.getHours()).padStart(2, '0');
            const mm = String(nextDate.getMinutes()).padStart(2, '0');
            const ss = String(nextDate.getSeconds()).padStart(2, '0');

            expandedEvents.push({
              ...e,
              id: e.id + '_rec_' + i,
              event_date: `${y}-${m}-${d} ${hh}:${mm}:${ss}`
            });
          }
        }
      }
    });

    // Group events by day (YYYY-MM-DD)
    const eventsByDate = {};
    expandedEvents.forEach(e => {
      const dateStr = e.event_date.split(' ')[0];
      if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
      eventsByDate[dateStr].push(e);
    });

    // Group tasks by due date
    const tasksByDate = {};
    allTasks.forEach(t => {
      if (!t.due_date || t.status === 'done') return;
      const dateStr = t.due_date.split(' ')[0];
      if (!tasksByDate[dateStr]) tasksByDate[dateStr] = [];
      tasksByDate[dateStr].push(t);
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
      const dayTasks = tasksByDate[dateStr] || [];

      const eventsHTML = dayEvents.map(e => {
        const primaryGroup = e.target_group ? e.target_group.split(',')[0] : 'todos';
        return `
            <div class="calendar-event-chip target-${primaryGroup}"onclick="showEventDetails(${e.id})"title="${e.title}">
                ${e.event_date.split(' ')[1].slice(0, 5)} - ${e.title}
            </div>
            `;
      }).join('');

      const tasksHTML = dayTasks.map(t => {
        const primaryGroup = t.target_group ? t.target_group.split(',')[0] : 'todos';
        return `<div class="calendar-task-dot target-${primaryGroup}"title="Vence tarea: ${t.title}"onclick="openTaskDetail(${t.id}); event.stopPropagation();"></div>`;
      }).join('');

      cellsHTML += `
            <div class="calendar-day ${isToday(d) ? 'today' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:16px;margin-bottom:4px">
                  <div style="display:flex;gap:3px;flex-wrap:wrap;max-width:70%">${tasksHTML}</div>
                  <span class="calendar-day-num">${d}</span>
                </div>
                ${eventsHTML}
            </div>
        `;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingEvents = expandedEvents.filter(e => e.event_date >= todayStr).map(e => ({ ...e, isTask: false }));
    const upcomingTasks = allTasks.filter(t => t.due_date && t.due_date >= todayStr && t.status !== 'done').map(t => ({ ...t, isTask: true }));

    const allUpcoming = [...upcomingEvents, ...upcomingTasks]
      .sort((a, b) => {
        const da = a.isTask ? a.due_date : a.event_date;
        const db = b.isTask ? b.due_date : b.event_date;
        return da.localeCompare(db);
      }).slice(0, 10);

    const upcomingHTML = allUpcoming.length === 0 ? '<p style="color:var(--gray-500)">No hay eventos ni tareas próximas.</p>' :
      '<div class="activity-list">' + allUpcoming.map(i => {
        if (i.isTask) {
          return `<div class="activity-item"style="padding:16px; border:1px solid var(--gray-200); border-left:4px solid var(--primary-500); border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:pointer;"onclick="openTaskDetail(${i.id})">
            <div>
              <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
                <span class="badge badge-outline">📝 Vence: ${i.due_date.split(' ')[0]}</span>
                <span class="badge badge-${i.priority}">${priorityLabel[i.priority]}</span>
                <span class="badge badge-warning"style="text-transform:uppercase">${groupLabels[i.target_group] || i.target_group}</span>
              </div>
              <h3 style="font-size:16px; margin:0; color:var(--gray-800)">${i.title}</h3>
            </div>
          </div>`;
        } else {
          const recurBadge = i.recurrence ? '<span title="Evento recurrente"style="margin-left:4px;font-size:12px">🔄</span>' : '';
          return `<div class="activity-item"style="padding:16px; border:1px solid var(--gray-200); border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="flex:1">
              <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
                <span class="badge badge-primary">📅 ${i.event_date.split(' ')[0]} ${i.event_date.split(' ')[1].slice(0, 5)}</span>
                <span class="badge badge-warning"style="text-transform:uppercase">${i.target_group ? i.target_group.replace(/_/g, ' ').split(',').join(' • ') : 'TODOS'}</span>
              </div>
              <h3 style="font-size:16px; margin:0; color:var(--gray-800)">${i.title} ${recurBadge}</h3>
              <p style="font-size:14px; color:var(--gray-600); margin:4px 0 0 0">${i.description || 'Sin descripción'}</p>
            </div>
            ${(isAdmin || i.created_by == state.user.id) ? `<div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline"style="padding:6px; background:#fff"onclick="openEditEvent('${i.id}')">✏️</button><button class="btn btn-sm btn-outline"style="padding:6px; color:var(--danger-600); border-color:var(--danger-200); background:#fff"onclick="deleteEvent(${parseInt(i.id, 10)})">🗑</button></div>` : ''}
          </div>`;
        }
      }).join('') + '</div>';

    wrapper.innerHTML = `
      <div class="page-header">
        <h2>Calendario de Eventos</h2>
        <div style="display:flex;gap:10px;align-items:center;">
          <button class="btn ${googleLinked ? 'btn-outline' : 'btn-secondary'}"id="google-link-btn"onclick="${googleLinked ? 'unlinkGoogleCalendar()' : 'linkGoogleCalendar()'}"style="font-size:13px;display:flex;align-items:center;gap:6px">
            <span style="font-size:16px">${googleLinked ? '✅' : '🔗'}</span> ${googleLinked ? 'Google Vinculado' : 'Vincular Google Calendar'}
          </button>
          <button class="btn btn-primary"onclick="openCreateEvent()">＋ Nuevo Evento</button>
        </div>
      </div>
      
      <div class="card"style="margin-bottom: 24px;">
        <div class="card-body"style="padding: 24px;">
            <div class="calendar-top-controls">
                <button class="calendar-nav-btn"onclick="calPrevMonth()">← Anterior</button>
                <div class="calendar-title">${monthNames[currMonth]} ${currYear}</div>
                <button class="calendar-nav-btn"onclick="calNextMonth()">Siguiente →</button>
            </div>
            
            <div style="overflow-x: auto; padding-bottom: 8px; width: 100%;">
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
      </div>

      <div class="card">
        <div class="card-header"><h3>Próximos Eventos</h3></div>
        ${upcomingHTML}
      </div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window.calPrevMonth = () => { window.calDate.setMonth(window.calDate.getMonth() - 1); renderCalendar(wrapper); };
    window.calNextMonth = () => { window.calDate.setMonth(window.calDate.getMonth() + 1); renderCalendar(wrapper); };

    window._calEventsObj = expandedEvents;

    window.linkGoogleCalendar = async function () {
      try {
        const data = await api('google_auth.php?action=link');
        if (data.url) window.location.href = data.url;
      } catch (err) { toast('Error al vincular Google Calendar: ' + err.message, 'error'); }
    };

    window.unlinkGoogleCalendar = async function () {
      if (!confirm('¿Deseas desvincular tu Google Calendar?')) return;
      try {
        await api('google_auth.php?action=unlink', { method: 'POST' });
        toast('Google Calendar desvinculado');
        navigate('calendar');
      } catch (err) { toast(err.message, 'error'); }
    };

    window.showEventDetails = function (id) {
      const e = window._calEventsObj.find(x => x.id == id);
      if (!e) return;
      const canDelete = isAdmin || e.created_by == state.user.id;

      showModal(`
        <div class="modal-header"><h2>Detalles del Evento</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <div class="modal-body">
            <div style="margin-bottom:16px; display:flex; gap:8px; flex-wrap:wrap; align-items:center">
                <span class="badge badge-primary">📅 ${e.event_date}</span>
                <span class="badge badge-warning"style="text-transform:uppercase">DEPARTAMENTO: ${e.target_group ? e.target_group.replace(/_/g, ' ').split(',').join(' • ') : 'TODOS'}</span>
                ${e.assigned_name ? `<span class="badge" style="background:var(--warning-100); color:var(--warning-800); border:1px solid var(--warning-300)">ASIGNADO A SOPORTE: ${e.assigned_name}</span>` : ''}
            </div>
            <h3 style="margin:0 0 8px 0; color:var(--primary-800)">${e.title}</h3>
            <p style="color:var(--gray-700); line-height:1.5; margin-bottom:14px">${e.description || 'Sin descripción detallada.'}</p>
            <div style="font-size:13px; color:var(--gray-600); font-weight:600; padding-top:12px; border-top:1px dashed var(--gray-200)">
              Agendado por: <span style="color:var(--primary-600); text-transform:uppercase">${e.creator_name || 'ADMINISTRACIÓN'}</span>
            </div>
        </div>
            <div class="modal-footer"style="display:flex; justify-content:space-between">
                <div style="display:flex;gap:8px">
                    ${canDelete ? `<button class="btn btn-outline"style="color:var(--danger-500); border-color:var(--danger-300)"onclick="deleteEvent('${e.id}')">🗑 Eliminar</button>` : '<div></div>'}
                    ${canDelete ? `<button class="btn btn-outline"onclick="openEditEvent('${e.id}')">✏️ Editar</button>` : ''}
                </div>
                <button type="button"class="btn btn-primary"onclick="closeModal()">Cerrar</button>
            </div>
    `);
    };

    window.openEditEvent = async function (id) {
      const baseId = id.split('_')[0];
      const e = window._calEventsObj.find(x => x.id == id);
      if (!e) return;

      const adminDeptSelect = state.user.role === 'admin' ? `
      <div class="form-group"><label class="form-label">Color / Departamento (Admins)</label>
          <select class="form-select"id="ee-dept">
            <option value="emergencias"${e.target_group === 'emergencias' ? 'selected' : ''}>🔴 Emergencias</option>
            <option value="actividades"${e.target_group === 'actividades' ? 'selected' : ''}>🟠 Actividades</option>
            <option value="otros_eventos"${e.target_group === 'otros_eventos' ? 'selected' : ''}>🟢 Otros Eventos</option>
            <option value="soporte_oficina"${e.target_group === 'soporte_oficina' ? 'selected' : ''}>🔵 Soporte de Oficina</option>
            <option value="superintendencia"${e.target_group === 'superintendencia' ? 'selected' : ''}>🟣 Superintendencia</option>
          </select>
        </div> ` : '';

      let supportSelect = '';
      try {
        const usersRes = await api('users.php?action=list');
        const supportUsers = usersRes.users.filter(u => u.user_group && u.user_group.includes('soporte_'));
        const supportOptions = supportUsers.map(u => `<option value="${u.id}" ${e.assigned_to == u.id ? 'selected' : ''}>${u.name} (${u.user_group.split(',')[0].replace(/_/g, ' ')})</option>`).join('');
        supportSelect = `
          <div class="form-group">
            <label class="form-label">Asignar a (Soporte)</label>
            <select class="form-select" id="ee-assigned-to">
              <option value="">Nadie</option>
              ${supportOptions}
            </select>
          </div>
        `;
      } catch (err) { }

      showModal(`
      <div class="modal-header"><h2>Editar Evento del Calendario</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="edit-event-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Título del Evento *</label><input class="form-input"id="ee-title"value="${e.title.replace(/"/g, '&quot;')}"required></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input"id="ee-desc">${e.description || ''}</textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Fecha y Hora *</label><input class="form-input"type="datetime-local"id="ee-date"value="${e.event_date.replace(' ', 'T')}"required></div>
              ${adminDeptSelect}
            </div>
            ${supportSelect}
            ${e.recurrence ? '<small style="color:var(--gray-500)">Al actualizar la fecha/hora base o cambiar el color, se actualizará toda la serie recurrente.</small>' : ''}
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Guardar Cambios</button></div>
        </form>
    `);
      document.getElementById('edit-event-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const bodyJSON = {
            title: document.getElementById('ee-title').value,
            description: document.getElementById('ee-desc').value,
            event_date: document.getElementById('ee-date').value.replace('T', ' ')
          };
          if (state.user.role === 'admin' && document.getElementById('ee-dept')) {
            bodyJSON.target_group = document.getElementById('ee-dept').value;
          }
          if (document.getElementById('ee-assigned-to')) {
            bodyJSON.assigned_to = document.getElementById('ee-assigned-to').value;
          }
          await api('calendar_events.php?action=update&id=' + parseInt(baseId, 10), {
            method: 'PUT', body: JSON.stringify(bodyJSON)
          });
          toast('Evento actualizado');
          closeModal();
          renderCalendar(wrapper);
        } catch (err) { toast(err.message, 'error'); }
      });
    };

    window.openCreateEvent = async function () {
      let supportSelect = '';
      try {
        const usersRes = await api('users.php?action=list');
        const supportUsers = usersRes.users.filter(u => u.user_group && u.user_group.includes('soporte_'));
        const supportOptions = supportUsers.map(u => `<option value="${u.id}">${u.name} (${u.user_group.split(',')[0].replace(/_/g, ' ')})</option>`).join('');
        supportSelect = `
          <div class="form-group">
            <label class="form-label">Asignar a (Soporte)</label>
            <select class="form-select" id="ce-assigned-to">
              <option value="">Nadie</option>
              ${supportOptions}
            </select>
          </div>
        `;
      } catch (err) { }

      const adminDeptSelect = state.user.role === 'admin' ? `
      <div class="form-group"><label class="form-label">Color / Departamento (Admins)</label>
          <select class="form-select"id="ce-dept">
            <option value="emergencias">🔴 Emergencias</option>
            <option value="actividades">🟠 Actividades</option>
            <option value="otros_eventos"selected>🟢 Otros Eventos</option>
            <option value="soporte_oficina">🔵 Soporte de Oficina</option>
            <option value="superintendencia">🟣 Superintendencia</option>
          </select>
        </div> ` : '';

      showModal(`
      <div class="modal-header"><h2>Nuevo Evento del Calendario</h2><button class="modal-close"onclick="closeModal()">✕</button></div>
        <form id="create-event-form">
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Título del Evento *</label><input class="form-input"id="ce-title"required></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-input"id="ce-desc"></textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Fecha y Hora Base *</label><input class="form-input"type="datetime-local"id="ce-date"required></div>
              ${adminDeptSelect}
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Recurrencia (Opcional)</label>
                <select class="form-select"id="ce-recurrence">
                  <option value="none">No se repite</option>
                  <option value="daily_14">Diariamente (por 14 días)</option>
                  <option value="weekly_12">Semanalmente (por 12 semanas)</option>
                  <option value="monthly_6">Mensualmente (por 6 meses)</option>
                </select>
              </div>
              ${supportSelect}
            </div>
          </div>
          <div class="modal-footer"><button type="button"class="btn btn-outline"onclick="closeModal()">Cancelar</button><button type="submit"class="btn btn-primary">Crear Evento</button></div>
        </form>
    `);
      document.getElementById('create-event-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const saveBtn = ev.target.querySelector('button[type="submit"]');
        const ogText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner spinner-sm"></span> Creando...';
        try {
          const bodyJSON = {
            title: document.getElementById('ce-title').value,
            description: document.getElementById('ce-desc').value,
            event_date: document.getElementById('ce-date').value.replace('T', ' '),
            recurrence: document.getElementById('ce-recurrence').value
          };
          if (state.user.role === 'admin' && document.getElementById('ce-dept')) {
            bodyJSON.target_group = document.getElementById('ce-dept').value;
          }
          if (document.getElementById('ce-assigned-to')) {
            bodyJSON.assigned_to = document.getElementById('ce-assigned-to').value;
          }

          await api('calendar_events.php?action=create', {
            method: 'POST',
            body: JSON.stringify(bodyJSON)
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
        await api('calendar_events.php?action=delete', {
          method: 'POST',
          body: JSON.stringify({ id: id })
        });
        toast('Evento eliminado');
        closeModal();
        renderCalendar(document.createElement('div')).then(() => { navigate('calendar'); });
      } catch (err) {
        // Error will be caught and shown in the toast by api()
      }
    }
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box"> ${err.message}</div> `;
    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);
  }
}

// ==========================================
// Settings
// ==========================================
async function renderSettings(wrapper, params) {
  try {
    const calRes = await api('google_auth.php?action=status');
    const connected = calRes.linked;

    if (params.google === 'success') toast('✅ Google Calendar conectado exitosamente');
    if (params.google === 'error') toast('❌ Error al conectar Google Calendar', 'error');

    wrapper.innerHTML = `
      <div class="page-header"> <h2>Configuración</h2></div>
      <div class="settings-card card"><div class="card-header"><h3>👤 Perfil</h3></div><div class="card-body">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="topbar-avatar"style="width:60px;height:60px;font-size:22px">${initials(state.user?.name)}</div>
          <div><div style="font-size:18px;font-weight:600;color:var(--primary-800)">${state.user?.name}</div><div style="font-size:14px;color:var(--gray-500)">${state.user?.email}</div><span class="badge badge-${state.user?.role}"style="margin-top:4px">${state.user?.role}</span></div>
        </div>
      </div></div>
      <div class="settings-card card"><div class="card-header"><h3>📅 Google Calendar</h3></div><div class="card-body">
        <p style="font-size:14px;color:var(--gray-600);margin-bottom:16px">Conecta tu cuenta para sincronizar tareas con tu calendario.</p>
        <div class="google-cal-status ${connected ? 'connected' : 'disconnected'}"><span class="status-dot ${connected ? 'green' : 'gray'}"></span><span style="font-size:14px;font-weight:500">${connected ? 'Conectado' : 'No conectado'}</span></div>
        ${connected ? '<button class="btn btn-outline"onclick="disconnectCal()">Desconectar</button>' : '<button class="btn btn-primary"onclick="connectCal()">🔗 Conectar Google Calendar</button>'}
      </div></div>
      <div class="settings-card card"><div class="card-header"><h3>ℹ️ Acerca de</h3></div><div class="card-body">
        ${[['Sistema', 'ICCP - Gestión de Tareas'], ['Versión', '1.0.0'], ['Frontend', 'HTML + CSS + JavaScript'], ['Backend', 'PHP + MySQL']].map(([l, v]) => `<div class="info-row"><span class="info-label">${l}</span><span class="info-value">${v}</span></div>`).join('')}
      </div></div>
    `;

    document.getElementById('page-content').innerHTML = '';
    document.getElementById('page-content').appendChild(wrapper);

    window.connectCal = async function () {
      try { const d = await api('google_auth.php?action=link'); if (d.url) window.location.href = d.url; } catch (err) { toast(err.message, 'error'); }
    };
    window.disconnectCal = async function () {
      if (!confirm('¿Desconectar Google Calendar?')) return;
      try { await api('google_auth.php?action=unlink', { method: 'POST' }); toast('Google Calendar desconectado'); navigate('settings'); } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) {
    wrapper.innerHTML = `<div class="error-box"> ${err.message}</div> `;
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
  modal.className = `modal ${extraClass} `;
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
// Integrations
// ==========================================
window.exportTasksCSV = async function () {
  try {
    const res = await api('tasks.php?action=list');
    const tasks = res.tasks || [];
    if (tasks.length === 0) return toast('No hay tareas para exportar', 'warning');

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
    csvContent += "ID,Titulo,Descripcion,Estado,Prioridad,Departamento,Creador,Fecha Creacion,Fecha Limite\r\n";

    tasks.forEach(t => {
      const row = [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')
        }"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        statusLabel[t.status] || t.status,
        priorityLabel[t.priority] || t.priority,
        groupLabels[t.target_group] || t.target_group,
        `"${(t.creator_name || '').replace(/"/g, '""')}"`,
        t.created_at,
        t.due_date
      ];
      csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_ICCP_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Reporte descargado exitosamente');
  } catch (err) {
    toast('Error al exportar: ' + err.message, 'error');
  }
};

// ==========================================
// External Members UI Handlers
// ==========================================
window.openCreateExtMember = () => {
    let overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'ext-user-modal';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>Añadir Miembro al Organigrama</h2>
                <div class="modal-close" style="cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">✕</div>
            </div>
            <div class="modal-body">
                <form id="create-ext-member-form">
                    <div class="form-group">
                        <label>Nombre Completo *</label>
                        <input type="text" name="name" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" name="email" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Correo JWPub (Opcional)</label>
                        <input type="email" name="jwpub_email" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Teléfono (Opcional)</label>
                        <input type="tel" name="phone" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Asignación (Opcional)</label>
                        <input type="text" name="job_title" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Nivel Jerárquico *</label>
                        <select name="hierarchy_level" class="form-select" required>
                            <option value="voluntario_clave">Voluntario Clave</option>
                            <option value="auxiliar">Auxiliar</option>
                            <option value="superintendente">Superintendente</option>
                            <option value="admin">Administrador (Admin)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Departamento Principal *</label>
                        <select name="user_group" class="form-select" required>
                            <option value="emergencias">Emergencias</option>
                            <option value="actividades">Actividades</option>
                            <option value="soporte_oficina">Soporte de Oficina</option>
                            <option value="otros_eventos">Otros Eventos</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Día / Hora de Reunión (Opcional)</label>
                        <input type="text" name="meeting_day" class="form-input" placeholder="Ej. Lunes 19:30">
                    </div>
                    <button type="submit"class="btn btn-primary"style="width:100%; justify-content:center; margin-top:20px">Guardar Miembro</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('create-ext-member-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        try {
            await api('external_members.php?action=create', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            toast('Miembro externo añadido');
            overlay.remove();
            navigate('departments');
        } catch(err) {
            toast('Error: ' + err.message, 'error');
        }
    });
};

window.deleteExtMember = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este miembro del organigrama?')) return;
    try {
        await api('external_members.php?action=delete&id=' + id, {method: 'DELETE'});
        toast('Miembro eliminado exitosamente');
        navigate('departments');
    } catch(err) {
        toast('Error: ' + err.message, 'error');
    }
};

window.openEditOrgUser = (id, isExternal) => {
    const u = window.currentOrgUsers.find(x => String(x.id) === String(id));
    if (!u) return;

    const realId = isExternal ? String(u.id).replace('ext_', '') : u.id;
    const endpoint = isExternal ? 'external_members.php' : 'users.php';

    let overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'edit-org-user-modal';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>Editar Detalles (${u.name})</h2>
                <div class="modal-close" style="cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">✕</div>
            </div>
            <div class="modal-body">
                <form id="edit-org-user-form" style="display:flex; flex-direction:column; gap:15px;">
                    <input type="hidden" name="id" value="${realId}">
                    
                    <div style="display:flex; gap:15px; align-items:center;">
                        <div style="width:60px; height:60px; border-radius:50%; background:var(--gray-200); overflow:hidden; display:flex; align-items:center; justify-content:center;">
                            ${u.avatar ? `<img src="api/uploads/${u.avatar}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:24px; color:var(--gray-500); font-weight:bold;">${u.name.substring(0,2).toUpperCase()}</span>`}
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Actualizar Foto de Perfil (Opcional)</label>
                            <input type="file" id="avatarUpload" accept="image/png, image/jpeg, image/webp" style="font-size:13px;">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Nombre Completo *</label>
                        <input type="text" name="name" value="${u.name}" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" name="email" value="${u.email || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Correo JWPub (Opcional)</label>
                        <input type="email" name="jwpub_email" value="${u.jwpub_email || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Teléfono (Opcional)</label>
                        <input type="tel" name="phone" value="${u.phone || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Asignación / Título (Opcional)</label>
                        <input type="text" name="job_title" value="${u.job_title || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Nivel Jerárquico *</label>
                        <select name="hierarchy_level" class="form-select" required>
                            <option value="auxiliar" ${u.hierarchy_level === 'auxiliar' ? 'selected' : ''}>Auxiliar</option>
                            <option value="voluntario_clave" ${u.hierarchy_level === 'voluntario_clave' ? 'selected' : ''}>Voluntario Clave</option>
                            <option value="superintendente" ${u.hierarchy_level === 'superintendente' ? 'selected' : ''}>Superintendente</option>
                            <option value="admin" ${u.hierarchy_level === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Departamento Principal *</label>
                        <input type="text" name="user_group" value="${u.user_group || ''}" class="form-input" required>
                        <small style="color:var(--gray-500); font-size:11px;">Escribe el código interno (ej. emergencias, otros_eventos). Usa comas para múltiples.</small>
                    </div>
                    ${isExternal ? `
                    <div class="form-group">
                        <label>Día / Hora de Reunión</label>
                        <input type="text" name="meeting_day" value="${u.meeting_day || ''}" class="form-input">
                    </div>
                    ` : ''}
                    
                    <div style="display:flex; justify-content:space-between; margin-top:20px;">
                        ${isExternal ? `<button type="button" class="btn" style="background:var(--danger-100); color:var(--danger-700);" onclick="deleteExtMember('${u.id}'); this.closest('.modal-overlay').remove()">Borrar Miembro Externo</button>` : '<div></div>'}
                        <button type="submit" class="btn btn-primary">Guardar Cambios</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('edit-org-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const fileInput = document.getElementById('avatarUpload');
        
        try {
            await api(endpoint + '?action=update&id=' + realId, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            if (fileInput.files.length > 0) {
                const formData = new FormData();
                formData.append('avatar', fileInput.files[0]);
                
                const token = localStorage.getItem('iccp_token');
                const uploadRes = await fetch('api/' + endpoint + '?action=upload_avatar&id=' + realId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: formData
                });
                const uploadJson = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadJson.error || 'Error al subir foto');
            }

            toast('Usuario actualizado exitosamente');
            overlay.remove();
            navigate('departments');
        } catch(err) {
            toast('Error: ' + err.message, 'error');
        }
    });
};

window.toggleOrgView = (mode) => {
    state.orgViewMode = mode;
    const treeView = document.getElementById('org-tree-view');
    const tableView = document.getElementById('org-table-view');
    const btnTree = document.getElementById('btn-view-tree');
    const btnTable = document.getElementById('btn-view-table');

    if (treeView) treeView.style.display = mode === 'tree' ? 'flex' : 'none';
    if (tableView) tableView.style.display = mode === 'table' ? 'block' : 'none';

    if (btnTree) {
        btnTree.style.background = mode === 'tree' ? '#fff' : 'transparent';
        btnTree.style.color = mode === 'tree' ? 'var(--primary-700)' : 'var(--gray-600)';
        btnTree.style.boxShadow = mode === 'tree' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
    }
    if (btnTable) {
        btnTable.style.background = mode === 'table' ? '#fff' : 'transparent';
        btnTable.style.color = mode === 'table' ? 'var(--primary-700)' : 'var(--gray-600)';
        btnTable.style.boxShadow = mode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
    }
};

window.filterOrg = (term) => {
    const s = term.toLowerCase().trim();
    
    // Filter Tree View
    document.querySelectorAll('.org-interactive-card').forEach(card => {
        const text = card.innerText.toLowerCase();
        if (text.includes(s) || s === '') {
            card.style.display = 'flex';
            if (s !== '') card.style.boxShadow = '0 0 0 3px var(--warning-400)';
            else card.style.boxShadow = 'none';
        } else {
            card.style.display = 'none';
        }
    });

    // Filter Table View
    document.querySelectorAll('.table-member-row').forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(s) || s === '') {
            row.style.display = '';
            if (s !== '') row.style.background = 'var(--warning-50)';
            else row.style.background = 'transparent';
        } else {
            row.style.display = 'none';
        }
    });
};

window.exportOrgChart = async () => {
    const target = document.getElementById('org-tree-view');
    if (!target) return;
    
    // Switch to tree view temporarily if in table mode
    const wasTable = state.orgViewMode === 'table';
    if (wasTable) {
        document.getElementById('org-tree-view').style.display = 'flex';
        document.getElementById('org-table-view').style.display = 'none';
    }

    const originalWidth = target.style.width;
    const originalOverflow = target.style.overflow;
    target.style.width = target.scrollWidth + 'px';
    target.style.overflow = 'visible';

    try {
        toast('Generando imagen, por favor espera...');
        // Need to ensure fonts and images resolve
        const canvas = await html2canvas(target, {
            scale: 2, // High resolution
            useCORS: true,
            backgroundColor: '#f8fafc', // Gray-50 match
            width: target.scrollWidth,
            height: target.scrollHeight,
            windowWidth: target.scrollWidth,
            windowHeight: target.scrollHeight,
            x: 0,
            y: 0
        });
        
        const link = document.createElement('a');
        link.download = `Organigrama_ICCP_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Imagen exportada exitosamente');
    } catch (err) {
        toast('Error al exportar la imagen', 'error');
        console.error(err);
    } finally {
        target.style.width = originalWidth;
        target.style.overflow = originalOverflow;
        if (wasTable) {
            document.getElementById('org-tree-view').style.display = 'none';
            document.getElementById('org-table-view').style.display = 'block';
        }
    }
};

// ==========================================
// Init
// ==========================================
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
