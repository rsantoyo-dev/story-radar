---
id: GEO-04
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.kanban.md
tags: [geo, done, p0]
---

# GEO-04

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-03]]

<!-- body -->
**GEO-04 — Incorporar fotografías y registrar procedencia**

**Como** editor, **quiero** que el sistema reutilice fotografías de la biblioteca o incorpore material de fuentes habilitadas, **para** disponer de imágenes reales sin seleccionarlas durante cada publicación.

**Prioridad:** P0 · **Dependencias:** GEO-03 · **Entrega:** Preparación automática

**Criterios de aceptación**

- La ingestión automática acepta material propio o con condiciones de uso registradas y compatibles con la preparación y destino previstos; que una foto aparezca en una noticia no supone permiso para reutilizarla.
- Cada original guarda hash, dimensiones, tipo, lugar, fuente, autor conocido, condiciones de uso, atribución requerida y fecha de captura cuando exista.
- La fecha de descarga nunca se usa como fecha de captura. “Fecha desconocida” es un valor válido.
- Los archivos se validan por contenido, tamaño y dimensiones, se almacenan mediante las abstracciones privadas de R2 y se entregan con acceso controlado.
- Se conservan originales y versiones sin reemplazos destructivos. Los metadatos privados no se incorporan automáticamente a la exportación pública.
- La biblioteca está aislada por tema; no se reutilizan fotos privadas entre marcas sin una acción autorizada.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-04

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.
