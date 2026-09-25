---
id: AUTH-04
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p0]
---

# AUTH-04 — Crear la capa de acceso a datos y la autorización de rutas

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** [[AUTH-02]]

**Como** desarrollador, **quiero** una única forma de comprobar sesión y workspace en handlers y server components, **para** que ninguna ruta invente su propia autorización.

## Criterios de aceptación

- Crear `src/app/modules/auth/session-context.ts` (server-only) con `getSession()` memoizado con `cache` de React, `requireSession()` que redirige a `/login` en server components y `requireWorkspaceContext()` que devuelve `{ userId, workspaceId, role }` o falla con un error tipado.
- Crear `authorizeRadarRequest(request, options)` en `src/app/api/radar/radar-api-auth.ts` como sustituto de `authorizeRadarCollector`: acepta una sesión válida por cookie o el Bearer de servidor; para `POST`, `PUT`, `PATCH` y `DELETE` autorizados por cookie exige `Origin` o `Sec-Fetch-Site` del mismo sitio que `RADAR_APP_URL`; devuelve 401 o 403 uniformes; no responde 503 por falta de `RADAR_COLLECTOR_SECRET` cuando hay sesión.
- El contexto autorizado incluye el actor (`user:<id>` o `service:collector`) y, para sesiones, el `workspaceId` activo, para que los servicios lo usen en auditoría y filtrado.
- `requireTopic` acepta el `workspaceId` del contexto y rechaza topics de otro workspace con la misma respuesta que un topic inexistente.
- Mantener `authorizeRadarCollector` como alias deprecado hasta que AUTH-05 termine la sustitución.
- Pruebas `node:test` con la lógica pura separada de `process.env`: cookie válida, cookie expirada, Bearer correcto e incorrecto, `POST` con cookie y origen cruzado rechazado, `GET` con cookie sin `Origin` permitido, Bearer sin cookie en `POST` permitido.

## Notas de diseño

Seguir el patrón de `meta-oauth-state.ts`: la lógica de decisión no importa `server-only` para poder probarla; la lectura de variables de entorno vive en el módulo que la envuelve. Consultar la sección de route handlers y DAL de la guía de autenticación de Next 16 antes de implementar.

## Validación y entrega

Salida de las pruebas y revisión de que ninguna función nueva expone el token de sesión ni el secreto en errores o logs.
