<?php
// api/push_helper.php - Helper para enviar Notificaciones Push PWA

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

/**
 * Envía una notificación Push a un usuario específico o múltiples usuarios.
 *
 * @param int|array $userIds ID o array de IDs de usuarios.
 * @param string $title Título de la notificación.
 * @param string $body Contenido/mensaje de la notificación.
 * @param string $url URL a la que se redirigirá al hacer clic.
 * @return array Reporte de éxito/fallo.
 */
function sendPushNotifications($userIds, $title, $body, $url = '/') {
    global $pdo, $VAPID_PUBLIC_KEY, $VAPID_PRIVATE_KEY;

    if (empty($userIds)) {
        return ['success' => 0, 'failed' => 0, 'message' => 'No hay destinatarios especificados.'];
    }

    if (!is_array($userIds)) {
        $userIds = [$userIds];
    }

    // 1. Obtener las suscripciones activas para los usuarios especificados
    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $stmt = $pdo->prepare("SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN ($placeholders)");
    $stmt->execute($userIds);
    $subscriptionsData = $stmt->fetchAll();

    if (empty($subscriptionsData)) {
        return ['success' => 0, 'failed' => 0, 'message' => 'No hay dispositivos suscritos para estos usuarios.'];
    }

    // 2. Configurar el cliente WebPush
    $auth = [
        'VAPID' => [
            'subject' => 'mailto:admin@iccp.com',
            'publicKey' => $VAPID_PUBLIC_KEY,
            'privateKey' => $VAPID_PRIVATE_KEY,
        ],
    ];

    try {
        $webPush = new WebPush($auth);
        $payload = json_encode([
            'title' => $title,
            'body' => $body,
            'url' => $url
        ], JSON_UNESCAPED_UNICODE);

        // 3. Encolar cada suscripción
        foreach ($subscriptionsData as $sub) {
            $subscription = Subscription::create([
                'endpoint' => $sub['endpoint'],
                'keys' => [
                    'p256dh' => $sub['p256dh'],
                    'auth' => $sub['auth']
                ]
            ]);

            $webPush->queueNotification($subscription, $payload);
        }

        // 4. Procesar y enviar todo en lote (Batch)
        $results = [];
        $successCount = 0;
        $failedCount = 0;

        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getEndpoint();
            if ($report->isSuccess()) {
                $successCount++;
                $results[] = ['endpoint' => $endpoint, 'success' => true];
            } else {
                $failedCount++;
                $results[] = [
                    'endpoint' => $endpoint, 
                    'success' => false, 
                    'reason' => $report->getReason()
                ];
                
                // Si la suscripción ya no existe (410 Gone / 404 Not Found), la eliminamos de la base de datos
                if ($report->isSubscriptionExpired()) {
                    $deleteStmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
                    $deleteStmt->execute([$endpoint]);
                }
            }
        }

        return [
            'success' => $successCount,
            'failed' => $failedCount,
            'details' => $results
        ];

    } catch (Exception $e) {
        return [
            'success' => 0, 
            'failed' => count($subscriptionsData), 
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Envía una notificación a grupos específicos según su rol, nivel jerárquico o grupo departamental.
 *
 * @param array $hierarchyLevels Niveles de jerarquía a notificar (ej: ['superintendente', 'auxiliar']).
 * @param array $groups Grupos a notificar (ej: ['soporte_oficina']).
 * @param string $title Título de la notificación.
 * @param string $body Contenido/mensaje de la notificación.
 * @param string $url URL opcional.
 * @return array Reporte del envío.
 */
function sendPushToRolesAndGroups($hierarchyLevels, $groups, $title, $body, $url = '/') {
    global $pdo;
    
    $query = "SELECT id FROM users WHERE 0 ";
    $params = [];
    
    // Nivel jerárquico
    if (!empty($hierarchyLevels)) {
        $placeholders = implode(',', array_fill(0, count($hierarchyLevels), '?'));
        $query .= " OR hierarchy_level IN ($placeholders) ";
        $params = array_merge($params, $hierarchyLevels);
    }
    
    // Grupo departamental
    if (!empty($groups)) {
        foreach ($groups as $g) {
            $query .= " OR user_group LIKE ? ";
            $params[] = "%$g%";
        }
    }
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    return sendPushNotifications($userIds, $title, $body, $url);
}
