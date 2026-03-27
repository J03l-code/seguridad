<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$action = getParam('action', '');

switch ($action) {
    case 'auth-url':
        getAuthUrl();
        break;
    case 'callback':
        handleCallback();
        break;
    case 'status':
        getStatus();
        break;
    case 'sync':
        syncTask();
        break;
    case 'disconnect':
        disconnectCalendar();
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function getAuthUrl()
{
    global $GOOGLE_CLIENT_ID, $GOOGLE_REDIRECT_URI;
    $auth = authenticate();

    $params = http_build_query([
        'client_id' => $GOOGLE_CLIENT_ID,
        'redirect_uri' => $GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/calendar.events',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => json_encode(['userId' => $auth['id']])
    ]);

    jsonResponse(['authUrl' => 'https://accounts.google.com/o/oauth2/v2/auth?' . $params]);
}

function handleCallback()
{
    global $pdo, $GOOGLE_CLIENT_ID, $GOOGLE_CLIENT_SECRET, $GOOGLE_REDIRECT_URI, $FRONTEND_URL;

    $code = $_GET['code'] ?? '';
    $state = json_decode($_GET['state'] ?? '{}', true);
    $userId = $state['userId'] ?? null;

    if (!$code || !$userId) {
        header("Location: $FRONTEND_URL/index.html#settings?calendar=error");
        exit;
    }

    // Exchange code for tokens
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'code' => $code,
            'client_id' => $GOOGLE_CLIENT_ID,
            'client_secret' => $GOOGLE_CLIENT_SECRET,
            'redirect_uri' => $GOOGLE_REDIRECT_URI,
            'grant_type' => 'authorization_code'
        ])
    ]);
    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);

    if (isset($response['access_token'])) {
        $pdo->prepare('UPDATE users SET google_access_token = ?, google_refresh_token = ? WHERE id = ?')
            ->execute([$response['access_token'], $response['refresh_token'] ?? null, $userId]);
        header("Location: $FRONTEND_URL/index.html#settings?calendar=connected");
    } else {
        header("Location: $FRONTEND_URL/index.html#settings?calendar=error");
    }
    exit;
}

function getStatus()
{
    global $pdo;
    $auth = authenticate();

    $stmt = $pdo->prepare('SELECT google_refresh_token FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    jsonResponse(['connected' => !empty($user['google_refresh_token'])]);
}

function syncTask()
{
    global $pdo, $GOOGLE_CLIENT_ID, $GOOGLE_CLIENT_SECRET;
    $auth = authenticate();
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $taskId = getParam('id');
    if (!$taskId)
        jsonResponse(['error' => 'ID de tarea requerido.'], 400);

    $stmt = $pdo->prepare("SELECT t.*, u.google_access_token, u.google_refresh_token
        FROM tasks t JOIN users u ON t.assigned_to = u.id WHERE t.id = ?");
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();

    if (!$task)
        jsonResponse(['error' => 'Tarea no encontrada o sin asignar.'], 404);
    if (empty($task['google_refresh_token']))
        jsonResponse(['error' => 'Usuario no conectó Google Calendar.'], 400);

    // Refresh access token
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => $GOOGLE_CLIENT_ID,
            'client_secret' => $GOOGLE_CLIENT_SECRET,
            'refresh_token' => $task['google_refresh_token'],
            'grant_type' => 'refresh_token'
        ])
    ]);
    $tokenData = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $accessToken = $tokenData['access_token'] ?? $task['google_access_token'];

    $dueDate = $task['due_date'] ? date('c', strtotime($task['due_date'])) : date('c');
    $endDate = $task['due_date'] ? date('c', strtotime($task['due_date'] . ' +1 hour')) : date('c', strtotime('+1 hour'));

    $event = [
        'summary' => '[ICCP] ' . $task['title'],
        'description' => $task['description'] ?: 'Tarea del sistema ICCP',
        'start' => ['dateTime' => $dueDate, 'timeZone' => 'America/Bogota'],
        'end' => ['dateTime' => $endDate, 'timeZone' => 'America/Bogota'],
        'reminders' => ['useDefault' => false, 'overrides' => [['method' => 'popup', 'minutes' => 30]]]
    ];

    $url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    $method = 'POST';
    if (!empty($task['google_event_id'])) {
        $url .= '/' . $task['google_event_id'];
        $method = 'PUT';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($event)
    ]);
    $result = json_decode(curl_exec($ch), true);
    curl_close($ch);

    if (isset($result['id'])) {
        $pdo->prepare('UPDATE tasks SET google_event_id = ? WHERE id = ?')->execute([$result['id'], $taskId]);
        $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
            ->execute([$taskId, $auth['id'], 'calendar_synced', 'Sincronizada con Google Calendar']);
        jsonResponse(['message' => 'Tarea sincronizada.', 'eventId' => $result['id']]);
    } else {
        jsonResponse(['error' => 'Error al sincronizar con Google Calendar.'], 500);
    }
}

function disconnectCalendar()
{
    global $pdo;
    $auth = authenticate();
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $pdo->prepare('UPDATE users SET google_access_token = NULL, google_refresh_token = NULL WHERE id = ?')
        ->execute([$auth['id']]);
    jsonResponse(['message' => 'Google Calendar desconectado.']);
}
