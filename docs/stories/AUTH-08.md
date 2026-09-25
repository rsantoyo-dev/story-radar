---
id: AUTH-08
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p1, billing]
---

# AUTH-08 — Registrar el crédito inicial de 1 USD y el bloqueo de alfa

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P1 · **Dependencias:** [[AUTH-02]]

**Como** responsable del producto, **quiero** que cada workspace nuevo nazca con 1 USD de crédito registrado y poder limitar quién entra durante la alfa, **para** abrir el registro sin regalar consumo de IA a desconocidos.

## Criterios de aceptación

- Crear `workspace_credit_entries` en `src/db/schema/workspace-credit-entries.ts`: `id` text, `workspace_id` con borrado restringido, `kind` con check (`signup_grant` por ahora), `amount_micros` entero con check de signo según `kind`, `idempotency_key` único, `actor` text, `created_at`. Append-only: sin `updated_at` y sin rutas de edición o borrado.
- `ensurePersonalWorkspace` registra el asiento `signup_grant` por `AUTH_SIGNUP_CREDIT_USD` (por defecto 1, es decir 1 000 000 micros, la misma unidad que `creative_text_calls`) con clave `signup_grant:<workspace_id>`; repetir la llamada no duplica el asiento.
- Función `getWorkspaceCreditBalance(workspaceId)` que suma los asientos; se muestra en el menú de usuario como "Crédito disponible". No hay consumo todavía: FEAT-BILL-001 conectará `creative_text_calls` con asientos `usage`.
- `AUTH_ALLOWED_EMAILS` opcional: lista separada por comas de emails o dominios (`@ejemplo.com`). Un hook `databaseHooks.user.create.before` rechaza con `APIError` y mensaje genérico los emails no admitidos; vacía significa abierto. Documentar en `.env.example` que el bloqueo principal de la alfa es la lista de usuarios de prueba de la pantalla de consentimiento de Google.
- Pruebas con PGlite: asiento único por workspace tras dos llamadas; saldo correcto; lista vacía admite cualquiera; dominio y email admitidos y rechazados.

## Notas de diseño

El importe inicial es configuración, no código: cambiarlo no requiere migración. El actor del asiento es `system:signup`.

## Validación y entrega

Salida de las pruebas y captura del saldo en el menú de usuario con un workspace recién creado.
