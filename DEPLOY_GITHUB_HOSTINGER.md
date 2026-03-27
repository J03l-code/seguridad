# Guía de Despliegue Automático: GitHub ➔ Hostinger

Esta guía explica cómo configurar tu proyecto para que cada vez que subas cambios a GitHub (`git push`), tu sitio web en Hostinger se actualice automáticamente.

---

## FASE 1: Subir tu código a GitHub

1. Entra a tu cuenta en [GitHub](https://github.com/) y haz clic en **New repository** (Nuevo repositorio).
2. Ponle un nombre (ej. `iccp-app`), déjalo como **Public** o **Private**, y **NO** agregues README ni .gitignore. Haz clic en **Create repository**.
3. Abre la terminal en la carpeta principal de tu proyecto (`/home/joel/Escritorio/ICCP`) y ejecuta los siguientes comandos uno por uno:

\`\`\`bash
# Inicializar Git en tu carpeta
git init

# Agregar todos los archivos (el archivo .gitignore creado excluirá los innecesarios)
git add .

# Hacer el primer commit
git commit -m "Primer commit: Versión inicial para Hostinger"

# Asegurarse de que la rama principal se llame 'main'
git branch -M main

# Conectar tu carpeta local con tu repositorio de GitHub (Modifica 'TU_USUARIO' y 'NOMBRE_REPO')
git remote add origin https://github.com/TU_USUARIO/NOMBRE_REPO.git

# Subir los archivos a GitHub
git push -u origin main
\`\`\`

---

## FASE 2: Conectar Hostinger con GitHub

1. Ingresa a tu **hPanel** en Hostinger.
2. Ve al panel de control de tu sitio web.
3. En el menú de la izquierda, busca la sección **Avanzado** y haz clic en **GIT**.
4. En **Crear repositorio**, completa la información:
   * **Repositorio:** `TU_USUARIO/NOMBRE_REPO` (ejemplo: `joel/iccp-app`)
   * **Rama (Branch):** `main`
   * **Directorio de instalación:** Déjalo vacío si quieres que se instale en la carpeta principal (`public_html/`). Si quieres que esté en una subcarpeta (ej. `/app`), escríbelo allí.
5. Haz clic en el botón **Crear** o **Desplegar**.
   * *Hostinger descargará tus archivos de GitHub y los colocará en tu servidor.*

---

## FASE 3: Configurar el Auto Deploy (Webhook)

Ahora haremos que GitHub le "avise" a Hostinger cada vez que subes un cambio.

1. En la misma pantalla de **GIT** en Hostinger (donde acabas de conectar el repositorio), verás una opción llamada **Auto Despliegue** (Auto deploy) o **URL de Webhook**. **Copia esa URL generada por Hostinger.**
2. Vuelve a la página de tu repositorio en **GitHub**.
3. Haz clic en la pestaña superior llamada **Settings** (Configuración) de tu repositorio.
4. En el menú de la izquierda, haz clic en **Webhooks**.
5. Haz clic en el botón **Add webhook** (Agregar webhook, arriba a la derecha).
6. Completa el formulario así:
   * **Payload URL:** Pega aquí la dirección que copiaste de Hostinger.
   * **Content type:** Selecciona `application/x-www-form-urlencoded`.
   * **Which events would you like to trigger this webhook?:** Deja seleccionado `Just the push event`.
   * Asegúrate de que la casilla **Active** esté marcada.
7. Haz clic en el botón verde **Add webhook**.

---

## ✅ ¿Cómo trabajar a partir de ahora?

¡Todo está listo! De ahora en adelante, cada vez que edites en tu computadora, solo tienes que hacer esto:

\`\`\`bash
git add .
git commit -m "Boton de tareas arreglado"
git push
\`\`\`

Al hacer `git push`, tu web en Hostinger se actualizará sola en 1 o 2 segundos. Ya no necesitas usar FileZilla, FTP ni el gestor de archivos.

---

### IMPORTANTE: Configuración de Base de Datos en Producción

Dado que el archivo `.env` o credenciales locales no se suben por seguridad, cuando tu proyecto esté en Hostinger deberás:
1. Ir a **Bases de Datos MySQL** en Hostinger y crear una base de datos.
2. Usar **phpMyAdmin** en Hostinger para subir tu archivo `api/database/schema.sql`.
3. Editar manualmente el archivo `api/config.php` **directo en el gestor de archivos de Hostinger** para colocar las credenciales (nombre de BD, usuario y contraseña) que creaste en el paso 1.
