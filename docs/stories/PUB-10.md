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

**Prioridad:** P0 · **Dependencias:** PUB-03, PUB-04, PUB-07, PUB-09

**Criterios de aceptación**

- Mostrar los destinos exactos y una vista previa por plataforma antes de autorizar. Reutilizar imágenes aprobadas y permitir variantes de texto versionadas por destino; cualquier cambio editorial exige aprobación de esa variante.
- Validar formatos y composición con las APIs vigentes. No asumir que un carrusel de Instagram tiene la misma representación en Facebook; mostrar y aprobar la representación admitida para cada destino.
- Crear entregas independientes por plataforma/cuenta con snapshot, idempotencia, IDs remotos y estado propios. El envío a ambos no promete atomicidad entre proveedores.
- Si Instagram termina y Facebook falla, mostrar éxito parcial y permitir reintento solo del destino fallido cuando sea seguro. Resultados inciertos se reconcilian antes de reenviar.
- Permitir enviar a Facebook una pieza ya publicada en Instagram mediante una orden explícita solo para Facebook; conservar el historial de Instagram sin republicarlo.
- Cubrir doble clic, concurrencia, fallo parcial, pérdida de permisos y recuperación de registro local sin reenvío. Confirmar publicación por identidad remota, no por contenedor listo.
