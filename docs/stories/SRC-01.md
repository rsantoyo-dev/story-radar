---
id: SRC-01
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p0]
---

# SRC-01 — Botón global New story con diálogo

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P0 · **Dependencias:** Ninguna

**Como** editor, **quiero** crear una historia manual desde cualquier pantalla, **para** no buscar el formulario dentro de la configuración del topic.

## Criterios de aceptación

- Botón **New story** en la barra superior, junto al selector de topic; deshabilitado sin secreto, sin topics o mientras cambia el topic.
- Diálogo modal con topic preseleccionado (editable), tipo de contenido, título, idioma, región, fecha, URL opcional y contenido; foco inicial en el título, cierre con Escape y con el fondo, `aria-modal`.
- Envío a `POST /api/radar/topics/{topicId}/owned-content`; error del servidor visible en el diálogo; éxito cierra, refresca indicadores, cambia de topic si hace falta, muestra aviso y navega a Stories › Collected.
- Hecho el 25 de septiembre de 2026: `src/app/new-story-dialog.tsx`, cambios en `radar-dashboard.tsx` y estilos en `radar-dashboard.module.uxdsl`; `lint`, `build` y `npm test` verificados. Pendiente de QA visual del usuario en móvil y escritorio.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.
