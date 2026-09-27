---
id: PUB-10
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-10 — Publicar en Instagram, Facebook o ambos

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** elegir Instagram, Facebook o ambos al publicar, **para** distribuir una pieza aprobada sin duplicados.

**Prioridad:** P0 · **Dependencias:** [PUB-03](PUB-03.md), [PUB-04](PUB-04.md), [PUB-07](PUB-07.md), [PUB-09](PUB-09.md), [PUB-13](PUB-13.md), [PUB-14](PUB-14.md)

**Criterios de aceptación**

- Mostrar los destinos exactos y una vista previa por plataforma antes de autorizar. Reutilizar imágenes aprobadas y permitir variantes de texto versionadas por destino; cualquier cambio editorial exige aprobación de esa variante.
- Validar formatos y composición con las APIs vigentes. No asumir que un carrusel de Instagram tiene la misma representación en Facebook; mostrar y aprobar la representación admitida para cada destino.
- Crear entregas independientes por plataforma/cuenta con snapshot, idempotencia, IDs remotos y estado propios. El envío a ambos no promete atomicidad entre proveedores.
- Si Instagram termina y Facebook falla, mostrar éxito parcial y permitir reintento solo del destino fallido cuando sea seguro. Resultados inciertos se reconcilian antes de reenviar.
- Permitir enviar a Facebook una pieza ya publicada en Instagram mediante una orden explícita solo para Facebook; conservar el historial de Instagram sin republicarlo.
- Cubrir doble clic, concurrencia, fallo parcial, pérdida de permisos y recuperación de registro local sin reenvío. Confirmar publicación por identidad remota, no por contenedor listo.

## Paridad funcional y controles de envío

- El primer alcance replica la publicación visual existente: foto o carrusel de imágenes en Instagram y foto/publicación con varias imágenes en Facebook, acompañadas de texto. La composición de Facebook se valida con la API elegida antes de ofrecerla; nunca reemplazar silenciosamente una pieza por varias publicaciones.
- Instagram conectado directamente o mediante Facebook utiliza el mismo contrato de entrega y adapta hosts, tokens y permisos según el mecanismo. Una Story no se duplica al distribuirla.
- Congelar la selección de destinos al autorizar, con paquete específico por destino y un identificador de orden común. Una cuenta que se conecte después no recibe automáticamente órdenes anteriores.
- Antes de crear medios y antes del envío irreversible, comprobar vigencia del permiso del actor o política, aprobación, cuenta, paquete, duplicados y límites. Los workers usan leases persistidos y reanudan con el navegador cerrado.
- Persistir intentos e IDs de fotos/contenedores intermedios. En Facebook, la preparación de varias imágenes no debe publicar fotos sueltas visibles antes del post aprobado; comprobar semántica de la API y limpiar preparaciones abandonadas solo cuando sea seguro.
- Un ID de publicación confirmado genera un evento durable para PUB-06. Un ID de subida o de contenedor no cuenta como publicación. Si falla la proyección local, mostrar «Publicada; registro local pendiente» y reparar sin reenviar.
- La orden de ambos destinos admite resultados parciales y horas reales distintas. «Reintentar» solo opera sobre un fallo seguro; «Pendiente de confirmación» permite reconciliar o investigar, nunca un nuevo envío automático.

## Validación y entrega

Matriz de foto/varias imágenes × Facebook/Instagram directo/Instagram mediante Facebook; doble clic, expiración de permisos entre preparación y envío, post confirmado con escritura local fallida y un destino publicado con el otro incierto. Integrar PUB-06 antes de declarar completo el recorrido de usuario.
