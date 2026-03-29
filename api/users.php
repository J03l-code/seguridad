<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

// Auto-migrate user_group column length for multi-group support
try {
    $pdo->exec("ALTER TABLE users MODIFY user_group VARCHAR(255) DEFAULT 'otros_eventos'");
} catch (Exception $e) {
}

switch ($action) {
    case 'list':
        listUsers();
        break;
    case 'get':
        getUser($id);
        break;
    case 'update':
        updateUser($id, $auth);
        break;
    case 'role':
        changeRole($id, $auth);
        break;
    case 'create':
        createUser($auth);
        break;
    case 'delete':
        deleteUser($id, $auth);
        break;
    case 'org_chart':
        getOrgChart();
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function deleteUser($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    if ($auth['id'] == $id)
        jsonResponse(['error' => 'No puedes eliminarte a ti mismo.'], 400);

    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0)
        jsonResponse(['error' => 'Usuario no encontrado.'], 404);

    jsonResponse(['message' => 'Usuario eliminado.']);
}

function getOrgChart()
{
    global $pdo;
    // Auto-migrate hierarchy_map column
    try {
        $pdo->query('SELECT hierarchy_map FROM users LIMIT 1');
    } catch (PDOException $e) {
        $pdo->exec('ALTER TABLE users ADD COLUMN hierarchy_map TEXT DEFAULT NULL');
    }
    $stmt = $pdo->prepare('SELECT id, name, email, role, user_group, hierarchy_level, hierarchy_map, job_title FROM users ORDER BY hierarchy_level ASC, name ASC');
    $stmt->execute();
    jsonResponse(['users' => $stmt->fetchAll()]);
}

function createUser($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);

    $data = getJsonBody();
    $name = trim($data['name'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    $group = $data['user_group'] ?? 'otros_eventos';

    // Si incluye superintendencia, el rol debe ser admin. Caso contrario, member.
    $role = (strpos($group, 'superintendencia') !== false) ? 'admin' : ($data['role'] ?? 'member');

    $hierarchy_level = $data['hierarchy_level'] ?? 'auxiliar';
    $job_title = trim($data['job_title'] ?? '');

    if (!$name || !$email || !$password) {
        jsonResponse(['error' => 'Todos los campos son obligatorios.'], 400);
    }
    if (strlen($password) < 6) {
        jsonResponse(['error' => 'La contraseña debe tener al menos 6 caracteres.'], 400);
    }

    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'El correo electrónico ya está registrado.'], 409);
    }

    $hashed = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('INSERT INTO users (name, email, password, role, user_group, hierarchy_level, job_title) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$name, $email, $hashed, $role, $group, $hierarchy_level, $job_title]);
    $newUserId = $pdo->lastInsertId();

    // Feature 3: Retroactive Notifications
    try {
        $groupArray = array_map('trim', explode(',', $group));

        // 1. Retroactive Tasks
        $tasksStmt = $pdo->query("SELECT id, title, target_group FROM tasks WHERE status != 'done'");
        $activeTasks = $tasksStmt->fetchAll();
        $notifStmt = $pdo->prepare("INSERT INTO notifications (user_id, message) VALUES (?, ?)");

        foreach ($activeTasks as $t) {
            $taskGroups = array_map('trim', explode(',', $t['target_group'] ?: 'otros_eventos'));
            if (count(array_intersect($groupArray, $taskGroups)) > 0) {
                $notifStmt->execute([$newUserId, "Tienes una tarea pendiente en tu área: '{$t['title']}'"]);
            }
        }

        // 2. Retroactive Events
        $eventsStmt = $pdo->query("SELECT id, title, target_group FROM calendar_events WHERE event_date >= CURDATE()");
        $activeEvents = $eventsStmt->fetchAll();
        foreach ($activeEvents as $e) {
            $eventGroups = array_map('trim', explode(',', $e['target_group'] ?: 'todos'));
            if (in_array('todos', $eventGroups) || count(array_intersect($groupArray, $eventGroups)) > 0) {
                $notifStmt->execute([$newUserId, "Hay un evento agendado para tu área: '{$e['title']}'"]);
            }
        }
    } catch (Exception $e) {
        // Ignorar falla de notificaciones anidadas para no quebrar el insert principal.
    }

    jsonResponse(['message' => 'Usuario creado exitosamente.'], 201);
}

