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
            $cGroups = explode(',', $creatorGroup);
            foreach ($cGroups as $cg) {
                if (trim($cg))
                    $groupsArray[] = trim($cg);
            }
            $groupsArray = array_unique($groupsArray);

            $conditions = [];
            foreach ($groupsArray as $g) {
                $conditions[] = "FIND_IN_SET(?, user_group)";
            }
            $condSql = !empty($conditions) ? implode(' OR ', $conditions) : "1=0";

            $notifStmt = $pdo->prepare("
                INSERT INTO notifications (user_id, message) 
                SELECT id, ? FROM users 
                WHERE ($condSql) AND id != ?
            ");

            $params = [$msg];
            foreach ($groupsArray as $g) {
                $params[] = $g;
            }
            $params[] = $auth['id'];

            $notifStmt->execute($params);
        }

        $pdo->commit();

        // Map application's target groups to Google Color IDs:
        // 11=Red(Emergencias), 7=Blue(Actividades), 5=Yellow(Otros), 3=Purple(Soporte), 10=Green(Super)
        $colorMap = [
            'emergencias' => 11,
            'actividades' => 7,
            'otros_eventos' => 5,
            'soporte_oficina' => 3,
            'superintendencia' => 10
        ];
        $primaryGroup = (is_array($groupsArray) && count($groupsArray) > 0) ? $groupsArray[0] : 'otros_eventos';
        $googleColorId = $colorMap[$primaryGroup] ?? 5;

        // Push to Google Calendar and store returned event IDs per user
        try {
            $pushGroups = ($targetGroupStr === 'todos') ? ['todos'] : $groupsArray;
            $gcResults = pushEventToGroup($pdo, $pushGroups, $title, $description, $eventDate, null, $googleColorId);

            // Store google_event_ids as JSON: {"userId": "googleEventId"}
            $googleIds = [];
            foreach ($gcResults as $uid => $res) {
                if (!empty($res['google_event_id'])) {
                    $googleIds[$uid] = $res['google_event_id'];
                }
            }
            if (!empty($googleIds)) {
                $eventId = $pdo->lastInsertId();
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
