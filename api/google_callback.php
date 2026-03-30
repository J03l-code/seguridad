<?php
/**
 * Google OAuth2 Callback — Receives auth code and stores tokens
 */
require_once __DIR__ . '/config.php';

// Auto-create google_tokens table if it doesn't exist
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}


$code = $_GET['code'] ?? null;
$userId = $_GET['state'] ?? null;
$error = $_GET['error'] ?? null;

if ($error || !$code || !$userId) {
    // Redirect to frontend with error
    header('Location: ' . $FRONTEND_URL . '?google=error#calendar');
    exit;
}

// Exchange authorization code for tokens
$tokenData = [
    'code' => $code,
    'client_id' => $GOOGLE_CLIENT_ID,
    'client_secret' => $GOOGLE_CLIENT_SECRET,
    'redirect_uri' => $GOOGLE_REDIRECT_URI,
    'grant_type' => 'authorization_code'
];

$ch = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query($tokenData),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded']
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    header('Location: ' . $FRONTEND_URL . '?google=error#calendar');
    exit;
}

$tokens = json_decode($response, true);

if ($httpCode !== 200 || !isset($tokens['access_token'])) {
    header('Location: ' . $FRONTEND_URL . '?google=error#calendar');
    exit;
}

$accessToken = $tokens['access_token'];
$refreshToken = $tokens['refresh_token'] ?? '';
$expiresIn = $tokens['expires_in'] ?? 3600;
$expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

// Store tokens in database
try {
    $stmt = $pdo->prepare("INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at) 
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = IF(VALUES(refresh_token) != '', VALUES(refresh_token), refresh_token), expires_at = VALUES(expires_at)");
    $stmt->execute([$userId, $accessToken, $refreshToken, $expiresAt]);

    // === RETROACTIVE SYNC: Push all future events to the newly linked calendar ===
    try {
        require_once __DIR__ . '/google_calendar_helper.php';
        $colorMap = ['emergencias' => 11, 'actividades' => 7, 'otros_eventos' => 5, 'soporte_oficina' => 3, 'superintendencia' => 10];

        // Get all events from today onwards
        $evStmt = $pdo->prepare("SELECT id, title, description, event_date, target_group, google_event_ids FROM calendar_events WHERE event_date >= CURDATE() ORDER BY event_date ASC");
        $evStmt->execute();
        $futureEvents = $evStmt->fetchAll();

        foreach ($futureEvents as $ev) {
            $gcIds = json_decode($ev['google_event_ids'] ?? '{}', true) ?: [];

            // Skip if this user already has this event synced
            if (isset($gcIds[$userId]))
                continue;

            $datePart = explode(' ', $ev['event_date'])[0];
            $start = $datePart . 'T00:00:00';
            $end = $datePart . 'T23:59:59';
            $colorId = $colorMap[$ev['target_group'] ?? ''] ?? 5;

            $result = createGoogleCalendarEvent($accessToken, $ev['title'], $ev['description'] ?? '', $start, $end, $colorId);

            if (!empty($result['google_event_id'])) {
                $gcIds[$userId] = $result['google_event_id'];
                $pdo->prepare('UPDATE calendar_events SET google_event_ids = ? WHERE id = ?')
                    ->execute([json_encode($gcIds), $ev['id']]);
            }
        }
    } catch (Exception $syncErr) {
        // Don't block the linking process if retroactive sync fails
    }

    header('Location: ' . $FRONTEND_URL . '?google=success#calendar');
} catch (Exception $e) {
    header('Location: ' . $FRONTEND_URL . '?google=error#calendar');
}
exit;
