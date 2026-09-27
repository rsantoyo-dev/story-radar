---
id: PUB-12
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-12 — Unificar seguimiento de Instagram y Facebook

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** ver el resultado de cada destino en un solo lugar, **para** resolver fallos y rastrear lo publicado.

**Prioridad:** P0 · **Dependencias:** [PUB-06](PUB-06.md), [PUB-10](PUB-10.md), [PUB-15](PUB-15.md) · **Calendario:** [PUB-05](PUB-05.md)

**Criterios de aceptación**

- Mostrar plataforma, cuenta/página, snapshot, hora prevista y real, estado, ID y enlace remoto cuando esté disponible; conservar varias entregas de una misma historia.
- Distinguir éxito parcial, fallo seguro y resultado incierto. Cada acción de reintento o reconciliación opera sobre la entrega correspondiente.
- Conservar asociaciones y correcciones manuales al sincronizar. Un fallo de registro local después del éxito remoto se repara sin publicar de nuevo.
- Press Craftor gestiona las órdenes creadas aquí. No afirmar sincronización bidireccional de calendario con Meta Business Suite; esta queda como herramienta complementaria de gestión nativa.
- Las métricas avanzadas, bandeja de comentarios/mensajes y recomendaciones de mejor hora quedan fuera de esta entrega; el rendimiento de Instagram conserva su feature existente.

## Historial y control desde la aplicación

- Vista de actividad por Topic con filtros de Story, plataforma, cuenta, estado, origen, fecha y autor. Desde cada Story navegar a todas sus órdenes, posts, previews y snapshots, incluidos envíos externos vinculados.
- La línea de tiempo registra generación/preparación, aprobación o política autorizante, programación/reprogramación, cancelación, intentos, confirmación, reparaciones y cambios manuales de vínculo. Los eventos incluyen actor humano/servicio/agente y fecha; no contienen tokens ni URLs de entrega privadas.
- Mostrar separado el estado de cada destino y el resumen de la orden. Un éxito parcial debe indicar dónde ya existe el post y qué falta, con enlaces remotos cuando estén disponibles.
- Acciones habilitadas por estado y permiso: revisar preview, publicar, programar, reprogramar, cancelar, reintentar fallo seguro, reconciliar resultado incierto y corregir vínculo. Cada acción consulta el estado actual en servidor y registra su resultado.
- Las notificaciones dentro de la app destacan publicación completada, éxito parcial, permisos revocados, reparación pendiente y programación suspendida. Recargar o reconectar muestra el estado persistido sin depender de una pestaña que haga polling.
- Mantener la historia de versiones aunque se edite el draft actual, se desconecte la cuenta o se pause el workflow. El detalle puede quedar en solo lectura cuando el usuario pierde permisos de acción pero conserva acceso al Topic.
- Integrar calendario cuando PUB-05 esté habilitada y métricas básicas cuando PUB-18 lo esté; ambas capacidades declaran su disponibilidad sin bloquear la consulta del historial ya existente.
- Diseñar con UXDSL, estados accesibles, botones de tamaño consistente, foco visible, paginación y presentación móvil.

## Validación y entrega

Recorrido desde Story → preview → programación/envío → historial → post remoto → versión exacta. Cubrir éxito parcial, cancelación que llega tarde, recuperación local, vínculo corregido, actor sin permiso y cuenta desconectada con posts históricos.
