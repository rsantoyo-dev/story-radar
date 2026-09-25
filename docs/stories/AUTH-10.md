---
id: AUTH-10
feature: FEAT-AUTH-001
status: backlog
board: authentication.kanban.md
tags: [auth, backlog, p2, saas]
---

# AUTH-10 — Invitaciones y equipos por workspace

**Estado:** [[status-backlog]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P2 · **Dependencias:** [[AUTH-06]] · [[AUTH-09]]

**Como** owner de un workspace, **quiero** invitar a otras personas con un rol, **para** trabajar en equipo sobre los mismos topics y créditos.

## Criterios de aceptación

- Evaluar el plugin `organization` de Better Auth mapeado sobre `workspaces` y `workspace_members` (mismos nombres de campo) frente a una implementación propia de invitaciones; decidir con una prueba de mapeo en PGlite antes de escribir migraciones.
- Invitaciones por correo con expiración, aceptación autenticada, roles `admin` y `member`, revocación y lista de miembros en la configuración del workspace.
- Cambio de workspace activo desde la interfaz; la sesión actualiza `active_workspace_id` y el dashboard recarga topics.
- Requiere el proveedor de correo de AUTH-09.
