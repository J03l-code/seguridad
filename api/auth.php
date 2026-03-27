<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$action = getParam('action', '');

switch ($action) {
    case 'login':
        handleLogin();
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
