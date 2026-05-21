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
    case 'subscribe':
        subscribePush($auth);
        break;
    case 'vapid_key':
        getVapidKey($auth);
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

function subscribePush($auth)
{
    global $pdo;
    if (getMethod() !== 'POST') {
        jsonResponse(['error' => 'Método no permitido.'], 405);
    }

    $data = getJsonBody();
    $endpoint = $data['endpoint'] ?? null;
    $p256dh = $data['keys']['p256dh'] ?? null;
    $authKey = $data['keys']['auth'] ?? null;

    if (!$endpoint || !$p256dh || !$authKey) {
        jsonResponse(['error' => 'Faltan parámetros de suscripción.'], 400);
    }

    // Guardar o actualizar la suscripción en la base de datos
    $stmt = $pdo->prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) 
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE user_id = ?, p256dh = ?, auth = ?');
    $stmt->execute([$auth['id'], $endpoint, $p256dh, $authKey, $auth['id'], $p256dh, $authKey]);

    jsonResponse(['message' => 'Suscripción Web Push guardada con éxito.']);
}

function getVapidKey($auth)
{
    global $VAPID_PUBLIC_KEY;
    jsonResponse(['publicKey' => $VAPID_PUBLIC_KEY]);
}
