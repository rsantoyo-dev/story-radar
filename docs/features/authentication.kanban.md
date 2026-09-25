# Autenticación y cuentas — FEAT-AUTH-001

Estado: AUTH-01 implementado y en revisión (falta la prueba manual con credenciales de Google); el resto planificado. Decisiones del 25 de septiembre de 2026: solo Google durante la alfa, tabla propia `workspace_members`, registro abierto con 1 USD de crédito por workspace y bloqueo de alfa con la lista de usuarios de prueba de Google. [Feature y decisiones](authentication.md).

**Criterio de cierre de todas las historias:** ningún secreto de servidor en el navegador; cada handler verifica sesión o Bearer por sí mismo; UXDSL obligatorio en las páginas nuevas; `lint`, `build`, `test` del dominio afectado y `db:check` cuando cambie el esquema.

## Por hacer

### AUTH-02 — Crear el workspace personal y la membresía en el primer inicio de sesión

  - priority: high
  - tags: [auth, p0, tenancy]
  - ficha: [AUTH-02](../stories/AUTH-02.md)

### AUTH-03 — Construir la página de acceso con Google, menú de usuario y cierre de sesión

  - priority: high
  - tags: [auth, p0, ui]
  - ficha: [AUTH-03](../stories/AUTH-03.md)

### AUTH-04 — Crear la capa de acceso a datos y la autorización de rutas

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-04](../stories/AUTH-04.md)

### AUTH-05 — Retirar el secreto del navegador y proteger la aplicación

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-05](../stories/AUTH-05.md)

### AUTH-06 — Aislar repositorios y servicios por workspace

  - priority: high
  - tags: [auth, p0, tenancy]
  - ficha: [AUTH-06](../stories/AUTH-06.md)

### AUTH-07 — Endurecer sesiones, límites y auditoría

  - priority: medium
  - tags: [auth, p1, security]
  - ficha: [AUTH-07](../stories/AUTH-07.md)

### AUTH-08 — Registrar el crédito inicial de 1 USD y el bloqueo de alfa

  - priority: medium
  - tags: [auth, p1, billing]
  - ficha: [AUTH-08](../stories/AUTH-08.md)

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

### AUTH-01 — Instalar Better Auth con Drizzle, esquema de identidad e inicio de sesión con Google

  - priority: high
  - tags: [auth, p0]
  - ficha: [AUTH-01](../stories/AUTH-01.md)

## Hecho
