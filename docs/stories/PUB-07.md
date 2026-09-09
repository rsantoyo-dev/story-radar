---
id: PUB-07
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-07 — Evitar duplicados y reconciliar resultados inciertos

**Estado:** [[status-review]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

> Implementado junto con PUB-04 y corregido el 9 de septiembre: clave idempotente,
> reintentos explícitos con límite configurable, lease con comprobación de caducidad,
> pasos acotados y recuperación independiente del navegador. Una interrupción en
> `publishing` se reconcilia sin reenviar. Los resultados sin ID remoto exacto se
> conservan como incidencia; no se confirma por similitud ni por contenedor terminado.
> Pendiente: QA contra el proveedor y comprobación operativa del worker desplegado.

**Como** editor, **quiero** evitar duplicados y reconciliar resultados inciertos, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03

**Criterios de aceptación**

- Cada orden tiene ID idempotente persistido y una clave para el paquete, cuenta y acción. Doble clic, dos workers y reintentos de red no crean automáticamente intenciones nuevas.
- Los workers reclaman trabajos con bloqueo o lease y versión; las transiciones son condicionales. Una respuesta antigua no sobrescribe una cancelación, reprogramación o decisión nueva.
- Un timeout después de media_publish pasa a “Pendiente de confirmación”. Se consulta el estado del contenedor y se reconcilia antes de reintentar una operación potencialmente publicada; no se promete exactly-once remoto.
- Se diferencian fallos seguros para reintentar, errores de permisos, límites de API, contenedores expirados y resultados inciertos. Reintentos, consultas, coste y tiempo son acotados y configurables.
- No se marca “Publicado” por texto parecido, por fecha cercana ni por contenedor listo. Si no puede recuperarse un resultado cierto, se conserva la incidencia para resolución explícita sin un nuevo envío automático.
- Se verifica el límite disponible de publicación de la cuenta; se registran errores saneados y métricas operativas, sin tokens ni URLs de entrega secretas en el navegador o logs.

## Correcciones de recuperación

- `INSTAGRAM_PUBLISH_MAX_ATTEMPTS` limita los intentos explícitos (4 por defecto, rango 1–10). No se reinicia la cuenta de intentos al reintentar.
- `INSTAGRAM_PUBLISH_MAX_MINUTES` limita preparación/consultas inciertas (30 minutos por defecto, rango 5–60). El límite depende del inicio persistido, no de la pestaña ni de una instancia de proceso. Una incidencia vencida queda suspendida.
- `FINISHED` tras una respuesta incierta no habilita otro `media_publish`. `PUBLISHED` sin ID remoto tampoco habilita registro ni reenvío: requiere investigación manual. La resolución asistida de esas incidencias no está implementada.
- Con ID remoto guardado, se reintenta solo el registro local; los errores locales no invalidan ni vuelven a publicar el resultado remoto. La recuperación local puede continuar hasta que la base vuelva a estar disponible. Los intentos de obtener un permalink ausente están acotados por la ventana configurada.
- El worker registra mensajes saneados e ID de job. La ruta interna usa un secreto dedicado que nunca se entrega al navegador.

Pruebas de regresión: lease perdido/caducado, workers concurrentes, POST repetido, fallos seguros, timeout, interrupción en `publishing`, fallo al guardar la respuesta remota y fallo posterior al registrar el vínculo. Véase [operación del worker](../features/instagram-publishing-worker.md).

Corrección de QA: una suspensión `invalidated` con `attempts = 0`, sin contenedores ni ID de media, permite revalidación y reintento explícitos sobre la misma orden. Un POST repetido y el worker mantienen la suspensión; solo el botón de reintento la reactiva. La evidencia de acceso se compara con el reloj posterior a la consulta asíncrona, evitando rechazar una comprobación recién emitida.
