---
id: AUTH-02
feature: FEAT-AUTH-001
status: in-progress
board: authentication.kanban.md
tags: [auth, in-progress, p0, tenancy]
---

# AUTH-02 — Crear el workspace personal y la membresía en el primer inicio de sesión

**Estado:** [[status-in-progress]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** [[AUTH-01]]

**Como** persona que entra por primera vez, **quiero** tener mi propio workspace desde el primer inicio de sesión, **para** empezar a trabajar sin pasos manuales; y como owner del workspace `default`, **quiero** seguir viendo mis datos actuales.

## Criterios de aceptación

- Crear `workspace_members` en `src/db/schema/workspace-members.ts`: `id` text, `workspace_id` con borrado en cascada, `user_id` con borrado en cascada, `role` con check (`owner`, `admin`, `member`), `created_at`; índice único por (`workspace_id`, `user_id`) e índice por `user_id`. Mismos nombres de campo que `member` del plugin `organization` para poder mapearlo después.
- Añadir `sessions.active_workspace_id` nulo, sin clave foránea dura para no bloquear el borrado de workspaces; el contexto valida la membresía en cada lectura.
- Servicio `ensurePersonalWorkspace(userId, email)` en `src/app/modules/auth/`: crea el workspace con slug único derivado del email o del id, la membresía `owner` y delega el asiento inicial en AUTH-08. Cada paso es idempotente por clave (`id` determinista o índice único) porque `neon-http` no tiene transacciones; repetir la llamada no crea nada nuevo.
- Hook `databaseHooks.user.create.after` que llama al servicio; `requireWorkspaceContext` lo vuelve a llamar si el usuario no tiene membresía (reparación perezosa).
- Al crear una sesión, fijar `active_workspace_id` al único workspace del usuario o al último usado; si no existe todavía, la reparación perezosa lo fija en la primera petición.
- Script idempotente `scripts/seed-workspace-owner.mts` que, dado el email de un usuario ya registrado, crea la membresía `owner` en `default`. El script nunca crea usuarios y termina con error claro si el usuario no existe.
- Migración aditiva con `db:generate` y `db:check`.
- Pruebas con PGlite: llamada doble a `ensurePersonalWorkspace` crea un solo workspace; slug generado cumple el check existente; usuario sin membresía queda reparado; borrado de usuario elimina membresías.

## Notas de diseño

`DEFAULT_WORKSPACE_ID` se mantiene para seeds, migraciones y workers; AUTH-06 lo retira de las rutas de usuario. El plugin `organization` se descarta por ahora; AUTH-10 evaluará mapearlo sobre estas tablas si hacen falta equipos.

## Validación y entrega

Registrar la salida del script contra la base local y el resultado de las pruebas. Esta historia no cambia todavía qué ve cada usuario en la interfaz.

## Avance en `feat/meta-publishing` — 26 de septiembre de 2026

- Migración `0081`: `workspace_members` y `sessions.active_workspace_id`. Los IDs y slugs personales son deterministas; cada paso admite repetición tras una escritura parcial.
- Better Auth ejecuta la creación tras insertar un usuario y selecciona el último workspace válido al abrir sesión, prefiriendo el `default` si corresponde.
- `ensureMembershipForUser` permite la reparación perezosa; AUTH-04 la conectará con `requireWorkspaceContext`. El asiento inicial se implementará en AUTH-08.
- Script `scripts/seed-workspace-owner.mts` recibe el email de un usuario existente; nunca crea usuarios. No se ejecutó contra una base de datos del usuario.
- Prueba con PGlite: alta concurrente, reparación, selección del workspace activo y cascada de membresía. Lint, build y db:check pasan. Falta comprobar login real con Google y ejecutar el seed en el entorno autorizado.
