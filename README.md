# ICCP - Sistema de Gestión de Tareas Departamental

Sistema completo de gestión de tareas por departamento con tablero Kanban, integración Google Calendar, panel de métricas y diseño premium, desarrollado con PHP + MySQL (backend) y HTML/CSS/JS puro (frontend).

---

## 📁 Estructura del Proyecto

```
ICCP/
├── index.html          # SPA shell
├── styles.css          # Design system completo
├── app.js              # SPA (router + páginas)
├── .htaccess           # Seguridad y cache
│
├── api/                # Backend PHP
│   ├── config.php      # Conexión BD + variables
│   ├── helpers.php     # JWT, CORS, auth
│   ├── auth.php        # Login / Register / Me
│   ├── tasks.php       # CRUD tareas + archivos
│   ├── departments.php # CRUD departamentos + miembros
│   ├── users.php       # Gestión de usuarios
│   ├── dashboard.php   # Métricas y actividad
│   ├── calendar.php    # Google Calendar OAuth2
│   ├── .htaccess       # Protección config
│   ├── uploads/        # Archivos adjuntos
│   └── database/
│       └── schema.sql  # Esquema MySQL
```

---

## 🚀 Instalación

### Requisitos
- **PHP** 7.4+ con extensiones: `pdo`, `pdo_mysql`, `curl`, `mbstring`
- **MySQL** 5.7+ o 8.0+
- **Apache** con `mod_rewrite` habilitado

### 1. Configurar la Base de Datos

```sql
CREATE DATABASE iccp_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -u root -p iccp_db < api/database/schema.sql
```

### 2. Configurar credenciales

Editar `api/config.php` con tus datos MySQL:
```php
$DB_HOST = 'localhost';
$DB_NAME = 'iccp_db';
$DB_USER = 'tu_usuario';
$DB_PASS = 'tu_contraseña';

$JWT_SECRET = 'una_clave_secreta_larga_y_segura';
```

### 3. Ejecutar localmente

```bash
cd ICCP
php -S localhost:8000
```

Abrir: `http://localhost:8000`

---

## 🌐 Despliegue en Hostinger

### 1. Base de datos
1. **hPanel** → **Bases de Datos** → **MySQL** → Crear nueva
2. Via **phpMyAdmin**, importar `api/database/schema.sql`

### 2. Subir archivos
Subir **todo el contenido** de la carpeta `ICCP/` a `public_html/` via:
- Gestor de archivos de hPanel, o
- FTP / Git

### 3. Configurar credenciales
Editar `api/config.php` con los datos de MySQL de Hostinger:
```php
$DB_HOST = 'localhost';
$DB_NAME = 'u123456789_iccp';
$DB_USER = 'u123456789_iccp_user';
$DB_PASS = 'tu_contraseña_bd';
```

### 4. Google Calendar (opcional)
1. [Google Cloud Console](https://console.cloud.google.com/) → Crear proyecto
2. Habilitar **Google Calendar API**
3. Credenciales → **ID de cliente OAuth 2.0** → Web
4. URI de redirección: `https://tudominio.com/api/calendar.php?action=callback`
5. Editar `config.php`:
```php
$GOOGLE_CLIENT_ID = 'tu_client_id';
$GOOGLE_CLIENT_SECRET = 'tu_client_secret';
$GOOGLE_REDIRECT_URI = 'https://tudominio.com/api/calendar.php?action=callback';
```

---

## 🔐 Credenciales por Defecto

| Campo | Valor |
|---|---|
| Email | `admin@iccp.com` |
| Contraseña | `password` |
| Rol | Admin |

> ⚠️ **Cambiar la contraseña después del primer login.**

---

## 📋 Funcionalidades

- ✅ Autenticación JWT (login/registro)
- ✅ Roles: Admin / Miembro
- ✅ Tablero Kanban (3 columnas)
- ✅ Prioridades (Baja, Media, Alta, Urgente)
- ✅ Departamentos con miembros y progreso
- ✅ Archivos adjuntos en tareas
- ✅ Google Calendar (OAuth2 + sync)
- ✅ Dashboard con gráficos SVG
- ✅ Historial de actividad
- ✅ Diseño responsive premium
- ✅ SPA con routing por hash
- ✅ Protección SQL injection (PDO prepared)
