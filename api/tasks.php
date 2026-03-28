<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/google_calendar_helper.php';
setCorsHeaders();
$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

// Zero-downtime auto-migration for target_group
try {
    $pdo->query("SELECT target_group FROM tasks LIMIT 1");
} catch (PDOException $e) {
    try {
        $pdo->exec("ALTER TABLE tasks ADD COLUMN target_group VARCHAR(50) DEFAULT NULL");
        $pdo->exec("ALTER TABLE tasks MODIFY department_id INT NULL");
    } catch (Exception $ex) {
    }
}

switch ($action) {
    case 'list':
        listTasks();
        break;
    case 'get':
        getTask($id);
        break;
    case 'create':
        createTask($auth);
        break;
    case 'update':
        updateTask($id, $auth);
        break;
    case 'delete':
        deleteTask($id, $auth);
        break;
    case 'upload':
        uploadFiles($id, $auth);
        break;
    case 'comment':
        addComment($auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listTasks()
{
    global $pdo;
    $sql = "SELECT t.*, u1.name as creator_name,
                (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) as attachment_count
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            WHERE 1=1";
    $params = [];

    if ($status = getParam('status')) {
        $sql .= ' AND t.status = ?';
        $params[] = $status;
    }
    if ($priority = getParam('priority')) {
        $sql .= ' AND t.priority = ?';
        $params[] = $priority;
    }
    if ($target_group = getParam('target_group')) {
        $sql .= ' AND t.target_group = ?';
        $params[] = $target_group;
    }
    if ($search = getParam('search')) {
        $sql .= ' AND (t.title LIKE ? OR t.description LIKE ?)';
        $params[] = "%$search%";
        $params[] = "%$search%";
    }

    $sql .= " ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    jsonResponse(['tasks' => $stmt->fetchAll()]);
}

function getTask($id)
{
    global $pdo;
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare("SELECT t.*, u1.name as creator_name
        FROM tasks t LEFT JOIN users u1 ON t.created_by = u1.id WHERE t.id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    if (!$task)
        jsonResponse(['error' => 'Tarea no encontrada.'], 404);

    $att = $pdo->prepare("SELECT ta.*, u.name as uploader_name FROM task_attachments ta LEFT JOIN users u ON ta.uploaded_by = u.id WHERE ta.task_id = ? ORDER BY ta.created_at DESC");
    $att->execute([$id]);

    $act = $pdo->prepare("SELECT al.*, u.name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.task_id = ? ORDER BY al.created_at DESC LIMIT 100");
    $act->execute([$id]);

    jsonResponse(['task' => $task, 'attachments' => $att->fetchAll(), 'activity' => $act->fetchAll()]);
}

function createTask($auth)
{
    global $pdo, $UPLOAD_DIR;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    // Support both JSON and multipart/form-data
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($contentType, 'multipart/form-data') !== false) {
        $data = $_POST;
    } else {
        $data = getJsonBody();
    }

    $title = trim($data['title'] ?? '');
    $targetGroup = $data['target_group'] ?? null;
    if (!$title || !$targetGroup)
        jsonResponse(['error' => 'Título y departamento son obligatorios.'], 400);


    $stmt = $pdo->prepare("INSERT INTO tasks (title, description, status, priority, target_group, created_by, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $title,
        $data['description'] ?? null,
        $data['status'] ?? 'todo',
        $data['priority'] ?? 'medium',
        $targetGroup,
        $auth['id'],
        $data['due_date'] ?: null
    ]);
    $taskId = $pdo->lastInsertId();

    $deptUsers = $pdo->prepare('SELECT id, email, name, user_group FROM users');
    $deptUsers->execute();
    $allUsers = $deptUsers->fetchAll();

    $usersInDept = [];
    foreach ($allUsers as $u) {
        $uGroups = explode(',', $u['user_group'] ?: 'otros_eventos');
        if (in_array(trim($targetGroup), $uGroups)) {
            $usersInDept[] = $u;
        }
    }

    if (!empty($usersInDept)) {
        $notifStmt = $pdo->prepare("INSERT INTO notifications (user_id, message) VALUES (?, ?)");
        $groupLabels = [
            'emergencias' => 'Emergencias',
            'actividades' => 'Actividades',
            'otros_eventos' => 'Otros Eventos',
            'soporte_oficina' => 'Soporte de Oficina',
            'superintendencia' => 'Superintendencia'
        ];
        $label = $groupLabels[$targetGroup] ?? $targetGroup;
        $priority = $data['priority'] ?? 'medium';

        foreach ($usersInDept as $u) {
            if ($u['id'] != $auth['id']) {
                $notifStmt->execute([$u['id'], "{$auth['name']} asignó una nueva tarea al departamento de '$label'"]);

                // Feature 5: Urgent Email Notifications
                if ($priority === 'urgent' && !empty($u['email'])) {
                    $subject = "URGENTE: Nueva Tarea Asignada - ICCP";
                    $desc = $data['description'] ?? 'Sin descripción';
                    $message = "Hola {$u['name']},\n\nSe ha asignado una nueva tarea URGENTE al departamento de $label.\n\nTítulo: $title\nDescripción: $desc\n\nPor favor, ingresa al sistema ICCP para revisarla lo antes posible.\n\nAtentamente,\nSistema ICCP";
                    $headers = "From: noreply@" . ($_SERVER['HTTP_HOST'] ?? 'iccp.local') . "\r\n";
                    @mail($u['email'], $subject, $message, $headers);
                }
            }
        }
    }

    // Handle file uploads
    if (!empty($_FILES['files'])) {
        $files = $_FILES['files'];
        $count = is_array($files['name']) ? count($files['name']) : 1;
        for ($i = 0; $i < $count; $i++) {
            $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
            $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
            $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
            $type = is_array($files['type']) ? $files['type'][$i] : $files['type'];

            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $filename = time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            move_uploaded_file($tmp, $UPLOAD_DIR . $filename);

            $pdo->prepare("INSERT INTO task_attachments (task_id, filename, original_name, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$taskId, $filename, $name, $size, $type, $auth['id']]);
        }
    }

    $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
        ->execute([$taskId, $auth['id'], 'task_created', "Tarea \"$title\" creada"]);

    // Feature 1: Google Calendar Sync (Tasks -> Calendar)
    if (!empty($data['due_date'])) {
        try {
            $primaryGroup = explode(',', $targetGroup)[0];
            $groupColors = [
                'emergencias' => '11', // Red
                'actividades' => '9', // Blue
                'otros_eventos' => '8', // Gray
                'soporte_oficina' => '5', // Yellow
                'superintendencia' => '10' // Green
            ];
            $colorId = $groupColors[trim($primaryGroup)] ?? '8';

            $calTitle = "🚨 Vence: " . $title;
            $pLabels = ['low' => 'Baja', 'medium' => 'Media', 'high' => 'Alta', 'urgent' => 'URGENTE'];
            $pText = $pLabels[$data['priority'] ?? 'medium'] ?? 'Media';
            $calDesc = "Prioridad: $pText\n\n" . ($data['description'] ?? '');

            $dueTs = strtotime($data['due_date']);
            $endTs = $dueTs + 3600; // 1-hour duration for the deadline alarm event

            $pushRes = pushEventToGroup(
                $pdo,
                $targetGroup,
                $calTitle,
                $calDesc,
                date('Y-m-d H:i:s', $dueTs),
                date('Y-m-d H:i:s', $endTs),
                $colorId
            );

            if (!empty($pushRes)) {
                $gIds = json_encode($pushRes);
                $pdo->prepare('UPDATE tasks SET google_event_ids = ? WHERE id = ?')
                    ->execute([$gIds, $taskId]);
            }
        } catch (Exception $e) {
            // Ignorar para no interrumpir creacion de tarea
        }
    }

    jsonResponse(['message' => 'Tarea creada.', 'task' => ['id' => (int) $taskId, 'title' => $title]], 201);
}

function updateTask($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'PUT')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old)
        jsonResponse(['error' => 'Tarea no encontrada.'], 404);

    $data = getJsonBody();

    $uStmt = $pdo->prepare('SELECT user_group FROM users WHERE id = ?');
    $uStmt->execute([$auth['id']]);
    $uGroup = $uStmt->fetchColumn() ?? '';
    $canManageTasks = ($auth['role'] === 'admin'); // user requested: "tambien permite que todo usuario que tenga el permiso de admin pueda crear una tarea" - let's keep only admin as super bypass, or if they are in the exact target group

    $isInDept = ($old['target_group'] === $uGroup);

    if (!$canManageTasks && !$isInDept) {
        jsonResponse(['error' => 'No tienes permisos sobre esta tarea del organigrama.'], 403);
    }

    if (!$canManageTasks && $isInDept) {
        // Members of the department can only change status
        $allowed = [];
        if (isset($data['status']))
            $allowed['status'] = $data['status'];
        $data = $allowed;
        if (empty($data))
            jsonResponse(['error' => 'Solo puedes cambiar el estado de la tarea de tu departamento.'], 403);
    }

    $pdo->prepare("UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
        status = COALESCE(?, status), priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date) WHERE id = ?")
        ->execute([
            $data['title'] ?? null,
            $data['description'] ?? null,
            $data['status'] ?? null,
            $data['priority'] ?? null,
            $data['due_date'] ?? null,
            $id
        ]);

    if (!empty($data['status']) && $data['status'] !== $old['status']) {
        $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
            ->execute([$id, $auth['id'], 'status_changed', "Estado: \"{$old['status']}\" → \"{$data['status']}\""]);
    }

    jsonResponse(['message' => 'Tarea actualizada.']);
}

