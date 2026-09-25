---
id: AUTH-05
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p0]
---

# AUTH-05 — Retirar el secreto del navegador y proteger la aplicación

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** [[AUTH-03]] · [[AUTH-04]]

**Como** operador, **quiero** que el navegador nunca conozca `RADAR_COLLECTOR_SECRET`, **para** que el acceso dependa de cuentas revocables y no de un secreto compartido.

## Criterios de aceptación

- Sustituir `authorizeRadarCollector` por `authorizeRadarRequest` en los 69 handlers. Conservar la aceptación de Bearer en los que llaman los workers y el cron (recolección, preparación diaria, publicaciones). El handler interno del worker de Instagram y la entrega pública por token no cambian.
- Eliminar `COLLECTOR_SECRET_STORAGE_KEY`, la lectura y escritura de `sessionStorage`, el campo de secreto del dashboard y la cabecera `Authorization` de `requestJson` y de los 20 componentes cliente. Los `fetch` siguen siendo del mismo origen con `cache: "no-store"` y envían la cookie por defecto.
- Crear `src/proxy.ts` con un `matcher` que excluya `_next`, `favicon`, `/api/auth`, `/api/deliver` y `/api/internal`; redirige a `/login?next=` cuando falta la cookie de sesión (`getSessionCookie`) en páginas; no toma decisiones para rutas de API ni consulta la base de datos.
- `src/app/page.tsx` obtiene el contexto con `requireWorkspaceContext()`; el dashboard muestra un menú de usuario con nombre o email y cierre de sesión; `/no-access` atiende al usuario sin workspace.
- Flag transitoria `AUTH_REQUIRED` leída en servidor: con `false`, `authorizeRadarRequest` sigue aceptando el Bearer desde el navegador durante una versión como retroceso. Documentar la fecha de retirada.
- QA: el flujo de conexión de Instagram funciona tras el redirect de Meta sin `sessionStorage`; los workers con Bearer siguen operando; una petición `POST` desde otro origen con la cookie es rechazada; `npm run lint` y `npm run build` pasan.

## Notas de diseño

La sustitución en los handlers es mecánica y debe hacerse en un solo cambio revisable; la retirada de la cabecera en los componentes puede ir en un segundo cambio. Revisar la sección de proxy de la documentación local de Next 16: los server functions no pasan por el proxy.

## Validación y entrega

Revisar el bundle del cliente y la pestaña de red para confirmar que no aparece ningún Bearer. Registrar la lista de handlers que conservan el Bearer y por qué.
