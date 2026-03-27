<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

switch ($action) {
    case 'list':
        listDepartments();
        break;
    case 'get':
        getDepartment($id);
        break;
    case 'create':
        createDepartment($auth);
        break;
    case 'update':
        updateDepartment($id, $auth);
        break;
    case 'delete':
        deleteDepartment($id, $auth);
        break;
    case 'add_member':
        addMember($id, $auth);
        break;
    case 'remove_member':
        removeMember($id, $auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listDepartments()
{
    global $pdo;
    $stmt = $pdo->query("
        SELECT d.*, u.name as creator_name,
            (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id) as member_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id) as task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status = 'done') as completed_count
        FROM departments d
        LEFT JOIN users u ON d.created_by = u.id
        ORDER BY d.created_at DESC
    ");
    jsonResponse(['departments' => $stmt->fetchAll()]);
}

function getDepartment($id)
{
    global $pdo;
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare("SELECT d.*, u.name as creator_name FROM departments d LEFT JOIN users u ON d.created_by = u.id WHERE d.id = ?");
    $stmt->execute([$id]);
    $dept = $stmt->fetch();
    if (!$dept)
        jsonResponse(['error' => 'Departamento no encontrado.'], 404);

    $stmt2 = $pdo->prepare("SELECT u.id, u.name, u.email, u.role, u.avatar, dm.joined_at FROM department_members dm JOIN users u ON dm.user_id = u.id WHERE dm.department_id = ? ORDER BY dm.joined_at ASC");
    $stmt2->execute([$id]);

    jsonResponse(['department' => $dept, 'members' => $stmt2->fetchAll()]);
}

function createDepartment($auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);

    $data = getJsonBody();
    $name = trim($data['name'] ?? '');
    if (!$name)
        jsonResponse(['error' => 'El nombre es obligatorio.'], 400);

    $desc = $data['description'] ?? null;
    $color = $data['color'] ?? '#2d3561';

    $stmt = $pdo->prepare('INSERT INTO departments (name, description, color, created_by) VALUES (?, ?, ?, ?)');
    $stmt->execute([$name, $desc, $color, $auth['id']]);
    $deptId = $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO department_members (department_id, user_id) VALUES (?, ?)')->execute([$deptId, $auth['id']]);
    $pdo->prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')->execute([$auth['id'], 'department_created', "Departamento \"$name\" creado"]);

    jsonResponse(['message' => 'Departamento creado.', 'department' => ['id' => (int) $deptId, 'name' => $name]], 201);
}

function updateDepartment($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'PUT')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $data = getJsonBody();
    $stmt = $pdo->prepare('UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description), color = COALESCE(?, color) WHERE id = ?');
    $stmt->execute([$data['name'] ?? null, $data['description'] ?? null, $data['color'] ?? null, $id]);

    jsonResponse(['message' => 'Departamento actualizado.']);
}

function deleteDepartment($id, $auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $stmt = $pdo->prepare('DELETE FROM departments WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0)
        jsonResponse(['error' => 'Departamento no encontrado.'], 404);

    jsonResponse(['message' => 'Departamento eliminado.']);
}

function addMember($deptId, $auth)
{
    global $pdo;
    if (getMethod() !== 'POST')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);

    $data = getJsonBody();
    $userId = $data['userId'] ?? null;
    if (!$deptId || !$userId)
        jsonResponse(['error' => 'Datos incompletos.'], 400);

    $check = $pdo->prepare('SELECT id FROM department_members WHERE department_id = ? AND user_id = ?');
    $check->execute([$deptId, $userId]);
    if ($check->fetch())
        jsonResponse(['error' => 'El usuario ya es miembro.'], 409);

    $pdo->prepare('INSERT INTO department_members (department_id, user_id) VALUES (?, ?)')->execute([$deptId, $userId]);
    jsonResponse(['message' => 'Miembro agregado.'], 201);
}

function removeMember($deptId, $auth)
{
    global $pdo;
    if (getMethod() !== 'DELETE')
        jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);

    $userId = getParam('user_id');
    if (!$deptId || !$userId)
        jsonResponse(['error' => 'Datos incompletos.'], 400);

    $stmt = $pdo->prepare('DELETE FROM department_members WHERE department_id = ? AND user_id = ?');
    $stmt->execute([$deptId, $userId]);
    if ($stmt->rowCount() === 0)
        jsonResponse(['error' => 'Miembro no encontrado.'], 404);

    jsonResponse(['message' => 'Miembro eliminado.']);
}