function deleteTask($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0)
        jsonResponse(['error' => 'Tarea no encontrada.'], 404);

    jsonResponse(['message' => 'Tarea eliminada.']);
}

function addComment($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);

    $id = (int) getParam('id', 0);
    $data = getJsonBody();
    $comment = trim($data['comment'] ?? '');

    if (!$id || !$comment)
        jsonResponse(['error' => 'ID de tarea y comentario requeridos.'], 400);

    // Verify task exists
    $stmt = $pdo->prepare('SELECT id FROM tasks WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch())
        jsonResponse(['error' => 'Tarea no encontrada.'], 404);

    $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
        ->execute([$id, $auth['id'], 'commented', $comment]);

    jsonResponse(['message' => 'Comentario añadido.']);
}

function uploadFiles($taskId, $auth)
{
    global $pdo, $UPLOAD_DIR;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    if (!$taskId)
        jsonResponse(['error' => 'ID requerido.'], 400);
    if (empty($_FILES['files']))
        jsonResponse(['error' => 'No se enviaron archivos.'], 400);

    $files = $_FILES['files'];
    $count = is_array($files['name']) ? count($files['name']) : 1;
    for ($i = 0; $i < $count; $i++) {
        $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
        $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
        $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
        $type = is_array($files['type']) ? $files['type'][$i] : $files['type'];

        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $filename = time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        move_uploaded_file($tmp, $UPLOAD_DIR . $filename);

        $pdo->prepare("INSERT INTO task_attachments (task_id, filename, original_name, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([$taskId, $filename, $name, $size, $type, $auth['id']]);
    }

    $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
        ->execute([$taskId, $auth['id'], 'file_uploaded', "$count archivo(s) adjunto(s)"]);

    jsonResponse(['message' => 'Archivos adjuntados.', 'count' => $count], 201);
}
