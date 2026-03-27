<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

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
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listTasks()
{
    global $pdo;
    $sql = "SELECT t.*, u1.name as creator_name, u2.name as assignee_name, u2.avatar as assignee_avatar,
                d.name as department_name, d.color as department_color,
                (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) as attachment_count
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            LEFT JOIN departments d ON t.department_id = d.id
            WHERE 1=1";
    $params = [];

    if ($dept = getParam('department_id')) {
        $sql .= ' AND t.department_id = ?';
        $params[] = $dept;
    }
    if ($status = getParam('status')) {
        $sql .= ' AND t.status = ?';
        $params[] = $status;
    }
    if ($assigned = getParam('assigned_to')) {
        $sql .= ' AND t.assigned_to = ?';
        $params[] = $assigned;
    }
    if ($priority = getParam('priority')) {
        $sql .= ' AND t.priority = ?';
        $params[] = $priority;
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

    $stmt = $pdo->prepare("SELECT t.*, u1.name as creator_name, u2.name as assignee_name, d.name as department_name, d.color as department_color
        FROM tasks t LEFT JOIN users u1 ON t.created_by = u1.id LEFT JOIN users u2 ON t.assigned_to = u2.id
        LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    if (!$task)
        jsonResponse(['error' => 'Tarea no encontrada.'], 404);

    $att = $pdo->prepare("SELECT ta.*, u.name as uploader_name FROM task_attachments ta LEFT JOIN users u ON ta.uploaded_by = u.id WHERE ta.task_id = ? ORDER BY ta.created_at DESC");
    $att->execute([$id]);

    $act = $pdo->prepare("SELECT al.*, u.name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.task_id = ? ORDER BY al.created_at DESC LIMIT 20");
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
    $deptId = $data['department_id'] ?? null;
    if (!$title || !$deptId)
        jsonResponse(['error' => 'Título y departamento son obligatorios.'], 400);

    $stmt = $pdo->prepare("INSERT INTO tasks (title, description, status, priority, department_id, created_by, assigned_to, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $title,
        $data['description'] ?? null,
        $data['status'] ?? 'todo',
        $data['priority'] ?? 'medium',
        $deptId,
        $auth['id'],
        $data['assigned_to'] ?: null,
        $data['due_date'] ?: null
    ]);
    $taskId = $pdo->lastInsertId();

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

    $pdo->prepare("UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
        status = COALESCE(?, status), priority = COALESCE(?, priority),
        assigned_to = ?, due_date = ? WHERE id = ?")
        ->execute([
            $data['title'] ?? null,
            $data['description'] ?? null,
            $data['status'] ?? null,
            $data['priority'] ?? null,
            isset($data['assigned_to']) ? ($data['assigned_to'] ?: null) : $old['assigned_to'],
            isset($data['due_date']) ? ($data['due_date'] ?: null) : $old['due_date'],
            $id
        ]);

    if (!empty($data['status']) && $data['status'] !== $old['status']) {
        $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
            ->execute([$id, $auth['id'], 'status_changed', "Estado: \"{$old['status']}\" → \"{$data['status']}\""]);
    }
    if (!empty($data['assigned_to']) && $data['assigned_to'] != $old['assigned_to']) {
        $u = $pdo->prepare('SELECT name FROM users WHERE id = ?');
        $u->execute([$data['assigned_to']]);
        $nm = $u->fetchColumn() ?: 'Desconocido';
        $pdo->prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)')
            ->execute([$id, $auth['id'], 'assigned', "Asignada a $nm"]);
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
