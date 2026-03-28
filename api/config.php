<?php
// =========================================
// Database Configuration
// =========================================
date_default_timezone_set('America/Guayaquil');

$DB_HOST = getenv('DB_HOST') ?: 'localhost';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_NAME = getenv('DB_NAME') ?: 'u434851126_seguridad';
$DB_USER = getenv('DB_USER') ?: 'u434851126_adminseguridad';
$DB_PASS = getenv('DB_PASS') ?: 'Seguridad@2026';

$JWT_SECRET = getenv('JWT_SECRET') ?: 'iccp_secret_key_change_in_production';
$JWT_EXPIRES = 60 * 60 * 24 * 7; // 7 days

// Google OAuth — credentials loaded from .env.local (not committed to git)
$envFile = __DIR__ . '/.env.local';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0)
            continue;
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            $_ENV[trim($key)] = trim($val);
        }
    }
}
$GOOGLE_CLIENT_ID = $_ENV['GOOGLE_CLIENT_ID'] ?? getenv('GOOGLE_CLIENT_ID') ?: '';
$GOOGLE_CLIENT_SECRET = $_ENV['GOOGLE_CLIENT_SECRET'] ?? getenv('GOOGLE_CLIENT_SECRET') ?: '';
$GOOGLE_REDIRECT_URI = $_ENV['GOOGLE_REDIRECT_URI'] ?? getenv('GOOGLE_REDIRECT_URI') ?: (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME']) . '/google_callback.php';

$UPLOAD_DIR = __DIR__ . '/uploads/';
$MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

$FRONTEND_URL = getenv('FRONTEND_URL') ?: 'https://seguridad.jiyanedesign.com';

// DB Connection
try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a la base de datos.']);
    exit;
}

// Ensure uploads directory exists
if (!is_dir($UPLOAD_DIR)) {
    mkdir($UPLOAD_DIR, 0755, true);
}
