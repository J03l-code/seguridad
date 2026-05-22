<?php
// api/cron_notifications.php - Script automatizado para Morning Briefings y alertas de SLA.
// Puede ejecutarse desde consola (CLI) o vía HTTP GET.

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/push_helper.php';

// Asegurar que no exceda el tiempo de ejecución
set_time_limit(300);

// Detectar si se está ejecutando desde CLI o Web
$action = 'all';
if (php_sapi_name() !== 'cli') {
    $action = $_GET['action'] ?? 'all';
}

$statusLabels = [
    'todo'        => '📋 Por Hacer',
    'in_progress' => '▶️ En Progreso',
    'review'      => '🔍 En Revisión'
];

$groupLabels = [
    'emergencias'     => 'Emergencias',
    'actividades'     => 'Actividades',
    'otros_eventos'   => 'Otros Eventos',
    'soporte_oficina' => 'Soporte de Oficina',
    'superintendencia'=> 'Superintendencia',
    'todos'           => 'Todos'
];

if ($action === 'all' || $action === 'briefing') {
    // =========================================================================
    // FEATURE 3: MORNING BRIEFING (RESUMEN DIARIO PERSONALIZADO)
    // =========================================================================
    try {
        // Obtener todos los usuarios que tienen suscripción activa
        $usersStmt = $pdo->query("SELECT DISTINCT u.id, u.name, u.user_group FROM users u JOIN push_subscriptions ps ON u.id = ps.user_id");
        $activeUsers = $usersStmt->fetchAll();

        foreach ($activeUsers as $user) {
            $userId = $user['id'];
            $userGroups = array_map('trim', explode(',', $user['user_group'] ?? ''));

            // 1. Tareas pendientes asignadas a este usuario
            $taskStmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status IN ('todo', 'in_progress', 'review')");
            $taskStmt->execute([$userId]);
            $pendingTasks = (int) $taskStmt->fetchColumn();

            // 2. Eventos de calendario para hoy correspondientes a sus grupos o 'todos'
            $today = date('Y-m-d');
            
            // Construir consulta para eventos correspondientes al usuario
            $eventQuery = "SELECT COUNT(*) FROM calendar_events WHERE DATE(event_date) = ? AND (target_group = 'todos'";
            $queryParams = [$today];
            foreach ($userGroups as $g) {
                if (!empty($g)) {
                    $eventQuery .= " OR target_group = ?";
                    $queryParams[] = $g;
                }
            }
            $eventQuery .= ")";
            
            $eventStmt = $pdo->prepare($eventQuery);
            $eventStmt->execute($queryParams);
            $todayEvents = (int) $eventStmt->fetchColumn();

            // Solo notificar si tiene algo pendiente o programado para hoy
            if ($pendingTasks > 0 || $todayEvents > 0) {
                $body = "¡Buen día {$user['name']}! Hoy tienes ";
                $parts = [];
                if ($pendingTasks > 0) {
                    $parts[] = "{$pendingTasks} " . ($pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes");
                }
                if ($todayEvents > 0) {
                    $parts[] = "{$todayEvents} " . ($todayEvents === 1 ? "evento programado" : "eventos programados");
                }
                $body .= implode(' y ', $parts) . " en tu agenda.";

                sendPushNotifications(
                    $userId,
                    "☀️ Tu Resumen del Día - ICCP",
                    $body,
                    "#mytasks",
                    [
                        'actions' => [
                            ['action' => 'view', 'title' => '👁️ Ver Mis Tareas']
                        ]
                    ]
                );
            }
        }
        echo "Morning Briefing procesado con éxito.\n";
    } catch (Exception $e) {
        echo "Error en Morning Briefing: " . $e->getMessage() . "\n";
    }
}

if ($action === 'all' || $action === 'sla') {
    // =========================================================================
    // FEATURE 1: ALERTAS AUTOMÁTICAS DE TAREAS PRÓXIMAS A VENCER (SLA)
    // =========================================================================
    try {
        // Obtener tareas que vencen mañana (entre 24 y 48 horas) y que no están listas (done)
        $tomorrowStart = date('Y-m-d 00:00:00', strtotime('+1 day'));
        $tomorrowEnd   = date('Y-m-d 23:59:59', strtotime('+1 day'));

        $taskStmt = $pdo->prepare("SELECT * FROM tasks WHERE due_date >= ? AND due_date <= ? AND status IN ('todo', 'in_progress', 'review')");
        $taskStmt->execute([$tomorrowStart, $tomorrowEnd]);
        $upcomingTasks = $taskStmt->fetchAll();

        // Obtener todos los usuarios de la base de datos para mapear receptores
        $allUsersStmt = $pdo->query("SELECT id, user_group, hierarchy_level FROM users");
        $allUsers = $allUsersStmt->fetchAll();

        foreach ($upcomingTasks as $task) {
            $taskId = $task['id'];
            $taskTitle = $task['title'];
            $taskGroup = $task['target_group'];
            $statusLabel = $statusLabels[$task['status']] ?? $task['status'];
            $groupLabel = $groupLabels[$taskGroup] ?? $taskGroup;
            $deepLinkUrl = "#tasks?open={$taskId}";

            // Destinatarios:
            // 1. El usuario específicamente asignado
            // 2. Todos los de ese departamento
            // 3. Toda la superintendencia
            // 4. Todo el soporte de oficina
            $notifyIds = [];
            if (!empty($task['assigned_to'])) {
                $notifyIds[] = (int) $task['assigned_to'];
            }

            foreach ($allUsers as $u) {
                $userGroups = array_map('trim', explode(',', $u['user_group'] ?? ''));
                $hierarchyLevel = $u['hierarchy_level'] ?? '';

                $isInDept = in_array($taskGroup, $userGroups) || $taskGroup === 'todos';
                $isSuper = ($hierarchyLevel === 'superintendente' || in_array('superintendencia', $userGroups));
                $isSoporte = in_array('soporte_oficina', $userGroups);

                if ($isInDept || $isSuper || $isSoporte) {
                    $notifyIds[] = (int) $u['id'];
                }
            }

            $notifyIds = array_unique($notifyIds);

            if (!empty($notifyIds)) {
                $body = "⚠️ La tarea \"{$taskTitle}\" ({$groupLabel}) vence mañana. Estado: {$statusLabel}.";
                
                $options = [
                    'vibrate' => [200, 100, 200, 100, 400],
                    'actions' => [
                        ['action' => 'view', 'title' => '👁️ Abrir Tarea'],
                        ['action' => 'comment', 'title' => '💬 Comentar']
                    ]
                ];

                sendPushNotifications(
                    $notifyIds,
                    "⏰ Tarea Próxima a Vencer - ICCP",
                    $body,
                    $deepLinkUrl,
                    $options
                );
            }
        }
        echo "Alertas de SLA procesadas con éxito.\n";
    } catch (Exception $e) {
        echo "Error en Alertas de SLA: " . $e->getMessage() . "\n";
    }
}
