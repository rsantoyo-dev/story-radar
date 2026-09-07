---
id: PUB-02
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-02 — Verificar la capacidad de publicar de la cuenta

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** verificar la capacidad de publicar de la cuenta, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01

**Criterios de aceptación**

- La configuración verifica instagram_business_content_publish para Instagram Login y los requisitos de acceso de la aplicación en la versión elegida. No se considera que insights operativo implique permiso de publicación.
- La UI distingue cuenta desconectada, reconexión necesaria, permiso de publicación ausente y cuenta habilitada. Nunca publica un post de prueba para verificar acceso sin una orden explícita.
- Cada intención fija el ID de cuenta, tema y revisión de conexión. Cambiar de cuenta no redirige trabajos pendientes; reconectar exige comprobar que sigue siendo la misma cuenta y que el trabajo continúa autorizado.
- Las credenciales y llamadas viven en servidor. Una capacidad ausente bloquea el envío con un motivo y conserva el borrador listo editorialmente.
