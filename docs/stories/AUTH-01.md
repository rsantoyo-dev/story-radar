---
id: AUTH-01
feature: FEAT-AUTH-001
status: review
board: authentication.kanban.md
tags: [auth, review, p0]
---

# AUTH-01 — Instalar Better Auth con Drizzle, esquema de identidad e inicio de sesión con Google

**Estado:** [[status-review]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** Ninguna

**Como** operador de la plataforma, **quiero** que exista un sistema de identidad con usuarios, sesiones y cuentas de Google en nuestra base de datos, **para** dejar de depender de un secreto compartido.

## Criterios de aceptación

- Añadir `better-auth` y `@better-auth/drizzle-adapter` en la misma versión (1.7.6). Leer `node_modules/next/dist/docs/` sobre route handlers y `headers()` antes de crear la ruta.
- Crear `src/db/schema/auth.ts` con `users`, `sessions`, `accounts` y `verifications` siguiendo las convenciones del repo: tablas en plural, columnas snake_case, `timestamp` con zona horaria y `mode: "date"`, índices en `sessions.user_id`, `accounts.user_id` y `verifications.identifier`, email único sin distinguir mayúsculas. Las propiedades conservan los nombres de campo de Better Auth. Exportar desde `src/db/schema/index.ts`.
- Generar una migración aditiva con `npm run db:generate`; `npm run db:check` limpio; ninguna tabla existente cambia en esta historia. La migración no se aplica a Neon desde la sesión de desarrollo sin confirmación.
- Crear `src/app/modules/auth/auth.ts` con `import "server-only"`: `drizzleAdapter(db, { provider: "pg", usePlural: true, schema })`, `socialProviders.google` con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, `nextCookies()` como último plugin, `secret` y `baseURL` desde `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`, `trustedOrigins` limitado a esa URL, `emailAndPassword` desactivado. Sin `BETTER_AUTH_SECRET` el módulo falla de forma explícita, igual que `db/client.ts` con `DATABASE_URL`.
- No activar `transaction: true` en el adaptador: `neon-http` no soporta transacciones. Documentarlo en el propio archivo.
- Crear `src/app/api/auth/[...all]/route.ts` con `toNextJsHandler(auth)` y `runtime = "nodejs"`.
- Crear `src/app/modules/auth/auth-client.ts` con `createAuthClient` de `better-auth/react`; no contiene secretos ni URLs privilegiadas.
- Documentar en `.env.example` las variables nuevas, cómo generar el secreto y qué URI de redirección registrar en Google Cloud.
- Verificación local: con credenciales de Google configuradas, un inicio de sesión crea `users`, `accounts` y `sessions`; la cookie llega con `HttpOnly`, `SameSite=Lax` y `Secure` bajo `npm run dev:https`. `npm run lint` y `npm run build` pasan.

## Notas de diseño

El handler de Better Auth no se protege con `authorizeRadarCollector`: la librería gestiona sus propias rutas y límites. La lista `AUTH_ALLOWED_EMAILS` y el workspace personal llegan en AUTH-08 y AUTH-02; en esta historia cualquier cuenta de Google admitida por la pantalla de consentimiento puede crear usuario.

## Validación y entrega

Hecho el 25 de septiembre de 2026: paquetes instalados (con `.npmrc` `legacy-peer-deps=true` por un peer opcional de SvelteKit), `src/db/schema/auth.ts`, migración `0077_auth_identity.sql` generada y `db:check` limpio, `auth.ts`, `auth-client.ts`, handler `/api/auth/[...all]`, `.env.example`. `lint`, `build` y `npm test` (936 pruebas) pasan. Prueba de humo en local con un servidor de desarrollo temporal: `/api/auth/ok` responde 200, `get-session` sin cookie responde `null`, y `POST sign-in/social` responde `PROVIDER_NOT_FOUND` mientras Google no está configurado. La comprobación de origen de Better Auth no se activó en esa prueba porque `curl` no envía cookie ni cabeceras `Sec-Fetch-*`; leído el middleware `origin-check` de la versión 1.7.6, un navegador que haga `POST` entre sitios sí recibe 403 (`INVALID_ORIGIN` o `CROSS_SITE_NAVIGATION_LOGIN_BLOCKED`). Se confirma con credenciales reales. Pendiente: aplicar la migración en Neon y probar el inicio de sesión real con credenciales de Google.

Registrar el resultado de `db:check`, la salida de la verificación local y el diff de `.env.example`. Actualizar ficha y tablero al completar los criterios.
