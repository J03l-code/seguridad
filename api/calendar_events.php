<?php
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR, E_PARSE])) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => "CRASH: " . $error['message'] . " in " . basename($error['file']) . ":" . $error['line']]);
        exit;
    }
});

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

// Auto-migrate recurrence column
try {
    $pdo->query("SELECT recurrence FROM calendar_events LIMIT 1");
} catch (PDOException $e) {
    $pdo->exec("ALTER TABLE calendar_events ADD COLUMN recurrence VARCHAR(50) DEFAULT NULL");
}

// Auto-migrate assigned_to column
try {
    $pdo->query("SELECT assigned_to FROM calendar_events LIMIT 1");
} catch (PDOException $e) {
    $pdo->exec("ALTER TABLE calendar_events ADD COLUMN assigned_to INT DEFAULT NULL");
    $pdo->exec("ALTER TABLE calendar_events ADD CONSTRAINT fk_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL");
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
        SELECT e.id, e.title, e.description, e.event_date, e.target_group, e.created_by, e.created_at, e.recurrence, e.assigned_to, u.user_group as creator_group, u.name as creator_name, a.name as assigned_name
        FROM calendar_events e 
        JOIN users u ON e.created_by = u.id 
        LEFT JOIN users a ON e.assigned_to = a.id
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

    $recurrence = $data['recurrence'] ?? null;
    if ($recurrence === 'none' || !$recurrence)
        $recurrence = null;

    $assignedTo = !empty($data['assigned_to']) ? (int) $data['assigned_to'] : null;

    $uStmt = $pdo->prepare('SELECT name, user_group, role FROM users WHERE id = ?');
    $uStmt->execute([$auth['id']]);
    $creatorUser = $uStmt->fetch();
    $creatorName = $creatorUser['name'] ?? 'Alguien';
    $creatorGroup = $creatorUser['user_group'] ?? 'otros_eventos';

    $targetGroupStr = 'otros_eventos';
    if ($creatorUser['role'] === 'admin' && !empty($data['target_group'])) {
        $targetGroupStr = trim($data['target_group']);
    } else {
        $targetGroupsArray = explode(',', $creatorGroup);
        $targetGroupStr = trim($targetGroupsArray[0]);
    }
    if (!$targetGroupStr)
        $targetGroupStr = 'otros_eventos';

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO calendar_events (title, description, event_date, target_group, created_by, recurrence, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$title, $description, $eventDate, $targetGroupStr, $auth['id'], $recurrence, $assignedTo]);
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

            $rrule = null;
            if ($recurrence === 'daily_14')
                $rrule = ['RRULE:FREQ=DAILY;COUNT=14'];
            else if ($recurrence === 'weekly_12')
                $rrule = ['RRULE:FREQ=WEEKLY;COUNT=12'];
            else if ($recurrence === 'monthly_6')
                $rrule = ['RRULE:FREQ=MONTHLY;COUNT=6'];

            // Push globally
            $googleIds = pushEventToGroup($pdo, ['todos'], $title, $description, $start, $endDT, $googleColorId, $rrule);
            // Extract only the google_event_id strings for storage
            $cleanIds = [];
            foreach ($googleIds as $uid => $res) {
                if (!empty($res['google_event_id'])) {
                    $cleanIds[$uid] = $res['google_event_id'];
                }
            }
            if (!empty($cleanIds)) {
                $pdo->prepare('UPDATE calendar_events SET google_event_ids = ? WHERE id = ?')
                    ->execute([json_encode($cleanIds), $eventId]);
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

    $assignedTo = isset($data['assigned_to']) ? ($data['assigned_to'] ? (int) $data['assigned_to'] : null) : $ev['assigned_to'];

    $targetGroupStr = $ev['target_group'];
    if ($auth['role'] === 'admin' && !empty($data['target_group'])) {
        $targetGroupStr = trim($data['target_group']);
    }

    if (!$title || !$eventDate) {
        jsonResponse(['error' => 'Título y fecha son obligatorios.'], 400);
    }

    // Delete old instances from Google Calendar
    $gcIds = json_decode($ev['google_event_ids'] ?? '{}', true) ?: [];
    foreach ($gcIds as $userId => $val) {
        $googleEventId = is_array($val) ? ($val['google_event_id'] ?? null) : $val;
        if (!$googleEventId || !is_scalar($googleEventId))
            continue;

        $accessToken = getValidAccessToken($pdo, (int) $userId);
        if ($accessToken) {
            $ch = curl_init("https://www.googleapis.com/calendar/v3/calendars/primary/events/" . urlencode((string) $googleEventId));
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => 'DELETE',
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken]
            ]);
            curl_exec($ch);
            curl_close($ch);
        }
    }

    $stmt = $pdo->prepare('UPDATE calendar_events SET title=?, description=?, event_date=?, target_group=?, assigned_to=?, google_event_ids=NULL WHERE id=?');
    $stmt->execute([$title, $description, $eventDate, $targetGroupStr, $assignedTo, $id]);

    // Re-push to Google Calendar globally
    try {
        $colorMap = ['emergencias' => 11, 'actividades' => 7, 'otros_eventos' => 5, 'soporte_oficina' => 3, 'superintendencia' => 10];
        $googleColorId = $colorMap[$targetGroupStr] ?? 5;
        $datePart = explode(' ', $eventDate)[0];
        $start = $datePart . 'T00:00:00';
        $endDT = $datePart . 'T23:59:59';

        $rrule = null;
        $recurrence = $ev['recurrence'] ?? null;
        if ($recurrence === 'daily_14')
            $rrule = ['RRULE:FREQ=DAILY;COUNT=14'];
        else if ($recurrence === 'weekly_12')
            $rrule = ['RRULE:FREQ=WEEKLY;COUNT=12'];
        else if ($recurrence === 'monthly_6')
            $rrule = ['RRULE:FREQ=MONTHLY;COUNT=6'];

        $googleIds = pushEventToGroup($pdo, ['todos'], $title, $description, $start, $endDT, $googleColorId, $rrule);
        $cleanIds = [];
        foreach ($googleIds as $uid => $res) {
            if (!empty($res['google_event_id'])) {
                $cleanIds[$uid] = $res['google_event_id'];
            }
        }
        if (!empty($cleanIds)) {
            $pdo->prepare('UPDATE calendar_events SET google_event_ids = ? WHERE id = ?')
                ->execute([json_encode($cleanIds), $id]);
        }
    } catch (Exception $e) {
    }

    jsonResponse(['message' => 'Evento actualizado exitosamente.']);
}

