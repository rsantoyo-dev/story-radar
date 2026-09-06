---
id: GEO-09
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.board.md
tags: [geo, done, p0]
---

# GEO-09

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-04]] · [[GEO-08]]

<!-- body -->
**GEO-09 — Buscar fotografías candidatas del lugar confirmado**

**Como** editor, **quiero** encontrar fotografías con procedencia verificable, **para** disponer de alternativas cuando la biblioteca no tiene material.

**Prioridad:** P0 · **Dependencias:** GEO-04 y GEO-08 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Orden de búsqueda: biblioteca propia, imágenes del artículo como candidatas, fuentes oficiales y otros repositorios habilitados.
- Cada resultado conserva página de origen, URL real del recurso, autor/licencia cuando estén disponibles, fecha y evidencia de correspondencia con el lugar.
- Luna puede ordenar candidatos y señalar inconsistencias; ninguna imagen queda aprobada automáticamente por parecido visual.
- Se separa permiso para visualizar una candidata de permiso para descargarla, almacenarla, transformarla o publicarla. Las condiciones desconocidas excluyen ese material de la ingestión o transformación automática correspondiente y se explican al final.
- Descargas externas validan protocolo, destinos y redirecciones, bloquean redes privadas y limitan tamaño, tipo y tiempo. URLs propuestas por el modelo no se descargan sin validación.
- Búsquedas repetidas deduplican candidatos y respetan límites del proveedor. Se registra uso/coste; se devuelve una lista finita y revisable.
- Si falla la búsqueda o no hay una foto elegible, se intenta un mapa adecuado o se entrega tipografía para revisión final, sin sustituir el lugar por uno generado.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-09

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.

Revisión de búsqueda web: Luna consulta texto e imágenes; URLs reales de herramienta y enlaces de búsqueda Google Maps aparecen en la revisión final sin aprobaciones intermedias. Prueba real aislada: 12 fuentes y dos fotos candidatas. Esto no habilita ingestión automática de nuevas fuentes ni Google Places API; la composición conserva sus verificaciones existentes. Pruebas: 351; validación hiperlocal final pendiente.
