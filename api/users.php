<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

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

    jsonResponse(['message' => 'Usuario eliminado correctamente.']);
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
    $role = $data['role'] ?? 'member';

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
    $stmt = $pdo->prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    $stmt->execute([$name, $email, $hashed, $role]);

    jsonResponse(['message' => 'Usuario creado exitosamente.'], 201);
}

function listUsers()
{
    global $pdo;
    $stmt = $pdo->query("
        SELECT u.id, u.name, u.email, u.role, u.avatar, u.created_at,
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

    $stmt = $pdo->prepare('SELECT id, name, email, role, avatar, created_at FROM users WHERE id = ?');
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
