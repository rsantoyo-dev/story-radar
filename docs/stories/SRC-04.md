---
id: SRC-04
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p1]
---

# SRC-04 — Vista de investigación con IA por topic

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P1 · **Dependencias:** [[SRC-02]]

**Como** editor, **quiero** ver la investigación con IA de todos los topics en un sitio, **para** saber cuáles la tienen activa y con qué instrucciones.

## Criterios de aceptación

- Una tarjeta por topic con estado, modelo, instrucciones resumidas y última ejecución; edición reutilizando el formulario actual.
- Explicación clara de que es una configuración por topic y no una lista de fuentes; sin duplicar la lógica de recolección.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

El catálogo muestra una tarjeta por topic con estado, modelo configurado, resumen de instrucciones y última ejecución registrada. La edición usa el formulario y la ruta por topic existentes.
