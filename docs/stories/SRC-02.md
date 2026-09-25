---
id: SRC-02
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p0]
---

# SRC-02 — Grupo Sources en el menú lateral y anclas

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P0 · **Dependencias:** [[SRC-01]]

**Como** editor, **quiero** ver Sources como un grupo propio del menú, **para** entender de dónde llegan las historias sin entrar en la configuración del topic.

## Criterios de aceptación

- Nuevo grupo **Sources** con subelementos RSS feeds, AI research, Documents y Manual stories, y **Topics** como elemento independiente; misma jerarquía que planificó Topic Overview (Workspace, Producción, Publicación, Configuración).
- Anclas estables por vista (`#sources/rss`, `#sources/ai`, `#sources/documents`, `#sources/manual`, `#topics`) compatibles con el enrutado por hash actual; resaltado del elemento activo y drawer móvil.
- El panel `topic-configuration-panel.tsx` se parte en paneles por vista sin cambiar rutas de API ni contratos; el módulo UXDSL correspondiente se reparte o se añade una entrada nueva al `builds` de `uxdsl.config.cjs`.
- Los enlaces antiguos a `#configuration` siguen funcionando mediante redirección al ancla nueva.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

Menú agrupado en Workspace, Production, Publishing y Configuration, con Sources y sus cuatro anclas; Topics tiene ancla independiente. `TopicConfigurationPanel` acepta una vista y carga solo los datos por topic que necesita. `#configuration` se sustituye por `#topics` al abrir enlaces antiguos. El elemento activo usa `aria-current` y estilo UXDSL; el drawer se cierra al navegar.
