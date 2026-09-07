---
id: BRAND-03
feature: FEAT-BRAND-001
status: done
board: brand-visual-references.kanban.md
tags: [brand, done, p0]
---

# BRAND-03 — Seleccionar referencias automáticamente por unidad

**Estado:** [[status-done]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** seleccionar referencias automáticamente por unidad, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-02

**Criterios de aceptación**

- La preparación selecciona referencias activas del mismo tema según noticia, perfil y propósito de cada unidad. Registra IDs, versiones, función y motivo de selección; no requiere selección humana intermedia.
- El selector usa únicamente IDs realmente disponibles. Límites configurables de cantidad, bytes y coste respetan la capacidad del proveedor y contemplan conjuntamente referencias de protagonista y de marca.
- El reparto prioriza las referencias necesarias del protagonista y después las de marca pertinentes; un exceso se resuelve de forma determinista y queda explicado. No se envía toda la biblioteca indiscriminadamente.
- Sin referencias elegibles se conserva el comportamiento permitido por la política vigente y se explica la ausencia. No se cambia silenciosamente una política documental para poder generar.
- La biblioteca vacía conserva el comportamiento existente de los drafts. Cada slide puede seleccionar referencias distintas manteniendo el contexto visual común.

## Entrega

Implementación terminada; operación y validación en la [feature](../features/brand-visual-references.md).
