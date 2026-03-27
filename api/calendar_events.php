<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');

switch ($action) {
    case 'list':
        listEvents($auth);
        break;
    case 'create':
        createEvent($auth);
        break;
    case 'delete':
        deleteEvent($auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listEvents($auth)
{
    global $pdo;

    // Si es admin o superintendencia, ve todos. Si no, ve los de su grupo o los marcados como "todos"
    if ($auth['role'] === 'admin') {
        $stmt = $pdo->prepare('SELECT id, title, description, event_date, target_group, created_by, created_at FROM calendar_events ORDER BY event_date ASC');
        $stmt->execute();
    } else {
        // Necesitamos saber el grupo del usuario
        $uStmt = $pdo->prepare('SELECT user_group FROM users WHERE id = ?');
        $uStmt->execute([$auth['id']]);
        $user = $uStmt->fetch();
        $group = $user ? $user['user_group'] : '';

        $stmt = $pdo->prepare('SELECT id, title, description, event_date, target_group, created_by, created_at FROM calendar_events WHERE target_group = ? OR target_group = "todos" ORDER BY event_date ASC');
        $stmt->execute([$group]);
    }

    jsonResponse(['events' => $stmt->fetchAll()]);
}

function createEvent($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $data = getJsonBody();
    $title = trim($data['title'] ?? '');
    $description = trim($data['description'] ?? '');
    $eventDate = $data['event_date'] ?? '';

    if ($auth['role'] !== 'admin') {
        $uStmt = $pdo->prepare('SELECT user_group FROM users WHERE id = ?');
        $uStmt->execute([$auth['id']]);
        $user = $uStmt->fetch();
        $targetGroup = $user ? $user['user_group'] : 'otros_eventos';
    } else {
        $targetGroup = $data['target_group'] ?? 'todos';
    }

    if (!$title || !$eventDate) {
        jsonResponse(['error' => 'Título y fecha son obligatorios.'], 400);
    }

    $stmt = $pdo->prepare('INSERT INTO calendar_events (title, description, event_date, target_group, created_by) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$title, $description, $eventDate, $targetGroup, $auth['id']]);

    jsonResponse(['message' => 'Evento creado exitosamente.'], 201);
}

function deleteEvent($auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $id = (int) getParam('id', 0);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('SELECT created_by FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);
    $ev = $stmt->fetch();

    if (!$ev)
        jsonResponse(['error' => 'Evento no encontrado.'], 404);

    if ($auth['role'] !== 'admin' && $ev['created_by'] != $auth['id']) {
        jsonResponse(['error' => 'No tienes permiso para eliminar este evento.'], 403);
    }

    $stmt = $pdo->prepare('DELETE FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);

    jsonResponse(['message' => 'Evento eliminado.']);
}
