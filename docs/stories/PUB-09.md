---
id: PUB-09
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-09 — Conectar una página de Facebook

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** conectar una página de Facebook que administro, **para** publicar en ella manteniendo la conexión de Instagram existente.

**Prioridad:** P0 · **Dependencias:** PUB-02

**Criterios de aceptación**

- Identificar la página destino y verificar autorización y capacidad de publicación con la API oficial vigente antes de habilitarla. La conexión de Instagram Login no se interpreta como autorización de Facebook Pages.
- Conservar por separado identidad, revisión y estado de cada conexión. Reconectar o cambiar de página nunca redirige órdenes ya autorizadas.
- Mostrar cuenta/página conectada, permiso ausente, autorización vencida y reconexión necesaria. Los tokens y llamadas permanecen en servidor y aislados por tema y usuario autorizado.
- Documentar permisos, revisión de aplicación y requisitos de la versión elegida durante implementación. El alcance es páginas administradas; no perfiles personales.
- Validar conexión sin publicar automáticamente. Registrar QA con una página de prueba y autorización explícita para cualquier envío real.
