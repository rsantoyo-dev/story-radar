---
id: AUTH-07
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p1, security]
---

# AUTH-07 — Endurecer sesiones, límites y auditoría

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P1 · **Dependencias:** [[AUTH-05]]

**Como** operador, **quiero** límites, revocación y auditoría razonables, **para** resistir ataques comunes y saber quién hizo qué.

## Criterios de aceptación

- Límites de tasa con `storage: "database"` y reglas específicas para las rutas de `/api/auth` (inicio social, callback, sesión); ventana y máximos documentados en `auth.ts`.
- `session.expiresIn` de 7 días, `updateAge` de 24 horas, `cookieCache` con estrategia `compact` y 5 minutos; `useSecureCookies` en producción y `cookiePrefix` propio.
- `accountLinking` habilitado solo con `trustedProviders: ["google"]`; `allowDifferentEmails` desactivado.
- Pantalla de sesiones activas con IP, user agent y fecha; revocar una o todas las demás.
- Cabeceras de seguridad en `next.config.ts`: CSP compatible con UXDSL, las fuentes de Google y las imágenes permitidas; `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options`.
- Auditoría: `connected_by` y las demás acciones sensibles registran `user:<id>`; los logs no incluyen tokens ni emails completos.
- `npm audit` sin vulnerabilidades altas en los paquetes añadidos; registrar versión fijada.

## Notas de diseño

La memoria de proceso no es válida para límites en Vercel; si el coste en Neon resulta alto, evaluar `secondary-storage` con Upstash antes que relajar los límites.

## Validación y entrega

Pruebas manuales de bloqueo por tasa y de revocación desde otro navegador; revisión de cabeceras con una herramienta externa.
