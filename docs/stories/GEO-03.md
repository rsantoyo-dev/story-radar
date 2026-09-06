---
id: GEO-03
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.board.md
tags: [geo, done, p0]
---

# GEO-03

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-02]]

<!-- body -->
**GEO-03 — Resolver la identidad del lugar con evidencias**

**Como** editor local, **quiero** recibir la identidad resuelta y sus evidencias junto a la pieza final, **para** evitar confundir sitios homónimos sin intervenir durante la preparación.

**Prioridad:** P0 · **Dependencias:** GEO-02 · **Entrega:** Preparación automática

**Criterios de aceptación**

- La ficha registra nombre, municipio, región, país, dirección o descripción y evidencia de identificación; coordenadas son opcionales en el MVP.
- La resolución automática exige coincidencia de identidad y ámbito sustentada por registros reutilizables o fuentes verificables. Un score del modelo no la confirma; evidencias incompatibles o insuficientes excluyen la representación y se muestran al final.
- No se inventa una entidad cuando el nombre no existe o no puede resolverse; se prepara una pieza tipográfica y se reserva corregir o aportar evidencia para la revisión final.
- Una publicación puede tener varios lugares, cada uno con su identificación y estado independientes.
- Cada unidad que representa un lugar guarda su vínculo explícito. Una imagen solo se reutiliza si corresponde al mismo lugar y propósito.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-03

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.
