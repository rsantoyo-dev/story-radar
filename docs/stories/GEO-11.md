---
id: GEO-11
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.kanban.md
tags: [geo, done, p0]
---

# GEO-11

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-06]] · [[GEO-08]]

<!-- body -->
**GEO-11 — Crear mapas con ubicaciones verificadas**

**Como** editor, **quiero** mostrar dónde está el lugar, **para** aportar contexto geográfico cuando sea más útil que una fotografía.

**Prioridad:** P0 · **Dependencias:** GEO-06 y GEO-08 · **Entrega:** Preparación automática

**Criterios de aceptación**

- El mapa se renderiza de forma determinista desde coordenadas confirmadas y un proveedor cartográfico configurado; Luna no dibuja calles ni coloca marcadores.
- Se verifican licencia, atribución, almacenamiento, exportación y compatibilidad con publicación social antes de habilitar el proveedor.
- Google Maps puede ser una fuente de localización si se integra de forma permitida; no se presupone permiso para reutilizar capturas ni Street View.
- Se mantiene escala y posición del marcador; si la precisión es aproximada, se indica o se bloquea un marcador puntual engañoso.
- Atribución y contexto permanecen legibles en la exportación 4:5. El mapa no sustituye evidencia fotográfica del estado actual del lugar.
- Si el mapa no está disponible, se termina con fotografía elegible o tipografía, nunca cartografía inventada ni una solicitud de intervención intermedia.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-11

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.

Revisión de búsqueda web: Luna consulta texto e imágenes; URLs reales de herramienta y enlaces de búsqueda Google Maps aparecen en la revisión final sin aprobaciones intermedias. Prueba real aislada: 12 fuentes y dos fotos candidatas. Esto no habilita ingestión automática de nuevas fuentes ni Google Places API; la composición conserva sus verificaciones existentes. Pruebas: 351; validación hiperlocal final pendiente.