function listUsers()
{
    global $pdo;
    $stmt = $pdo->query("
        SELECT u.id, u.name, u.email, u.role, u.user_group, u.hierarchy_level, u.hierarchy_map, u.job_title, u.avatar, u.created_at,
            (SELECT GROUP_CONCAT(d.name SEPARATOR ', ') FROM department_members dm
             JOIN departments d ON dm.department_id = d.id WHERE dm.user_id = u.id) as departments
        FROM users u ORDER BY u.created_at DESC
    ");
    jsonResponse(['users' => $stmt->fetchAll()]);
}

function getUser($id)
{
    global $pdo;
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('SELECT id, name, email, role, user_group, hierarchy_level, hierarchy_map, job_title, avatar, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user)
        jsonResponse(['error' => 'Usuario no encontrado.'], 404);

    $depts = $pdo->prepare("SELECT d.id, d.name, d.color FROM department_members dm JOIN departments d ON dm.department_id = d.id WHERE dm.user_id = ?");
    $depts->execute([$id]);

    jsonResponse(['user' => $user, 'departments' => $depts->fetchAll()]);
}

function updateUser($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'PUT')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    if ($auth['id'] != $id && $auth['role'] !== 'admin') {
        jsonResponse(['error' => 'No tienes permiso.'], 403);
    }

    $data = getJsonBody();
    $fields = [];
    $values = [];

    if (!empty($data['name'])) {
        $fields[] = 'name = ?';
        $values[] = $data['name'];
    }
    if (!empty($data['email'])) {
        $check = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
        $check->execute([$data['email'], $id]);
        if ($check->fetch())
            jsonResponse(['error' => 'Email ya en uso.'], 409);
        $fields[] = 'email = ?';
        $values[] = $data['email'];
    }
    if (!empty($data['password'])) {
        if (strlen($data['password']) < 6)
            jsonResponse(['error' => 'Contraseña: mínimo 6 caracteres.'], 400);
        $fields[] = 'password = ?';
        $values[] = password_hash($data['password'], PASSWORD_BCRYPT);
    }
    if (!empty($data['user_group'])) {
        $fields[] = 'user_group = ?';
        $values[] = $data['user_group'];
        // auto downgrade/upgrade if superintendencia is added or removed
        if (strpos($data['user_group'], 'superintendencia') !== false) {
            $fields[] = 'role = ?';
            $values[] = 'admin';
        } else {
            // If superintendencia is removed from group, and the user was an admin due to it,
            // downgrade them to member, unless they were explicitly set as admin.
            // This logic might need refinement based on exact business rules.
            // For now, if superintendencia is not in the group, we don't force a role change.
            // If a specific downgrade is needed, it would be added here.
        }
    }
    if (!empty($data['hierarchy_level'])) {
        $fields[] = 'hierarchy_level = ?';
        $values[] = $data['hierarchy_level'];
    }
    if (array_key_exists('job_title', $data)) {
        $fields[] = 'job_title = ?';
        $values[] = trim($data['job_title']) === '' ? null : trim($data['job_title']);
    }
    if (array_key_exists('hierarchy_map', $data)) {
        $fields[] = 'hierarchy_map = ?';
        $values[] = is_array($data['hierarchy_map']) ? json_encode($data['hierarchy_map']) : $data['hierarchy_map'];
    }

    if (empty($fields))
        jsonResponse(['error' => 'Nada que actualizar.'], 400);

    $values[] = $id;
    $pdo->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($values);
    jsonResponse(['message' => 'Usuario actualizado.']);
}

function changeRole($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'PUT')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    if ($auth['id'] == $id)
        jsonResponse(['error' => 'No puedes cambiar tu propio rol.'], 400);

    $data = getJsonBody();
    $role = $data['role'] ?? '';
    if (!in_array($role, ['admin', 'member']))
        jsonResponse(['error' => 'Rol inválido.'], 400);

    $stmt = $pdo->prepare('UPDATE users SET role = ? WHERE id = ?');
    $stmt->execute([$role, $id]);
    if ($stmt->rowCount() === 0)
        jsonResponse(['error' => 'Usuario no encontrado.'], 404);

    jsonResponse(['message' => "Rol actualizado a \"$role\"."]);
}
