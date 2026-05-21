<?php
// api/debug_push.php - Herramienta de Diagnóstico para Notificaciones Push PWA

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/push_helper.php';

setCorsHeaders();

// Solo permitir acceso si el usuario está autenticado
try {
    $auth = authenticate();
} catch (Exception $e) {
    http_response_code(401);
    echo "<h1>Error: No autenticado</h1><p>Por favor, inicia sesión en la aplicación antes de abrir esta página.</p>";
    exit;
}

$action = $_GET['action'] ?? 'view';

if ($action === 'test') {
    // 1. Obtener todas las suscripciones registradas
    $stmt = $pdo->query("SELECT user_id FROM push_subscriptions");
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($userIds)) {
        echo "<h1>Diagnóstico de Envío</h1>";
        echo "<p style='color:red;'><strong>Error:</strong> No hay ningún dispositivo registrado en la tabla <code>push_subscriptions</code>.</p>";
        echo "<p>Asegúrate de ir a la pestaña <strong>Configuración</strong> de tu aplicación en tu teléfono e interactuar con el botón 'Activar Notificaciones'.</p>";
        echo "<a href='debug_push.php'><- Volver al panel</a>";
        exit;
    }

    // 2. Enviar push de prueba a todos los registrados
    $report = sendPushNotifications(
        $userIds,
        "Prueba de Notificación 🚀",
        "¡Hola! Este es un mensaje de diagnóstico del sistema ICCP enviado a las " . date('H:i:s'),
        "#settings"
    );

    echo "<h1>Resultado del Envío de Prueba</h1>";
    echo "<pre>" . print_r($report, true) . "</pre>";
    echo "<p><a href='debug_push.php' style='padding:8px 12px;background:#0f172a;color:#fff;text-decoration:none;border-radius:4px;'><- Volver al panel</a></p>";
    exit;
}

// Vista por defecto: Listar suscripciones
$stmt = $pdo->query("
    SELECT s.id, s.user_id, s.endpoint, s.created_at, u.name, u.role, u.hierarchy_level, u.user_group 
    FROM push_subscriptions s 
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
");
$subs = $stmt->fetchAll(PDO::FETCH_ASSOC);

?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Panel de Diagnóstico - Web Push ICCP</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px 20px; max-width: 1000px; margin: 0 auto; }
        .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); padding: 24px; margin-bottom: 24px; }
        h1 { margin-top: 0; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        th { background: #f1f5f9; color: #475569; font-weight: 600; }
        .btn { display: inline-block; padding: 10px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; transition: background 0.2s; }
        .btn:hover { background: #1d4ed8; }
        .btn-test { background: #10b981; }
        .btn-test:hover { background: #059669; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
        .badge-admin { background: #fee2e2; color: #991b1b; }
        .badge-member { background: #dbeafe; color: #1e40af; }
    </style>
</head>
<body>

    <div class="card">
        <h1>🔔 Panel de Diagnóstico - Web Push ICCP</h1>
        <p>Utiliza esta herramienta para comprobar si tu dispositivo móvil se registró correctamente en la base de datos y realizar un envío de prueba inmediato.</p>
        
        <div style="margin-top: 20px; display: flex; gap: 12px;">
            <a href="debug_push.php?action=test" class="btn btn-test">🚀 Enviar Notificación de Prueba a Todos</a>
            <a href="debug_push.php" class="btn" style="background:#64748b;">🔄 Actualizar Lista</a>
        </div>
    </div>

    <div class="card">
        <h2>📱 Dispositivos Suscritos Actualmente (<?php echo count($subs); ?>)</h2>
        
        <?php if (empty($subs)): ?>
            <p style="color: #64748b; font-style: italic;">No hay ningún dispositivo suscrito en la base de datos todavía.</p>
        <?php else: ?>
            <table>
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Jerarquía</th>
                        <th>Grupo de Trabajo</th>
                        <th>Servicio Push</th>
                        <th>Fecha de Registro</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($subs as $s): ?>
                        <?php 
                            // Identificar el navegador/plataforma a partir del endpoint
                            $platform = 'Desconocido';
                            if (strpos($s['endpoint'], 'android.googleapis.com') !== false || strpos($s['endpoint'], 'fcm.googleapis.com') !== false) {
                                $platform = 'Google FCM (Android/Chrome)';
                            } elseif (strpos($s['endpoint'], 'apple.com') !== false) {
                                $platform = 'Apple Push (iOS/Safari)';
                            } elseif (strpos($s['endpoint'], 'mozilla.com') !== false) {
                                $platform = 'Mozilla Firefox';
                            }
                        ?>
                        <tr>
                            <td><strong><?php echo htmlspecialchars($s['name']); ?></strong> (ID: <?php echo $s['user_id']; ?>)</td>
                            <td><span class="badge badge-<?php echo $s['role']; ?>"><?php echo htmlspecialchars($s['role']); ?></span></td>
                            <td><code><?php echo htmlspecialchars($s['hierarchy_level'] ?: 'ninguno'); ?></code></td>
                            <td><code><?php echo htmlspecialchars($s['user_group'] ?: 'ninguno'); ?></code></td>
                            <td><?php echo $platform; ?></td>
                            <td><?php echo $s['created_at']; ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

</body>
</html>
