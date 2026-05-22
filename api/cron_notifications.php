<?php
// api/cron_notifications.php - Script automatizado para Morning Briefings y alertas de SLA.
// Puede ejecutarse desde consola (CLI) o vía HTTP GET.

// Mostrar TODOS los errores para diagnosticar problemas
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "[CRON] Iniciando cron_notifications.php...\n";
echo "[CRON] PHP Version: " . PHP_VERSION . "\n";
echo "[CRON] Hora del servidor: " . date('Y-m-d H:i:s') . "\n";
echo "[CRON] __DIR__: " . __DIR__ . "\n";

// Verificar que config.php existe
if (!file_exists(__DIR__ . '/config.php')) {
    die("[CRON] ERROR: No se encontró config.php en " . __DIR__ . "\n");
}
require_once __DIR__ . '/config.php';
echo "[CRON] config.php cargado OK.\n";

// Verificar que push_helper.php existe
if (!file_exists(__DIR__ . '/push_helper.php')) {
    die("[CRON] ERROR: No se encontró push_helper.php en " . __DIR__ . "\n");
}
require_once __DIR__ . '/push_helper.php';
echo "[CRON] push_helper.php cargado OK.\n";

// Verificar conexión a la base de datos
try {
    $testStmt = $pdo->query("SELECT COUNT(*) FROM users");
    $userCount = $testStmt->fetchColumn();
    echo "[CRON] BD conectada OK. Total usuarios: $userCount\n";
} catch (Exception $e) {
    die("[CRON] ERROR de BD: " . $e->getMessage() . "\n");
}

// Asegurar que no exceda el tiempo de ejecución
set_time_limit(300);

// Detectar si se está ejecutando desde CLI o Web
$action = 'all';
if (php_sapi_name() !== 'cli') {
    $action = $_GET['action'] ?? 'all';
}
echo "[CRON] Acción: $action\n";

$statusLabels = [
    'todo'        => 'Por Hacer',
    'in_progress' => 'En Progreso',
    'review'      => 'En Revision'
];

$groupLabels = [
    'emergencias'      => 'Emergencias',
    'actividades'      => 'Actividades',
    'otros_eventos'    => 'Otros Eventos',
    'soporte_oficina'  => 'Soporte de Oficina',
    'superintendencia' => 'Superintendencia',
    'todos'            => 'Todos'
];

