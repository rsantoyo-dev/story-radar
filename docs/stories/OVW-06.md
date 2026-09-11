---
id: OVW-06
feature: FEAT-OVW-001
status: review
board: topic-overview.kanban.md
tags: [overview, review, p0]
---

# OVW-06 — Añadir actividad reciente y navegación compartida

**Estado:** [[status-review]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01, OVW-02, OVW-03, OVW-04

**Como** editor, **quiero** ver cambios recientes y volver a su origen, **para** seguir el trabajo del topic.

## Criterios de aceptación

- Implementar TopicActivityFeed con ocho registros, identidad estable, orden temporal y Ver más.
- Usar eventos persistidos; si solo hay timestamps, etiquetar Actualizaciones recientes y no inferir autor o eventos históricos.
- Centralizar contrato de navegación para topic, entidad, versión y filtro; no usar secretos en URLs.
- Cubrir volver atrás, cambio de tema y destino inexistente; acceso directo no evita autorización.
- Actualizar datos tras acciones relevantes conservando foco y evitando un refetch completo innecesario.

- Alinear sidebar con agrupaciones de las referencias conservando destinos funcionales, estado activo y acceso por teclado. En móvil usar drawer con cierre y devolución del foco.
- Presentar actividad como timeline con eventos reales y accesos; acceso a otros topics reutiliza selector autorizado, sin mezclar datos.

## Componentes y diseño

Aplicar el catálogo de componentes, definiciones de datos, estados y diseño responsive de la feature. Los nombres de componentes son propuestas, no evidencia de implementación. Mantener el alcance de esta historia sin reimplementar publicación, analítica ni edición de drafts.

## Requisito transversal de UXDSL

Todos los componentes y estilos nuevos o modificados por esta historia deben respetar el sistema UXDSL existente y la tematización dinámica del topic:

- Paleta: tokens semánticos `palette(...)` y tokens de color existentes, resueltos por el tema activo; sin colores fijos ni una paleta paralela.
- Espaciado: priorizar `density(n)` para padding, gaps y controles; usar `space(n)` cuando corresponda a la escala de composición existente. No introducir escalas arbitrarias.
- Responsive: valores `xs(...)`, `sm(...)`, `md(...)`, `lg(...)`, `xl(...)`, con los breakpoints existentes 0/640/768/1024/1280; no crear breakpoints alternativos.
- Tipografía, superficies y controles: `@ds-typo`, `@ds-surface`, `@ds-button` y `@ds-input`, siguiendo variantes existentes.
- Forma y elevación: `radius(n)`, `border(...)` y `shadow(n)` con tokens de paleta donde corresponda.
- Aplicar estos patrones también a hover, foco, disabled, skeletons, badges, gráficos, iconos y estados de error/vacío. Reutilizar componentes existentes cuando cumplan el patrón.
- Usar la configuración y el pipeline UXDSL del repositorio. Las medidas funcionales sin equivalente en tokens (por ejemplo, aspect ratio o ancho porcentual) son admisibles; no usarlas para eludir las escalas de diseño.
- Validar la compilación de UXDSL, los breakpoints y al menos dos paletas de topic. Esta historia no se considera terminada con estilos visualmente similares que omitan los patrones del sistema.

En historias exclusivamente de datos, preservar estos contratos para los componentes consumidores; no añadir estilos o componentes innecesarios.

## Validación y entrega

Registrar pruebas y evidencia visual cuando corresponda; actualizar ficha y tablero al completar los criterios. Esta historia está planificada y no implica implementación ni despliegue.

## Implementación parcial — 11 de septiembre de 2026

Hecho: sección de actividad titulada "Recent updates" (no "Activity log") — son timestamps de entidades, sin autor ni historial inventado; identidad estable, hasta 8 eventos, abre la historia/draft exacto. Sidebar reagrupado en Workspace / Production / Publishing / Settings reutilizando destinos existentes, con resaltado activo (`aria-current`, sincronizado por `hashchange`, nunca usado para autorización) y drawer móvil que devuelve el foco al botón que lo abrió. Acceso a otros topics sigue usando el selector autorizado existente, sin mezclar datos entre ellos (remount por `key`).

No hecho: no existe un contrato de navegación genérico que codifique topic + entidad + filtro + periodo en una URL compartible/bookmarkeable — hoy es un mosaico de anclas de hash por sección más el callback `onOpenStory` (estado de React, no URL) para abrir una entidad exacta. Sin "Ver más" en Actividad (no hay una vista de historial completo a la que enlazar todavía). El Overview no se refresca automáticamente al volver de una acción hecha en el workspace abierto desde él (aprobar un draft, resolver un bloqueo) — requiere refrescar a mano o cambiar de topic. Sin prueba de vuelta atrás/destino inexistente en navegador real.

Esta historia se deja en revisión con estos pendientes explícitos, no como completada.

Verificación: `npx tsc --noEmit`, `npm run lint`, `npm test` (646/646), `npm run build` en verde.
