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
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Evento cuando el usuario hace clic en la notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Determinar a qué URL redirigir al usuario al hacer clic en la notificación
    let targetUrl = event.notification.data && event.notification.data.url 
        ? event.notification.data.url 
        : '/';

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

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si la aplicación ya está abierta, enfocarla y navegar a la sección
            for (const client of clientList) {
                const clientUrlObj = new URL(client.url);
                const targetUrlObj = new URL(targetUrl);
                if (clientUrlObj.hostname === targetUrlObj.hostname && 'focus' in client) {
                    client.focus();
                    if ('navigate' in client && client.url !== targetUrl) {
                        return client.navigate(targetUrl);
                    }
                    return;
                }
            }
            // Si no estaba abierta, abrir una nueva ventana con la URL correspondiente
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
