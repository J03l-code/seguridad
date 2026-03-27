<?php
/**
 * Google OAuth2 Callback — Receives auth code and stores tokens
 */
require_once __DIR__ . '/config.php';

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

    header('Location: ' . $FRONTEND_URL . '?google=success#calendar');
} catch (Exception $e) {
    header('Location: ' . $FRONTEND_URL . '?google=error#calendar');
}
exit;
