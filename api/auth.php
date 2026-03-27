<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$action = getParam('action', '');

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'me':
        handleMe();
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function handleLogin()
{
    global $pdo, $JWT_SECRET;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $data = getJsonBody();
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

    if (!$email || !$password) {
        jsonResponse(['error' => 'Email y contraseña son obligatorios.'], 400);
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        jsonResponse(['error' => 'Credenciales incorrectas.'], 401);
    }

    $token = createJWT([
        'id' => $user['id'],
        'email' => $user['email'],
        'role' => $user['role']
    ], $JWT_SECRET);

    jsonResponse([
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'avatar' => $user['avatar']
        ]
    ]);
}

function handleRegister()
{
    global $pdo, $JWT_SECRET;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $data = getJsonBody();
    $name = trim($data['name'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

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
    $stmt->execute([$name, $email, $hashed, 'member']);
    $userId = $pdo->lastInsertId();

    $token = createJWT([
        'id' => (int) $userId,
        'email' => $email,
        'role' => 'member'
    ], $JWT_SECRET);

    jsonResponse([
        'token' => $token,
        'user' => ['id' => (int) $userId, 'name' => $name, 'email' => $email, 'role' => 'member']
    ], 201);
}

function handleMe()
{
    global $pdo;
    if (getMethod() !== 'GET')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $auth = authenticate();
    $stmt = $pdo->prepare('SELECT id, name, email, role, avatar, created_at FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    if (!$user)
        jsonResponse(['error' => 'Usuario no encontrado.'], 404);
    jsonResponse(['user' => $user]);
}
