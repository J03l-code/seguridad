<?php
/**
 * Google Calendar OAuth2 — Vinculación y desvinculación
 * Endpoint: api/google_auth.php?action=link | status | unlink
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'link');

// Auto-migrate: create google_tokens table if it doesn't exist
try {
    $pdo->query("SELECT 1 FROM google_tokens LIMIT 1");
} catch (PDOException $e) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS google_tokens (
        user_id INT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE = InnoDB");
}

switch ($action) {
    case 'link':
        startOAuth($auth);
        break;
    case 'status':
        getStatus($auth);
        break;
    case 'unlink':
        unlinkGoogle($auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function startOAuth($auth)
{
    global $GOOGLE_CLIENT_ID, $GOOGLE_REDIRECT_URI;

    $params = [
        'client_id' => $GOOGLE_CLIENT_ID,
        'redirect_uri' => $GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/calendar.events',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => $auth['id'] // pass user ID through state
    ];

    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    jsonResponse(['url' => $url]);
}

function getStatus($auth)
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT expires_at FROM google_tokens WHERE user_id = ?');
    $stmt->execute([$auth['id']]);
    $token = $stmt->fetch();

    jsonResponse([
        'linked' => !!$token,
        'expires_at' => $token ? $token['expires_at'] : null
    ]);
}

function unlinkGoogle($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $pdo->prepare('DELETE FROM google_tokens WHERE user_id = ?')->execute([$auth['id']]);
    jsonResponse(['message' => 'Google Calendar desvinculado.']);
}
