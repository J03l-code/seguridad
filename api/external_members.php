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

// Auto-migrate avatar
try {
    $pdo->query("SELECT avatar FROM external_members LIMIT 1");
} catch (Exception $e) {
    try { $pdo->exec("ALTER TABLE external_members ADD COLUMN avatar VARCHAR(255) DEFAULT NULL"); } catch (Exception $e2) {}
}

// Auto-migrate phone
try {
    $pdo->query("SELECT phone FROM external_members LIMIT 1");
} catch (Exception $e) {
    try { $pdo->exec("ALTER TABLE external_members ADD COLUMN phone VARCHAR(50) DEFAULT NULL"); } catch (Exception $e2) {}
}

// Auto-migrate jwpub_email
try {
    $pdo->query("SELECT jwpub_email FROM external_members LIMIT 1");
} catch (Exception $e) {
    try { $pdo->exec("ALTER TABLE external_members ADD COLUMN jwpub_email VARCHAR(150) DEFAULT NULL"); } catch (Exception $e2) {}
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
    case 'update':
        updateExternalMember($id, $auth);
        break;
    case 'upload_avatar':
        uploadAvatarExt($id, $auth);
        break;
    default:
        jsonResponse(['error' => 'Acción no válida.'], 400);
}

function listExternalMembers() {
    global $pdo;
    $stmt = $pdo->query("
        SELECT id, name, email, jwpub_email, phone, hierarchy_level, job_title, user_group, meeting_day, avatar, created_at, 'external' as is_external 
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
    $phone = trim($data['phone'] ?? '');
    $meeting_day = trim($data['meeting_day'] ?? '');

    if (!$name || !$group) {
        jsonResponse(['error' => 'El nombre y el departamento son obligatorios.'], 400);
    }

    $stmt = $pdo->prepare('INSERT INTO external_members (name, email, jwpub_email, phone, hierarchy_level, job_title, user_group, meeting_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$name, $email, $data['jwpub_email'] ?? null, $phone, $hierarchy_level, $job_title, $group, $meeting_day]);

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

function updateExternalMember($id, $auth) {
    global $pdo;
    if (getMethod() !== 'PUT') jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    $extId = str_replace('ext_', '', $id);
    $data = getJsonBody();
    
    $fields = [];
    $values = [];
    if (array_key_exists('name', $data)) { $fields[] = 'name = ?'; $values[] = $data['name']; }
    if (array_key_exists('email', $data)) { $fields[] = 'email = ?'; $values[] = $data['email']; }
    if (array_key_exists('jwpub_email', $data)) { $fields[] = 'jwpub_email = ?'; $values[] = $data['jwpub_email']; }
    if (array_key_exists('phone', $data)) { $fields[] = 'phone = ?'; $values[] = $data['phone']; }
    if (array_key_exists('job_title', $data)) { $fields[] = 'job_title = ?'; $values[] = $data['job_title']; }
    if (array_key_exists('hierarchy_level', $data)) { $fields[] = 'hierarchy_level = ?'; $values[] = $data['hierarchy_level']; }
    if (array_key_exists('user_group', $data)) { $fields[] = 'user_group = ?'; $values[] = $data['user_group']; }
    if (array_key_exists('meeting_day', $data)) { $fields[] = 'meeting_day = ?'; $values[] = $data['meeting_day']; }

    if (empty($fields)) jsonResponse(['error' => 'Nada que actualizar.'], 400);

    $values[] = $extId;
    $pdo->prepare("UPDATE external_members SET " . implode(', ', $fields) . " WHERE id = ?")->execute($values);
    jsonResponse(['message' => 'Miembro externo actualizado.']);
}

function uploadAvatarExt($id, $auth) {
    global $pdo, $UPLOAD_DIR, $MAX_FILE_SIZE;
    if (getMethod() !== 'POST') jsonResponse(['error' => 'Método no permitido.'], 405);
    requireAdmin($auth);
    $extId = str_replace('ext_', '', $id);

    if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
        jsonResponse(['error' => 'Error al subir la imagen.'], 400);
    }
    
    $file = $_FILES['avatar'];
    if ($file['size'] > $MAX_FILE_SIZE) jsonResponse(['error' => 'El archivo supera el límite (10MB).'], 400);
    
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
        jsonResponse(['error' => 'Formato no permitido (solo jpg, png, webp).'], 400);
    }

    $filename = 'ext_avatar_' . $extId . '_' . time() . '.' . $ext;
    $targetPath = $UPLOAD_DIR . $filename;
    
    // Select old avatar to delete it if exists
    $stmt = $pdo->prepare('SELECT avatar FROM external_members WHERE id = ?');
    $stmt->execute([$extId]);
    $old = $stmt->fetchColumn();
    
    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        if ($old && file_exists($UPLOAD_DIR . $old)) {
            unlink($UPLOAD_DIR . $old);
        }
        $pdo->prepare('UPDATE external_members SET avatar = ? WHERE id = ?')->execute([$filename, $extId]);
        jsonResponse(['message' => 'Avatar actualizado.', 'avatar' => $filename]);
    } else {
        jsonResponse(['error' => 'Hubo un error al guardar el archivo.'], 500);
    }
}
