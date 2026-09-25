---
id: AUTH-03
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p0, ui]
---

# AUTH-03 — Construir la página de acceso con Google, menú de usuario y cierre de sesión

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** [[AUTH-01]]

**Como** editor, **quiero** entrar con un clic usando mi cuenta de Google y cerrar sesión desde la aplicación, **para** acceder sin pegar secretos.

## Criterios de aceptación

- Crear el grupo de rutas `src/app/(auth)/login/` con un layout propio sin dashboard: nombre del producto, botón "Continuar con Google" y texto breve de alfa. Si ya hay sesión, redirige a `/`.
- El botón llama a `authClient.signIn.social({ provider: "google", callbackURL })`; `callbackURL` solo acepta rutas relativas del mismo sitio leídas del parámetro `next`. Estados de carga y de error genérico (cancelación en Google, cuenta no admitida) sin detalles técnicos.
- Página `/no-access` para el caso excepcional de sesión sin workspace, con cierre de sesión.
- Menú de usuario en el dashboard con nombre o email, avatar de Google si existe y cierre de sesión (`authClient.signOut` con redirección a `/login`).
- UXDSL: roles de Button y Surface, `density(n)` para espaciado, `palette(...)` para color, tipografía configurada; foco visible y navegación por teclado; responsive con los breakpoints existentes. Tema neutro de la aplicación, no la paleta de un topic.
- Ninguna página de este grupo envía `Authorization` ni lee `sessionStorage`.

## Notas de diseño

Leer `docs/uxdsl-agent-guide.md` y `uxdsl.config.js` antes de estilizar. El logotipo de Google en el botón sigue las guías de marca de Google para botones de inicio de sesión.

## Validación y entrega

Capturas de la página en móvil y escritorio y prueba manual del ciclo completo con una cuenta de prueba de Google en local.
