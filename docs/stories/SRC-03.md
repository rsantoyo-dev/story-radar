---
id: SRC-03
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p0]
---

# SRC-03 — Vista de feeds RSS del workspace

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P0 · **Dependencias:** [[SRC-02]]

**Como** editor, **quiero** ver todos los feeds del workspace y a qué topics alimentan, **para** añadir o reutilizar fuentes sin duplicarlas.

## Criterios de aceptación

- Lista de `rss_sources` del workspace con nombre, URL, estado, último sondeo y los topics vinculados con su prioridad; filtros por topic y por estado.
- **Add feed** crea el feed una vez y permite vincularlo a uno o varios topics en el mismo paso; vincular a otro topic reutiliza el registro compartido.
- Desvincular de un topic conserva el feed; borrar el feed exige que no tenga vínculos o una confirmación explícita que los liste.
- Requiere una ruta de listado por workspace (hoy solo existe por topic); se implementa sobre los repositorios actuales sin nuevo modelo.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

`/api/radar/sources` lista feeds del workspace, vínculos y último sondeo registrado; la vista filtra por topic y estado. `/api/radar/sources/rss` crea o reutiliza un feed por URL y lo enlaza a varios topics. Los vínculos se pueden retirar sin borrar el feed; el borrado solo acepta feeds sin vínculos.
