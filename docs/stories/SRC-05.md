---
id: SRC-05
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p1]
---

# SRC-05 — Vista de documentos

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P1 · **Dependencias:** [[SRC-02]]

**Como** editor, **quiero** gestionar los documentos del workspace y sus topics, **para** reutilizar un PDF en más de un topic.

## Criterios de aceptación

- Lista de `knowledge_documents` con estado de ingestión, topics vinculados y acciones de reintento; alta por URL y asignación a topics reutilizando las rutas actuales.
- Los detalles por capítulo y la creación de candidatos siguen abriéndose en contexto del topic.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

El catálogo lista documentos del workspace, estado de ingestión y topics vinculados. El alta por URL usa la ruta existente una vez y enlaza los demás topics sin repetir la extracción. El reintento y los capítulos siguen en el contexto de un topic; desvincular conserva documento y versiones.
