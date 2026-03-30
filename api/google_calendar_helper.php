<?php
/**
 * Helper functions for Google Calendar API using native cURL
 * No Composer or external libraries needed!
 */

function ensureGoogleTokensTable($pdo)
{
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
}

function refreshGoogleToken($pdo, $userId, $refreshToken)
{
    global $GOOGLE_CLIENT_ID, $GOOGLE_CLIENT_SECRET;

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => $GOOGLE_CLIENT_ID,
            'client_secret' => $GOOGLE_CLIENT_SECRET,
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token'
        ]),
        CURLOPT_RETURNTRANSFER => true
    ]);
    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response, true);
    if (isset($data['access_token'])) {
        $expiresAt = date('Y-m-d H:i:s', time() + ($data['expires_in'] ?? 3600));
        $pdo->prepare('UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?')
            ->execute([$data['access_token'], $expiresAt, $userId]);
        return $data['access_token'];
    }
    return null;
}

function getValidAccessToken($pdo, $userId)
{
    ensureGoogleTokensTable($pdo);
    $stmt = $pdo->prepare('SELECT access_token, refresh_token, expires_at FROM google_tokens WHERE user_id = ?');
    $stmt->execute([$userId]);
    $token = $stmt->fetch();

    if (!$token)
        return null;

    // Refresh if expired or near expiry (60s buffer)
    if (strtotime($token['expires_at']) <= time() + 60) {
        return refreshGoogleToken($pdo, $userId, $token['refresh_token']);
    }

    return $token['access_token'];
}

function createGoogleCalendarEvent($accessToken, $title, $description, $startDateTime, $endDateTime = null, $colorId = null, $recurrenceRule = null)
{
    $startTs = strtotime($startDateTime);
    if (!$startTs)
        $startTs = time();

    $endTs = $endDateTime ? strtotime($endDateTime) : $startTs + 3600;
    if (!$endTs)
        $endTs = $startTs + 3600;

    $event = [
        'summary' => $title,
        'description' => $description ?? '',
        'start' => ['dateTime' => date('c', $startTs), 'timeZone' => 'America/Guayaquil'],
        'end' => ['dateTime' => date('c', $endTs), 'timeZone' => 'America/Guayaquil'],
        'reminders' => [
            'useDefault' => false,
            'overrides' => [['method' => 'popup', 'minutes' => 30]]
        ]
    ];

    if ($colorId) {
        $event['colorId'] = (string) $colorId;
    }

    if ($recurrenceRule && is_array($recurrenceRule)) {
        $event['recurrence'] = $recurrenceRule;
    }

    $ch = curl_init('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($event),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json'
        ]
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);
    return [
        'success' => ($httpCode >= 200 && $httpCode < 300),
        'http_code' => $httpCode,
        'google_event_id' => $result['id'] ?? null,
        'html_link' => $result['htmlLink'] ?? null,
        'error' => $result['error']['message'] ?? null
    ];
}

/**
 * Push an event to every linked Google Calendar user in specific groups.
 * If groups contains 'todos', sends to ALL users with a linked token.
 */
function pushEventToGroup($pdo, $targetGroups, $title, $description, $startDateTime, $endDateTime = null, $colorId = null, $recurrenceRule = null)
{
    ensureGoogleTokensTable($pdo);

    $groups = is_array($targetGroups) ? $targetGroups : explode(',', $targetGroups);
    $groups = array_map('trim', $groups);

    if (in_array('todos', $groups)) {
        // Send to every user who has linked their Google Calendar
        $stmt = $pdo->query("SELECT user_id FROM google_tokens");
    } else {
        $conditions = [];
        $params = [];
        foreach ($groups as $g) {
            $conditions[] = "FIND_IN_SET(?, u.user_group)";
            $params[] = $g;
        }
        $condSql = implode(' OR ', $conditions) ?: "1=0";
        $stmt = $pdo->prepare("SELECT gt.user_id FROM google_tokens gt
            INNER JOIN users u ON u.id = gt.user_id
            WHERE $condSql");
        $stmt->execute($params);
    }

    $googleEventIds = [];
    foreach ($stmt as $row) {
        $userId = $row['user_id'];
        $accessToken = getValidAccessToken($pdo, (int) $userId);

        if ($accessToken) {
            $result = createGoogleCalendarEvent($accessToken, $title, $description, $startDateTime, $endDateTime, $colorId, $recurrenceRule);
            $googleEventIds[$userId] = [
                'success' => $result['success'],
                'google_event_id' => $result['google_event_id'] ?? null
            ];
        }
    }
    return $googleEventIds;
}
