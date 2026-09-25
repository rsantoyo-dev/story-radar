---
id: SRC-07
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p1]
---

# SRC-07 — Topics simplificado con fuentes vinculadas

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P1 · **Dependencias:** [[SRC-03]]

**Como** editor, **quiero** que Topics muestre solo lo propio del topic, **para** configurarlo sin perderme entre fuentes compartidas.

## Criterios de aceptación

- Topics conserva alta y edición de topics y líneas editoriales; las fuentes aparecen como casillas de vinculación (feeds, documentos) y un acceso a la investigación con IA del topic.
- Ningún formulario de alta de fuente dentro de Topics; los accesos llevan a la vista de Sources correspondiente con el topic preseleccionado.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

Topics conserva alta y edición, líneas editoriales, casillas para enlazar feeds y documentos ya existentes, y acceso a la investigación con IA. El alta de fuentes vive en Sources.
