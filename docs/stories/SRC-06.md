---
id: SRC-06
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p0]
---

# SRC-06 — Vista de historias manuales

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P0 · **Dependencias:** [[SRC-02]]

**Como** editor, **quiero** ver y crear historias manuales de todos los topics, **para** seguir mi propio contenido sin recorrer topic por topic.

## Criterios de aceptación

- Renombrar Owned content a **Manual stories** en la interfaz; tabla y API sin cambios.
- Lista de `owned_content_entries` de todos los topics con topic, tipo, fecha y enlace a la historia; filtro por topic.
- El botón New story de esta vista abre el mismo diálogo de SRC-01; retirar el formulario duplicado de Topics & sources.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

Manual stories lista entradas de todos los topics, permite filtrar y abre la historia en el visor. New story usa el diálogo global; se retiró el formulario duplicado. Los nombres visibles de Stories usan “Manual story”.
