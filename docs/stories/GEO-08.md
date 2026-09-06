---
id: GEO-08
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.kanban.md
tags: [geo, done, p0]
---

# GEO-08

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-03]]

<!-- body -->
**GEO-08 — Resolver ubicaciones mediante búsqueda y geocodificación**

**Como** editor, **quiero** obtener candidatos geográficos verificables, **para** reducir la búsqueda manual sin confundir localidades.

**Prioridad:** P0 · **Dependencias:** GEO-03 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Se integra un proveedor elegido tras verificar cobertura, coste, condiciones y reglas de almacenamiento; sus IDs, coordenadas y fuentes se guardan según esas condiciones.
- Las consultas incluyen el ámbito geográfico confirmado. El sistema separa resultados exactos, aproximados y fuera del municipio; solo selecciona los que cumplen los criterios de identidad y deja las razones visibles al final.
- Luna prepara consultas o clasifica IDs devueltos; no convierte una coincidencia textual en una ubicación confirmada.
- Sin evidencia suficiente, se excluye la localización de la representación y se adjuntan los candidatos a la revisión final, sin preguntas intermedias. No se atribuye una precisión inexistente a un centroide municipal.
- Las solicitudes se ejecutan en servidor con límites, caché permitida y reintentos acotados. No se exponen claves ni URLs internas.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-08

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.
