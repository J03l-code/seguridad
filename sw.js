// sw.js - Service Worker de la PWA ICCP

// Nombre del caché (para si en el futuro se quiere implementar caché sin conexión)
const CACHE_NAME = 'iccp-v1';

// Evento de instalación
self.addEventListener('install', (e) => {
    // Forzar la activación inmediata del nuevo Service Worker
    self.skipWaiting();
});

// Evento de activación
self.addEventListener('activate', (e) => {
    // Tomar el control de los clientes de inmediato sin esperar una recarga
    e.waitUntil(self.clients.claim());
});

// Evento para escuchar notificaciones push enviadas desde el servidor
self.addEventListener('push', (event) => {
    let data = { 
        title: 'ICCP', 
        body: 'Nueva actualización en tu sistema.' 
    };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: 'logo.png',
        badge: 'logo.png', // Icono de la barra de estado en Android
        vibrate: data.vibrate || [100, 50, 100],
        actions: data.actions || [],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Evento cuando el usuario hace clic en la notificación o en sus botones de acción
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Determinar a qué URL redirigir al usuario al hacer clic en la notificación
    let targetUrl = event.notification.data && event.notification.data.url 
        ? event.notification.data.url 
        : '/';

    // Manejar el botón de acción "Comentar"
    if (event.action === 'comment') {
        targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'focus_comment=true';
    }

    // Convertir URL relativa a absoluta del origen de la PWA
    if (!targetUrl.startsWith('http')) {
        if (targetUrl.startsWith('#')) {
            targetUrl = self.location.origin + '/index.html' + targetUrl;
        } else if (targetUrl.startsWith('/')) {
            targetUrl = self.location.origin + targetUrl;
        } else {
            targetUrl = self.location.origin + '/' + targetUrl;
        }
    }

    const savePendingRedirect = caches.open('pending-notifications').then((cache) => {
        return cache.put('/pending-redirect', new Response(targetUrl));
    });

    event.waitUntil(
        savePendingRedirect.then(() => {
            return clients.matchAll({ type: 'window', includeUncontrolled: true });
        }).then((clientList) => {
            // Si la aplicación ya está abierta, enfocarla y enviar mensaje para cambiar de sección (crucial para iOS)
            for (const client of clientList) {
                try {
                    const clientUrlObj = new URL(client.url);
                    const targetUrlObj = new URL(targetUrl);
                    if (clientUrlObj.hostname === targetUrlObj.hostname && 'focus' in client) {
                        // Enviar mensaje al frontend para cambiar de sección (evita recargas y fallos de navegación)
                        if (client.postMessage) {
                            client.postMessage({ action: 'navigate', url: targetUrl });
                        }
                        
                        // Eliminar inmediatamente del caché ya que la ventana ya está abierta y enfocada
                        caches.open('pending-notifications').then((cache) => {
                            cache.delete('/pending-redirect');
                        });

                        return client.focus().catch((err) => {
                            console.error('Error al enfocar el cliente:', err);
                        });
                    }
                } catch (err) {
                    console.error('Error al procesar cliente para navegación:', err);
                }
            }
            // Si no estaba abierta, abrir una nueva ventana con la URL correspondiente
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
