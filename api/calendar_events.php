<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/google_calendar_helper.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');

// Auto-migrate google_event_ids column
try {
    $pdo->query("SELECT google_event_ids FROM calendar_events LIMIT 1");
} catch (PDOException $e) {
    $pdo->exec("ALTER TABLE calendar_events ADD COLUMN google_event_ids TEXT DEFAULT NULL");
}

switch ($action) {
    case 'list':
        listEvents($auth);
        break;
    case 'create':
        createEvent($auth);
        break;
    case 'update':
        updateEvent($auth);
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

    $stmt = $pdo->prepare('
        SELECT e.id, e.title, e.description, e.event_date, e.target_group, e.created_by, e.created_at, u.user_group as creator_group 
        FROM calendar_events e 
        JOIN users u ON e.created_by = u.id 
        ORDER BY event_date ASC
    ');
    $stmt->execute();

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

    $uStmt = $pdo->prepare('SELECT name, user_group FROM users WHERE id = ?');
    $uStmt->execute([$auth['id']]);
    $creatorUser = $uStmt->fetch();
    $creatorName = $creatorUser['name'] ?? 'Alguien';
    $creatorGroup = $creatorUser['user_group'] ?? 'otros_eventos';

    $targetGroupsArray = explode(',', $creatorGroup);
    $targetGroupStr = trim($targetGroupsArray[0]);
    if (!$targetGroupStr)
        $targetGroupStr = 'otros_eventos';

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO calendar_events (title, description, event_date, target_group, created_by) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$title, $description, $eventDate, $targetGroupStr, $auth['id']]);
        $eventId = $pdo->lastInsertId(); // CAPTURE ID IMMEDIATELY

        $msgTitle = $title;
        if (strlen($msgTitle) > 30)
            $msgTitle = mb_substr($msgTitle, 0, 30) . '...';

        $msg = "{$creatorName} agendó un nuevo evento general: '{$msgTitle}'";

        $notifStmt = $pdo->prepare('INSERT INTO notifications (user_id, message) SELECT id, ? FROM users WHERE id != ?');
        $notifStmt->execute([$msg, $auth['id']]);

        $pdo->commit();

        try {
            require_once 'google_calendar_helper.php';
            // Map group to Google Calendar color ID
            $colorMap = ['emergencias' => 11, 'actividades' => 7, 'otros_eventos' => 5, 'soporte_oficina' => 3, 'superintendencia' => 10];
            $googleColorId = $colorMap[$targetGroupStr] ?? 5;
            // Extract just the date part (eventDate may contain time after space)
            $datePart = explode(' ', $eventDate)[0];
            $start = $datePart . 'T00:00:00';
            $endDT = $datePart . 'T23:59:59';
            // Push globally
            $googleIds = pushEventToGroup($pdo, ['todos'], $title, $description, $start, $endDT, $googleColorId);
            if (!empty($googleIds)) {
                $pdo->prepare('UPDATE calendar_events SET google_event_ids = ? WHERE id = ?')
                    ->execute([json_encode($googleIds), $eventId]);
            }
        } catch (Exception $gcErr) {
            // Don't fail if Google Calendar push fails
        }

        jsonResponse(['message' => 'Evento creado y notificado exitosamente.'], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Error al guardar el evento y notificaciones.', 'details' => $e->getMessage()], 500);
    }
}

function updateEvent($auth)
{
    global $pdo;
    if (getMethod() !== 'PUT')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $id = (int) getParam('id', 0);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('SELECT * FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);
    $ev = $stmt->fetch();

    if (!$ev)
        jsonResponse(['error' => 'Evento no encontrado.'], 404);
    if ($auth['role'] !== 'admin' && $ev['created_by'] != $auth['id']) {
        jsonResponse(['error' => 'No tienes permiso para editar este evento.'], 403);
    }

    $data = getJsonBody();
    $title = trim($data['title'] ?? $ev['title']);
    $description = trim($data['description'] ?? $ev['description']);
    $eventDate = $data['event_date'] ?? $ev['event_date'];
    $targetGroupStr = $ev['target_group'];

    if (!$title || !$eventDate) {
        jsonResponse(['error' => 'Título y fecha son obligatorios.'], 400);
    }

    // Delete old instances from Google Calendar
    $gcIds = json_decode($ev['google_event_ids'] ?? '{}', true) ?: [];
    foreach ($gcIds as $userId => $googleEventId) {
        $accessToken = getValidAccessToken($pdo, (int) $userId);
        if ($accessToken && $googleEventId) {
            $ch = curl_init("https://www.googleapis.com/calendar/v3/calendars/primary/events/" . urlencode($googleEventId));
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => 'DELETE',
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken]
            ]);
            curl_exec($ch);
            curl_close($ch);
        }
    }

    $stmt = $pdo->prepare('UPDATE calendar_events SET title=?, description=?, event_date=?, target_group=?, google_event_ids=NULL WHERE id=?');
    $stmt->execute([$title, $description, $eventDate, $targetGroupStr, $id]);

    // Re-push to Google Calendar globally
    try {
        require_once 'google_calendar_helper.php';
        $colorMap = ['emergencias' => 11, 'actividades' => 7, 'otros_eventos' => 5, 'soporte_oficina' => 3, 'superintendencia' => 10];
        $googleColorId = $colorMap[$targetGroupStr] ?? 5;
        $datePart = explode(' ', $eventDate)[0];
        $start = $datePart . 'T00:00:00';
        $endDT = $datePart . 'T23:59:59';
        $googleIds = pushEventToGroup($pdo, ['todos'], $title, $description, $start, $endDT, $googleColorId);

        if (!empty($googleIds)) {
            $pdo->prepare('UPDATE calendar_events SET google_event_ids = ? WHERE id = ?')
                ->execute([json_encode($googleIds), $id]);
        }
    } catch (Exception $e) {
    }

    jsonResponse(['message' => 'Evento actualizado exitosamente.']);
}

function deleteEvent($auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $id = (int) getParam('id', 0);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('SELECT * FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);
    $ev = $stmt->fetch();

    if (!$ev)
        jsonResponse(['error' => 'Evento no encontrado.'], 404);

    if ($auth['role'] !== 'admin' && $ev['created_by'] != $auth['id']) {
        jsonResponse(['error' => 'No tienes permiso para eliminar este evento.'], 403);
    }

    // Delete from Google Calendar for each linked user
    $gcIds = json_decode($ev['google_event_ids'] ?? '{}', true) ?: [];
    foreach ($gcIds as $userId => $googleEventId) {
        $accessToken = getValidAccessToken($pdo, (int) $userId);
        if ($accessToken && $googleEventId) {
            $ch = curl_init("https://www.googleapis.com/calendar/v3/calendars/primary/events/" . urlencode($googleEventId));
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => 'DELETE',
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken]
            ]);
            curl_exec($ch);
            curl_close($ch);
        }
    }

    $stmt = $pdo->prepare('DELETE FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);

    jsonResponse(['message' => 'Evento eliminado.']);
}
