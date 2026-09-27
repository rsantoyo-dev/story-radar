---
id: PUB-13
feature: FEAT-PUB-001
status: in-progress
board: instagram-publishing.kanban.md
tags: [publishing, in-progress, p0, meta]
---

# PUB-13 — Compartir el contrato de publicación entre Facebook e Instagram

**Estado:** [[status-in-progress]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P0 · **Dependencias:** [PUB-03](PUB-03.md), [PUB-07](PUB-07.md)

**Como** editor, **quiero** que una Story pueda tener entregas independientes en Facebook e Instagram, **para** distribuirla y recuperarla con los mismos controles.

## Criterios de aceptación

- Definir el contrato común de destino, paquete inmutable, orden, entrega, intento y confirmación. Una orden agrupa los destinos elegidos; cada entrega fija workspace, Topic, Story, Editorial Line cuando exista, plataforma, identidad remota, revisión de conexión, paquete y autorización.
- Un mismo Story admite varias entregas históricas, incluso en la misma plataforma. Una republicación deliberada crea otra orden; reintentar conserva la identidad de la entrega original.
- Identificar de forma única una publicación por plataforma, cuenta/página e ID remoto. No usar URL, caption, fecha o nombre visible como identidad.
- Extraer las capacidades compartidas de validación, leases, idempotencia, auditoría y reparación. Instagram Login, Instagram mediante Facebook Login y Facebook Pages actúan como adaptadores; cada uno declara capacidades, permisos y formatos según su API.
- Resolver una sola conexión activa por destino al autorizar. Conectar la misma cuenta de Instagram por dos mecanismos no genera dos destinos ni dos envíos. Los trabajos anteriores mantienen su revisión de conexión; sustituirla requiere suspensión y reautorización explícita, sin redirección automática.
- Mantener paquetes, jobs, IDs, vínculos y snapshots de Instagram existentes mediante compatibilidad o migración aditiva. No reinterpretar estados históricos ni reprocesar trabajos publicados durante la migración.
- Persistir la confirmación remota antes de proyectar galería y estado de Story. Una reparación local reutiliza esa confirmación y no ejecuta otra publicación.
- Mantener la lista de destinos originalmente autorizada y un estado por entrega. Mostrar resultados parciales sin presentar la orden completa como publicada si falta un destino; cancelar uno queda registrado y no convierte retroactivamente la orden original en un éxito total.
- `story_social_publications` sigue siendo un resumen compatible por Topic/Story/plataforma. Su índice único no limita el historial. Separar la fecha prevista de la fecha real para admitir «Publicar ahora» antes del horario programado.

## Límites y compatibilidad

La persistencia actual `instagram_publication_packages` y `instagram_publication_jobs` es la base de transición. Elegir una extensión o tablas comunes según las restricciones reales de sus claves y snapshots; documentar el mapeo y la recuperación. Evitar duplicar todo el pipeline para Facebook o migrar el motor editorial completo.

Los estados propuestos y el significado de «Story publicada» están definidos en la [feature](../features/instagram-publishing.md#estados-y-significado-de-publicada).

## Validación y entrega

Pruebas de doble clic, dos workers, coexistencia de conexiones, varias publicaciones de una Story, aislamiento de Topic, conservación de históricos y reparación tras éxito remoto. La migración se prueba con jobs en curso y publicados; ejecutar `npm run db:check` si cambia el esquema.

## Implementación en rama `feat/meta-publishing` — 26 de septiembre de 2026

- `meta_publication_orders` conserva la autorización y destinos originales; `meta_publication_deliveries` permite varias entregas históricas por Story y destino; `meta_publication_confirmations` fija el ID remoto por plataforma y cuenta. La migración `0080` incorpora los jobs de Instagram publicados y pendientes conservando sus IDs.
- El servicio actual de Instagram sincroniza su job con la orden y la entrega. Una respuesta con ID remoto persiste primero la confirmación; la proyección en `topic_instagram_media` se repara desde el mismo job sin otra llamada `media_publish`. La nueva escritura falla cerrada si la identidad histórica no coincide.
- `story_social_publications` admite fecha efectiva anterior a la planificada para la futura acción «Publicar ahora». Sigue siendo un resumen compatible, no un historial.
- Pruebas con PostgreSQL en memoria cubren dos requests/workers, retries, vínculo manual, fallo local tras respuesta remota y migración con un job publicado y otro pendiente. `lint`, `build` y `db:check` pasan.
- Pendiente de PUB-09/PUB-10: adaptadores y capacidades de Facebook Pages/Instagram por Facebook Login, creación de órdenes con dos destinos y pruebas de fallos parciales. La migración requiere aplicación en el entorno antes de desplegar el código del worker; no se ejecutó contra producción.
