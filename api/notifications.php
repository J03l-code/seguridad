<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');

switch ($action) {
    case 'list':
        listNotifications($auth);
        break;
    case 'mark_read':
        markRead($auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listNotifications($auth)
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $stmt->execute([$auth['id']]);
    $items = $stmt->fetchAll();

    // Contar las no leídas
    $stmt2 = $pdo->prepare('SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0');
    $stmt2->execute([$auth['id']]);
    $unreadCount = $stmt2->fetch()['unread'] ?? 0;

    jsonResponse(['notifications' => $items, 'unread' => $unreadCount]);
}

function markRead($auth)
{
    global $pdo;
    if (getMethod() !== 'POST') {
        jsonResponse(['error' => 'Método no permitido.'], 405);
    }

    // Marcar todas las notificaciones del usuario como leídas
    $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?');
    $stmt->execute([$auth['id']]);

    jsonResponse(['message' => 'Notificaciones marcadas como leídas.']);
}
