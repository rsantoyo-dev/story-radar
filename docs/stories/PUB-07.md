---
id: PUB-07
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-07 — Evitar duplicados y reconciliar resultados inciertos

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** evitar duplicados y reconciliar resultados inciertos, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03

**Criterios de aceptación**

- Cada orden tiene ID idempotente persistido y una clave para el paquete, cuenta y acción. Doble clic, dos workers y reintentos de red no crean automáticamente intenciones nuevas.
- Los workers reclaman trabajos con bloqueo o lease y versión; las transiciones son condicionales. Una respuesta antigua no sobrescribe una cancelación, reprogramación o decisión nueva.
- Un timeout después de media_publish pasa a “Pendiente de confirmación”. Se consulta el estado del contenedor y se reconcilia antes de reintentar una operación potencialmente publicada; no se promete exactly-once remoto.
- Se diferencian fallos seguros para reintentar, errores de permisos, límites de API, contenedores expirados y resultados inciertos. Reintentos, consultas, coste y tiempo son acotados y configurables.
- No se marca “Publicado” por texto parecido, por fecha cercana ni por contenedor listo. Si no puede recuperarse un resultado cierto, se conserva la incidencia para resolución explícita sin un nuevo envío automático.
- Se verifica el límite disponible de publicación de la cuenta; se registran errores saneados y métricas operativas, sin tokens ni URLs de entrega secretas en el navegador o logs.
