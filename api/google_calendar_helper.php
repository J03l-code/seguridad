<?php
/**
 * Helper functions for Google Calendar API using native cURL
 * No Composer or external libraries needed!
 */

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
    $stmt = $pdo->prepare('SELECT access_token, refresh_token, expires_at FROM google_tokens WHERE user_id = ?');
    $stmt->execute([$userId]);
    $token = $stmt->fetch();

    if (!$token)
        return null;

    // If token is expired, refresh it
    if (strtotime($token['expires_at']) <= time()) {
        return refreshGoogleToken($pdo, $userId, $token['refresh_token']);
    }

    return $token['access_token'];
}

function createGoogleCalendarEvent($accessToken, $title, $description, $startDateTime, $endDateTime = null)
{
    if (!$endDateTime) {
        $endDateTime = date('c', strtotime($startDateTime) + 3600); // +1 hour
    }

    $event = [
        'summary' => $title,
        'description' => $description ?? '',
        'start' => [
            'dateTime' => date('c', strtotime($startDateTime)),
            'timeZone' => 'America/Mexico_City'
        ],
        'end' => [
            'dateTime' => date('c', strtotime($endDateTime)),
            'timeZone' => 'America/Mexico_City'
        ],
        'reminders' => [
            'useDefault' => false,
            'overrides' => [
                ['method' => 'popup', 'minutes' => 30]
            ]
        ]
    ];

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
        'google_event_id' => $result['id'] ?? null,
        'html_link' => $result['htmlLink'] ?? null
    ];
}

/**
 * Push an event to every linked Google Calendar user in a specific user_group
 */
function pushEventToGroup($pdo, $targetGroups, $title, $description, $startDateTime, $endDateTime = null)
{
    $groups = is_array($targetGroups) ? $targetGroups : explode(',', $targetGroups);
    $placeholders = implode(',', array_fill(0, count($groups), '?'));

    $stmt = $pdo->prepare("SELECT u.id FROM users u 
        INNER JOIN google_tokens gt ON u.id = gt.user_id 
        WHERE u.user_group IN ($placeholders)");
    $stmt->execute($groups);
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $results = [];
    foreach ($userIds as $userId) {
        $accessToken = getValidAccessToken($pdo, $userId);
        if ($accessToken) {
            $result = createGoogleCalendarEvent($accessToken, $title, $description, $startDateTime, $endDateTime);
            $results[$userId] = $result;
        }
    }
    return $results;
}
