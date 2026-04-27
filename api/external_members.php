<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
setCorsHeaders();

$auth = authenticate();
$action = getParam('action', 'list');
$id = getParam('id');

// Auto-migrate table
try {
    $pdo->query("SELECT meeting_day FROM external_members LIMIT 1");
} catch (Exception $e) {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS external_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) DEFAULT NULL,
                hierarchy_level VARCHAR(50) DEFAULT 'auxiliar',
                job_title VARCHAR(100) DEFAULT NULL,
                user_group VARCHAR(255) NOT NULL,
                meeting_day VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        ");
    } catch (Exception $e2) {
        // Ignorar si ya se está creando en otro hilo
    }
}

switch ($action) {
    case 'list':
        listExternalMembers();
        break;
    case 'create':
        createExternalMember($auth);
        break;
    case 'delete':
        deleteExternalMember($id, $auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listExternalMembers() {
    global $pdo;
    $stmt = $pdo->query("
        SELECT id, name, email, hierarchy_level, job_title, user_group, meeting_day, created_at, 'external' as is_external 
        FROM external_members 
        ORDER BY name ASC
    ");
    $members = $stmt->fetchAll();
    
    // Map them functionally similar to users for the UI
    foreach ($members as &$m) {
        $m['external_id'] = $m['id']; // preserve real id
        $m['id'] = 'ext_' . $m['id']; // differentiate id for frontend keys if needed
        $m['role'] = 'member'; // external members inherently don't have login role, just member
    }
    
    jsonResponse(['members' => $members]);
}

function createExternalMember($auth) {
    global $pdo;
    if (getMethod() !== 'POST') jsonResponse(['error' => 'Método no permitido.'], 405);
    
    // Anyone logged in can create them or requireAdmin?
    // Let's allow admins, although members of the department usually can manage. 
    // To be safe and since departments feature is accessible mostly by admins or all users:
    // we won't strictly enforce requireAdmin here unless the user asked. Let's enforce requireAdmin 
    // just like users, or maybe any authenticated user. Let's just enforce requireAdmin for consistency (creation of personnel).
    requireAdmin($auth);

    $data = getJsonBody();
    $name = trim($data['name'] ?? '');
    $email = trim($data['email'] ?? '');
    $group = $data['user_group'] ?? '';
    $hierarchy_level = $data['hierarchy_level'] ?? 'voluntario_clave';
    $job_title = trim($data['job_title'] ?? '');
    $meeting_day = trim($data['meeting_day'] ?? '');

    if (!$name || !$group) {
        jsonResponse(['error' => 'El nombre y el departamento son obligatorios.'], 400);
    }

    $stmt = $pdo->prepare('INSERT INTO external_members (name, email, hierarchy_level, job_title, user_group, meeting_day) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$name, $email, $hierarchy_level, $job_title, $group, $meeting_day]);

    jsonResponse(['message' => 'Miembro añadido exitosamente.'], 201);
}

function deleteExternalMember($id, $auth) {
    global $pdo;
    if (getMethod() !== 'DELETE') jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);

    $extId = str_replace('ext_', '', $id);

    $stmt = $pdo->prepare('DELETE FROM external_members WHERE id = ?');
    $stmt->execute([$extId]);
    if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Miembro no encontrado.'], 404);

    jsonResponse(['message' => 'Miembro eliminado.']);
}
