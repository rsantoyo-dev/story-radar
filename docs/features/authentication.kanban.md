# Autenticación y cuentas — FEAT-AUTH-001

Estado: AUTH-01 a AUTH-06 implementados y en revisión (2026-10-07), activos solo con `AUTH_REQUIRED=true`; AUTH-07, AUTH-08 (bloqueo de alfa) y el backlog pendientes. Decisiones del 25 de septiembre de 2026: solo Google durante la alfa, tabla propia `workspace_members`, registro abierto con 1 USD de crédito por workspace y bloqueo de alfa con la lista de usuarios de prueba de Google. [Feature y decisiones](authentication.md).

**Criterio de cierre de todas las historias:** ningún secreto de servidor en el navegador; cada handler verifica sesión o Bearer por sí mismo; UXDSL obligatorio en las páginas nuevas; `lint`, `build`, `test` del dominio afectado y `db:check` cuando cambie el esquema.

## Por hacer

### AUTH-07 — Endurecer sesiones, límites y auditoría

  - priority: medium
  - tags: [auth, p1, security]
  - ficha: [AUTH-07](../stories/AUTH-07.md)

### AUTH-08 — Registrar el crédito inicial de 1 USD y el bloqueo de alfa

  - priority: medium
  - tags: [auth, p1, billing]
  - ficha: [AUTH-08](../stories/AUTH-08.md)
  - nota (2026-10-07): cada workspace nuevo recibe una vez 100 créditos (US$1, `signup_grant`). Falta el bloqueo de alfa por lista de emails.

## Backlog

### AUTH-09 — Añadir un segundo método de acceso con correo

  - priority: low
  - tags: [auth, p2]
  - ficha: [AUTH-09](../stories/AUTH-09.md)

### AUTH-10 — Invitaciones y equipos por workspace

  - priority: low
  - tags: [auth, p2, saas]
  - ficha: [AUTH-10](../stories/AUTH-10.md)

## En progreso

## En revisión / QA

### AUTH-02 — Crear el workspace personal y la membresía en el primer inicio de sesión

  - priority: high
  - tags: [auth, p0, tenancy]
  - ficha: [AUTH-02](../stories/AUTH-02.md)
  - nota (2026-10-07): una cuenta sin membresía recibe su propio workspace vacío (owner) al primer inicio de sesión; id derivado del usuario, así dos peticiones simultáneas no crean dos. El dashboard muestra "Create your first brand".

### AUTH-03 — Construir la página de acceso con Google, menú de usuario y cierre de sesión

  - priority: high
  - tags: [auth, p0, ui]
  - ficha: [AUTH-03](../stories/AUTH-03.md)
  - nota (2026-10-07): login con Google o enlace (PR #13); el menú de cuenta (email, workspace, rol, cerrar sesión) vive arriba a la derecha.

### AUTH-04 — Crear la capa de acceso a datos y la autorización de rutas

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-04](../stories/AUTH-04.md)
  - nota (2026-10-07): `authorizeRadarCollector` acepta la sesión o el secreto de operador; revisa la marca de la URL (ruta o `topicId`) contra el workspace y el rol: viewer para leer, editor para cambiar, admin para crear o borrar marcas y la zona de borrado. Tests en `radar-api-auth.test.ts`.

### AUTH-05 — Retirar el secreto del navegador y proteger la aplicación

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-05](../stories/AUTH-05.md)
  - nota (2026-10-07): con sesión, el dashboard, el estudio y gastos no piden el "Collector secret"; las peticiones viajan con la cookie. El secreto queda como credencial de operador para scripts y para el modo sin login.

### AUTH-06 — Aislar repositorios y servicios por workspace

  - priority: high
  - tags: [auth, p0, tenancy]
  - ficha: [AUTH-06](../stories/AUTH-06.md)
  - nota (2026-10-07): marcas, fuentes RSS, documentos, créditos y gastos usan el workspace de la petición o el de la marca. Créditos por workspace (migración 0094); reset de créditos solo para el operador de la plataforma.


### AUTH-01 — Instalar Better Auth con Drizzle, esquema de identidad e inicio de sesión con Google

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-01](../stories/AUTH-01.md)

## Hecho
