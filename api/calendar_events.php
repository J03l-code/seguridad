<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/google_calendar_helper.php';
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

    if ($auth['role'] === 'admin') {
        $stmt = $pdo->prepare('
            SELECT e.id, e.title, e.description, e.event_date, e.target_group, e.created_by, e.created_at, u.user_group as creator_group 
            FROM calendar_events e 
            JOIN users u ON e.created_by = u.id 
            ORDER BY event_date ASC
        ');
        $stmt->execute();
    } else {
        $uStmt = $pdo->prepare('SELECT user_group FROM users WHERE id = ?');
        $uStmt->execute([$auth['id']]);
        $user = $uStmt->fetch();
        $group = $user ? $user['user_group'] : '';

        $stmt = $pdo->prepare('
            SELECT e.id, e.title, e.description, e.event_date, e.target_group, e.created_by, e.created_at, u.user_group as creator_group 
            FROM calendar_events e 
            JOIN users u ON e.created_by = u.id 
            WHERE FIND_IN_SET(?, e.target_group) > 0 OR e.target_group = "todos" OR u.user_group = ? OR e.created_by = ? 
            ORDER BY event_date ASC
        ');
        $stmt->execute([$group, $group, $auth['id']]);
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

    $targetGroupsRaw = $data['target_group'] ?? 'todos';

    if (is_array($targetGroupsRaw)) {
        if (in_array('todos', $targetGroupsRaw)) {
            $targetGroupStr = 'todos';
            $groupsArray = ['todos'];
        } else {
            $targetGroupStr = implode(',', $targetGroupsRaw);
            $groupsArray = $targetGroupsRaw;
        }
    } else {
        $targetGroupStr = trim($targetGroupsRaw);
        $groupsArray = [$targetGroupStr];
    }

    if (!$title || !$eventDate) {
        jsonResponse(['error' => 'Título y fecha son obligatorios.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO calendar_events (title, description, event_date, target_group, created_by) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$title, $description, $eventDate, $targetGroupStr, $auth['id']]);

        // Obtener datos del creador para la notificación
        $uStmt = $pdo->prepare('SELECT name, user_group FROM users WHERE id = ?');
        $uStmt->execute([$auth['id']]);
        $creatorUser = $uStmt->fetch();
        $creatorName = $creatorUser['name'] ?? 'Alguien';
        $creatorGroup = $creatorUser['user_group'] ?? '';

        $msgTitle = $title;
        if (strlen($msgTitle) > 30)
            $msgTitle = mb_substr($msgTitle, 0, 30) . '...';

        $friendlyTarget = implode(', ', array_map(function ($g) {
            return str_replace('_', ' ', $g);
        }, $groupsArray));
        $msg = "{$creatorName} agendó '{$msgTitle}' para {$friendlyTarget}";

        if ($targetGroupStr === 'todos') {
            $notifStmt = $pdo->prepare('INSERT INTO notifications (user_id, message) SELECT id, ? FROM users WHERE id != ?');
            $notifStmt->execute([$msg, $auth['id']]);
        } else {
            $groupsArray[] = $creatorGroup;
            $groupsArray = array_unique($groupsArray);
            $placeholders = implode(',', array_fill(0, count($groupsArray), '?'));

            $notifStmt = $pdo->prepare("
                INSERT INTO notifications (user_id, message) 
                SELECT id, ? FROM users 
                WHERE user_group IN ($placeholders) AND id != ?
            ");

            $params = [$msg];
            foreach ($groupsArray as $g)
                $params[] = $g;
            $params[] = $auth['id'];

            $notifStmt->execute($params);
        }

        $pdo->commit();

        // Push to Google Calendar for all linked users in target groups
        try {
            if ($targetGroupStr === 'todos') {
                $allGroups = ['emergencias', 'actividades', 'otros_eventos', 'soporte_oficina', 'superintendencia'];
                pushEventToGroup($pdo, $allGroups, $title, $description, $eventDate);
            } else {
                pushEventToGroup($pdo, $groupsArray, $title, $description, $eventDate);
            }
        } catch (Exception $gcErr) {
            // Don't fail the main request if Google Calendar push fails
        }

        jsonResponse(['message' => 'Evento creado y notificado exitosamente.'], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Error al guardar el evento y notificaciones.', 'details' => $e->getMessage()], 500);
    }
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
