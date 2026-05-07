<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');

// Auto-migrate table
try {
    $pdo->query("SELECT activity_text FROM department_activities LIMIT 1");
} catch (Exception $e) {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS department_activities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                department_id VARCHAR(50) NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                activity_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        ");
    } catch (Exception $e2) {
        // Ignorar
    }
}

switch ($action) {
    case 'list':
        listActivities();
        break;
    case 'create':
        createActivity($auth);
        break;
    case 'delete':
        deleteActivity($auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listActivities() {
    global $pdo;
    $stmt = $pdo->query("SELECT id, department_id, user_id, activity_text, created_at FROM department_activities ORDER BY created_at ASC");
    $activities = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(['activities' => $activities]);
}

function createActivity($auth) {
    global $pdo;
    if (getMethod() !== 'POST') jsonResponse(['error' => 'Método no permitido.'], 405);
    
    $data = getJsonBody();
    $dept_id = $data['department_id'] ?? '';
    $user_id = $data['user_id'] ?? '';
    $text = trim($data['activity_text'] ?? '');

    if (!$dept_id || !$user_id || !$text) {
        jsonResponse(['error' => 'Todos los campos son obligatorios.'], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO department_activities (department_id, user_id, activity_text) VALUES (?, ?, ?)");
    $stmt->execute([$dept_id, $user_id, $text]);

    jsonResponse(['message' => 'Actividad añadida exitosamente.', 'id' => $pdo->lastInsertId()]);
}

function deleteActivity($auth) {
    global $pdo;
    if (getMethod() !== 'DELETE') jsonResponse(['error' => 'Método no permitido.'], 405);
    $id = getParam('id');
    if (!$id) jsonResponse(['error' => 'Falta el ID de la actividad.'], 400);

    $stmt = $pdo->prepare("DELETE FROM department_activities WHERE id = ?");
    $stmt->execute([$id]);

    jsonResponse(['message' => 'Actividad eliminada.']);
}
