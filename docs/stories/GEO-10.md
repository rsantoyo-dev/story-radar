---
id: GEO-10
feature: FEAT-GEO-001
status: backlog
board: real-place-visual-fidelity.kanban.md
tags: [geo, backlog, p2]
---

# GEO-10

**Estado:** [[status-backlog]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-05]] · [[GEO-07]]

<!-- body -->
**GEO-10 — Preparar ilustraciones con referencias elegibles**

**Como** editor, **quiero** ilustrar una noticia usando referencias elegibles del lugar, **para** mantener contexto visual cuando he elegido explícitamente una representación artística.

**Prioridad:** P2 · **Dependencias:** GEO-05 y GEO-07 · **Entrega:** Opciones adicionales

**Criterios de aceptación**

- Solo disponible en modo de referencias verificadas; utiliza el endpoint image-to-image explícito del proveedor existente.
- Se comprueba que las condiciones del material permiten ese uso y su envío al proveedor antes de transmitirlo.
- El prompt cita los IDs de referencias seleccionadas y evita afirmar que el resultado documenta la realidad.
- El resultado lleva “Ilustración” en la pieza y permite revisar las referencias junto a la salida.
- El editor puede rechazar alteraciones del lugar; el modelo no certifica su propia fidelidad.
- Si el objetivo exige exactitud documental, se ofrece cambiar a fotografía real en una nueva versión, no aprobar la ilustración como fotografía.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-10
