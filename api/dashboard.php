<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'metrics');

switch ($action) {
    case 'metrics':
        getMetrics();
        break;
    case 'department':
        getDepartmentMetrics(getParam('id'));
        break;
    case 'activity':
        getActivity();
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function getMetrics()
{
    global $pdo, $auth;
    $isAdmin = ($auth['role'] === 'admin');

    $status = $pdo->query("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")->fetchAll();
    $priority = $pdo->query("SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority")->fetchAll();
    $userCount = $pdo->query("SELECT COUNT(*) as count FROM users")->fetchColumn();
    $deptCount = $pdo->query("SELECT COUNT(*) as count FROM departments")->fetchColumn();
    $weekDone = $pdo->query("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
    $weekNew = $pdo->query("SELECT COUNT(*) FROM tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
    $overdue = $pdo->query("SELECT COUNT(*) FROM tasks WHERE due_date < NOW() AND status != 'done'")->fetchColumn();

    $sb = ['todo' => 0, 'in_progress' => 0, 'done' => 0];
    foreach ($status as $r)
        $sb[$r['status']] = (int) $r['count'];
    $pb = ['low' => 0, 'medium' => 0, 'high' => 0, 'urgent' => 0];
    foreach ($priority as $r)
        $pb[$r['priority']] = (int) $r['count'];

    jsonResponse([
        'metrics' => [
            'statusBreakdown' => $sb,
            'priorityBreakdown' => $pb,
            'totalUsers' => (int) $userCount,
            'totalDepartments' => (int) $deptCount,
            'weeklyCompleted' => (int) $weekDone,
            'weeklyCreated' => (int) $weekNew,
            'overdueTasks' => (int) $overdue,
            'totalTasks' => array_sum($sb)
        ]
    ]);
}

function getDepartmentMetrics($id)
{
    global $pdo;
    if (!$id)
        jsonResponse(['error' => 'ID requerido.'], 400);

    $dept = $pdo->prepare('SELECT * FROM departments WHERE id = ?');
    $dept->execute([$id]);
    $d = $dept->fetch();
    if (!$d)
        jsonResponse(['error' => 'Departamento no encontrado.'], 404);

    $status = $pdo->prepare("SELECT status, COUNT(*) as count FROM tasks WHERE department_id = ? GROUP BY status");
    $status->execute([$id]);
    $sb = ['todo' => 0, 'in_progress' => 0, 'done' => 0];
    foreach ($status->fetchAll() as $r)
        $sb[$r['status']] = (int) $r['count'];

    $members = $pdo->prepare("SELECT u.id, u.name, u.avatar,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed, COUNT(t.id) as total
        FROM department_members dm JOIN users u ON dm.user_id = u.id
        LEFT JOIN tasks t ON t.assigned_to = u.id AND t.department_id = ?
        WHERE dm.department_id = ? GROUP BY u.id, u.name, u.avatar ORDER BY completed DESC LIMIT 10");
    $members->execute([$id, $id]);

    jsonResponse(['department' => $d, 'statusBreakdown' => $sb, 'topMembers' => $members->fetchAll()]);
}

function getActivity()
{
    global $pdo, $auth;
    $limit = (int) (getParam('limit', 20));
    $stmt = $pdo->prepare("SELECT al.*, u.name as user_name, u.avatar as user_avatar, t.title as task_title
        FROM activity_log al LEFT JOIN users u ON al.user_id = u.id LEFT JOIN tasks t ON al.task_id = t.id
        ORDER BY al.created_at DESC LIMIT ?");
    $stmt->execute([$limit]);
    jsonResponse(['activity' => $stmt->fetchAll()]);
}