function deleteEvent($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $data = getJsonBody();
    $idStr = $data['id'] ?? '';
    if (!$idStr)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $id = (int) $idStr;

    $stmt = $pdo->prepare('SELECT * FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);
    $ev = $stmt->fetch();

    if (!$ev)
        jsonResponse(['error' => 'Evento no encontrado.'], 404);

    if ($auth['role'] !== 'admin' && $ev['created_by'] != $auth['id']) {
        jsonResponse(['error' => 'No tienes permiso para eliminar este evento.'], 403);
    }

    // Delete from Google Calendar for each linked user
    try {
        $gcIds = json_decode($ev['google_event_ids'] ?? '{}', true) ?: [];
        foreach ($gcIds as $userId => $val) {
            // Handle both old nested format and new flat format
            $googleEventId = is_array($val) ? ($val['google_event_id'] ?? null) : $val;
            if (!$googleEventId || !is_scalar($googleEventId))
                continue;
            $accessToken = getValidAccessToken($pdo, (int) $userId);
            if ($accessToken) {
                $ch = curl_init("https://www.googleapis.com/calendar/v3/calendars/primary/events/" . urlencode((string) $googleEventId));
                curl_setopt_array($ch, [
                    CURLOPT_CUSTOMREQUEST => 'DELETE',
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken]
                ]);
                curl_exec($ch);
                curl_close($ch);
            }
        }
    } catch (Exception $e) {
        // Don't fail if Google Calendar cleanup fails
    }

    $stmt = $pdo->prepare('DELETE FROM calendar_events WHERE id = ?');
    $stmt->execute([$id]);

    jsonResponse(['message' => 'Evento eliminado.']);
}
