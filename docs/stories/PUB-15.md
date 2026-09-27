---
id: PUB-15
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0, meta, linking]
---

# PUB-15 — Sincronizar publicaciones de Meta y vincularlas con Stories

**Estado:** [[status-todo]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P0 · **Dependencias:** [PUB-09](PUB-09.md), [PUB-13](PUB-13.md), [IG-02](IG-02.md), [IG-04](IG-04.md)

**Como** editor, **quiero** consultar publicaciones existentes de Facebook e Instagram y asociarlas a una Story, **para** conservar el historial aunque se hayan publicado fuera de Press Craftor.

## Criterios de aceptación

- Añadir a la galería la lectura paginada de publicaciones de la Página de Facebook conectada. Reutilizar el flujo de Instagram con ambos mecanismos de autorización, preservando filtros y navegación por Topic/cuenta/plataforma.
- Persistir ID remoto, cuenta, plataforma, tipo, texto y medios disponibles, fecha, permalink, origen externo/app y fechas de sincronización. Sincronizar no crea órdenes de envío ni importa contenido de cuentas no autorizadas.
- Upsert por identidad remota y cursores reanudables, con reintentos acotados y estados de permisos/rate limit. Un post publicado por la app y luego encontrado por sync sigue siendo un solo registro.
- Permitir buscar una Story del mismo Topic, vincularla, corregirla o desvincularla con autor y fecha. Una Story admite varios posts y un post tiene como máximo un vínculo editorial actual; un cambio de vínculo actualiza las proyecciones de las dos Stories afectadas.
- Para históricos, draft, revisión y assets son opcionales y se muestran como «Versión no identificada». No fabricar evidencia de aprobación ni un paquete de origen. Un simple enlace pegado sin verificación no equivale a un envío confirmado por la app.
- Las propuestas por URL o similitud requieren confirmación si no hay identidad inequívoca. El vínculo automático de una publicación propia procede de su orden y paquete, según PUB-06.
- Separar el origen inmutable de una entrega propia del vínculo editorial corregible. Sync, reparación y reautorización conservan las correcciones y los desvínculos manuales; las métricas e histórico no se eliminan al corregirlos.
- Un post enlazado y verificado contribuye al indicador de Story publicada con origen «Publicación externa vinculada». No aprueba el draft actual ni cambia la decisión editorial existente.
- La falta temporal de acceso o de un post en una página de resultados no implica borrado remoto. Conservar el registro y señalar error de acceso, no disponible o eliminación confirmada según la evidencia.

## Validación y entrega

Cubrir Facebook sin Instagram, Instagram por ambos accesos, paginación interrumpida, sync repetido, post propio encontrado por sync, vínculo/desvínculo manual y rechazo de IDs de otro Topic/workspace. Verificar que corregir el vínculo no borra métricas ni provoca otro envío.