if ($action === 'all' || $action === 'briefing') {
    // =========================================================================
    // FEATURE 3: MORNING BRIEFING (RESUMEN DIARIO PERSONALIZADO)
    // =========================================================================
    echo "[CRON] --- Procesando Morning Briefing ---\n";
    try {
        $usersStmt = $pdo->query("SELECT DISTINCT u.id, u.name, u.user_group FROM users u JOIN push_subscriptions ps ON u.id = ps.user_id");
        $activeUsers = $usersStmt->fetchAll();
        echo "[CRON] Usuarios con suscripción activa: " . count($activeUsers) . "\n";

        $sent = 0;
        foreach ($activeUsers as $user) {
            $userId     = $user['id'];
            $userGroups = array_map('trim', explode(',', $user['user_group'] ?? ''));

            $taskStmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status IN ('todo', 'in_progress', 'review')");
            $taskStmt->execute([$userId]);
            $pendingTasks = (int) $taskStmt->fetchColumn();

            $today       = date('Y-m-d');
            $eventQuery  = "SELECT COUNT(*) FROM calendar_events WHERE DATE(event_date) = ? AND (target_group = 'todos'";
            $queryParams = [$today];
            foreach ($userGroups as $g) {
                if (!empty($g)) {
                    $eventQuery  .= " OR target_group = ?";
                    $queryParams[] = $g;
                }
            }
            $eventQuery .= ")";

            $eventStmt = $pdo->prepare($eventQuery);
            $eventStmt->execute($queryParams);
            $todayEvents = (int) $eventStmt->fetchColumn();

            if ($pendingTasks > 0 || $todayEvents > 0) {
                $body  = "Buen dia {$user['name']}! Hoy tienes ";
                $parts = [];
                if ($pendingTasks > 0) $parts[] = "$pendingTasks " . ($pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes");
                if ($todayEvents  > 0) $parts[] = "$todayEvents " . ($todayEvents  === 1 ? "evento programado" : "eventos programados");
                $body .= implode(' y ', $parts) . " en tu agenda.";

                $result = sendPushNotifications($userId, "Tu Resumen del Dia - ICCP", $body, "#mytasks");
                echo "[CRON] Briefing enviado a {$user['name']} (ID $userId): success={$result['success']}\n";
                $sent++;
            } else {
                echo "[CRON] Sin pendientes para {$user['name']} (ID $userId), no se envia briefing.\n";
            }
        }
        echo "[CRON] Morning Briefing completado. Enviados: $sent\n";
    } catch (Exception $e) {
        echo "[CRON] ERROR en Morning Briefing: " . $e->getMessage() . "\n";
    }
}

if ($action === 'all' || $action === 'sla') {
    // =========================================================================
    // FEATURE 1: ALERTAS AUTOMATICAS DE TAREAS PROXIMAS A VENCER (SLA)
    // =========================================================================
    echo "[CRON] --- Procesando Alertas SLA ---\n";
    try {
        $tomorrowStart = date('Y-m-d 00:00:00', strtotime('+1 day'));
        $tomorrowEnd   = date('Y-m-d 23:59:59', strtotime('+1 day'));
        echo "[CRON] Buscando tareas que vencen entre $tomorrowStart y $tomorrowEnd\n";

        $taskStmt = $pdo->prepare("SELECT * FROM tasks WHERE due_date >= ? AND due_date <= ? AND status IN ('todo', 'in_progress', 'review')");
        $taskStmt->execute([$tomorrowStart, $tomorrowEnd]);
        $upcomingTasks = $taskStmt->fetchAll();
        echo "[CRON] Tareas proximas a vencer: " . count($upcomingTasks) . "\n";

        $allUsersStmt = $pdo->query("SELECT id, user_group, hierarchy_level FROM users");
        $allUsers = $allUsersStmt->fetchAll();

        foreach ($upcomingTasks as $task) {
            $taskId      = $task['id'];
            $taskTitle   = $task['title'];
            $taskGroup   = $task['target_group'];
            $statusLabel = $statusLabels[$task['status']] ?? $task['status'];
            $groupLabel  = $groupLabels[$taskGroup] ?? $taskGroup;
            $deepLinkUrl = "#tasks?open={$taskId}";

            $notifyIds = [];
            if (!empty($task['assigned_to'])) $notifyIds[] = (int) $task['assigned_to'];

            foreach ($allUsers as $u) {
                $userGroups     = array_map('trim', explode(',', $u['user_group'] ?? ''));
                $hierarchyLevel = $u['hierarchy_level'] ?? '';

                $notify = false;

                // 1. Soporte de Oficina: TODOS los miembros reciben
                if (in_array('soporte_oficina', $userGroups)) {
                    $notify = true;
                }
                
                // 2. Superintendencia: Solo superintendentes y auxiliares
                if (in_array('superintendencia', $userGroups) && ($hierarchyLevel === 'superintendente' || $hierarchyLevel === 'auxiliar')) {
                    $notify = true;
                }
                
                // 3. Departamento destino (o todos): Superintendentes, Auxiliares, y Secretarias
                if (in_array($taskGroup, $userGroups) || $taskGroup === 'todos') {
                    if ($hierarchyLevel === 'superintendente' || $hierarchyLevel === 'auxiliar' || $hierarchyLevel === 'secretaria') {
                        $notify = true;
                    }
                }
                
                if ($notify) {
                    $notifyIds[] = (int) $u['id'];
                }
            }
            $notifyIds = array_unique($notifyIds);

            if (!empty($notifyIds)) {
                $body = "Atencion: La tarea \"{$taskTitle}\" ({$groupLabel}) vence manana. Estado: {$statusLabel}.";
                $result = sendPushNotifications($notifyIds, "Tarea Proxima a Vencer - ICCP", $body, $deepLinkUrl);
                echo "[CRON] Alerta SLA para tarea #$taskId \"{$taskTitle}\": success={$result['success']}, failed={$result['failed']}\n";
            }
        }
        echo "[CRON] Alertas SLA completadas.\n";
    } catch (Exception $e) {
        echo "[CRON] ERROR en Alertas SLA: " . $e->getMessage() . "\n";
    }
}

echo "[CRON] Script finalizado correctamente.\n";
