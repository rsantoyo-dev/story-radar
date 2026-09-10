---
id: PUB-12
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p1]
---

# PUB-12 — Unificar seguimiento de Instagram y Facebook

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** ver el resultado de cada destino en un solo lugar, **para** resolver fallos y rastrear lo publicado.

**Prioridad:** P1 · **Dependencias:** PUB-06, PUB-10

**Criterios de aceptación**

- Mostrar plataforma, cuenta/página, snapshot, hora prevista y real, estado, ID y enlace remoto cuando esté disponible; conservar varias entregas de una misma historia.
- Distinguir éxito parcial, fallo seguro y resultado incierto. Cada acción de reintento o reconciliación opera sobre la entrega correspondiente.
- Conservar asociaciones y correcciones manuales al sincronizar. Un fallo de registro local después del éxito remoto se repara sin publicar de nuevo.
- Press Craftor gestiona las órdenes creadas aquí. No afirmar sincronización bidireccional de calendario con Meta Business Suite; esta queda como herramienta complementaria de gestión nativa.
- Las métricas avanzadas, bandeja de comentarios/mensajes y recomendaciones de mejor hora quedan fuera de esta entrega; el rendimiento de Instagram conserva su feature existente.
