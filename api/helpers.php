<?php
// =========================================
// Helper functions: JWT, CORS, Response
// =========================================

// CORS headers
function setCorsHeaders() {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// JSON response
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Get JSON body
function getJsonBody() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

// =========================================
// Simple JWT implementation (HMAC-SHA256)
// =========================================
function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function createJWT($payload, $secret, $expiresIn = 604800) {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload['iat'] = time();
    $payload['exp'] = time() + $expiresIn;

    $headerEncoded = base64UrlEncode(json_encode($header));
    $payloadEncoded = base64UrlEncode(json_encode($payload));
    $signature = base64UrlEncode(hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true));

    return "$headerEncoded.$payloadEncoded.$signature";
}

function verifyJWT($token, $secret) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$headerEncoded, $payloadEncoded, $signatureEncoded] = $parts;
    $signature = base64UrlEncode(hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true));

    if (!hash_equals($signature, $signatureEncoded)) return null;

    $payload = json_decode(base64UrlDecode($payloadEncoded), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) return null;

    return $payload;
}

// Authenticate request
function authenticate() {
    global $JWT_SECRET;

    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!preg_match('/^Bearer\s+(.+)$/', $authHeader, $matches)) {
        jsonResponse(['error' => 'Token de acceso requerido.'], 401);
    }

    $user = verifyJWT($matches[1], $JWT_SECRET);
    if (!$user) {
        jsonResponse(['error' => 'Token inválido o expirado.'], 401);
    }

    return $user;
}

// Require admin role
function requireAdmin($user) {
    if ($user['role'] !== 'admin') {
        jsonResponse(['error' => 'Acceso restringido. Solo administradores.'], 403);
    }
}

// Get request method
function getMethod() {
    return $_SERVER['REQUEST_METHOD'];
}

// Get query param
function getParam($key, $default = null) {
    return $_GET[$key] ?? $default;
}
