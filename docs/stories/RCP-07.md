# RCP-07 — Edición y aprobación compartidas

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente QA de interfaz  
**Dependencias:** RCP-05, RCP-06

## Historia

Como editor, quiero edición y aprobación compartidas, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Permitir agregar, eliminar y reordenar slides dentro del rango existente.
- Mostrar objetivo, supporting copy, continuidad y CTA también para sequence.
- Guardar versiones y conservar los mecanismos existentes de stale/aprobación; nunca aprobar por generar.

## Implementación y evidencia

creative-draft-workspace.tsx; manage-creative-content.ts

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
