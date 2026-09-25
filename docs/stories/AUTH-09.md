---
id: AUTH-09
feature: FEAT-AUTH-001
status: backlog
board: authentication.kanban.md
tags: [auth, backlog, p2]
---

# AUTH-09 — Añadir un segundo método de acceso con correo

**Estado:** [[status-backlog]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P2 · **Dependencias:** [[AUTH-07]]

**Como** persona sin cuenta de Google, **quiero** entrar con mi correo, **para** no depender de un proveedor externo.

## Criterios de aceptación

- Elegir entre enlace mágico y email con contraseña; ambos requieren un proveedor de correo transaccional (Resend, disponible en el Marketplace de Vercel, o equivalente) tras una interfaz propia `AuthMailer`.
- Verificación de correo obligatoria antes de crear sesión; mensajes que no permiten enumerar cuentas.
- Vinculación con cuentas de Google existentes solo por email verificado; sin `allowDifferentEmails`.
- Con contraseña: scrypt por defecto, longitud mínima 10, plugin `haveIBeenPwned`, restablecimiento que revoca otras sesiones.
