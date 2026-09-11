---
id: OVW-03
feature: FEAT-OVW-001
status: review
board: topic-overview.kanban.md
tags: [overview, review, p0]
---

# OVW-03 — Priorizar pendientes y accesos para resolverlos

**Estado:** [[status-review]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01, OVW-02

**Como** editor, **quiero** ver qué necesita atención y abrir el pendiente exacto, **para** resolver bloqueos sin buscar manualmente.

## Criterios de aceptación

- Implementar TopicAttentionQueue con cinco entidades visibles, total real y Ver todos; agrupar varios motivos del mismo draft.
- Ordenar incidencias de envío incierto/registro pendiente, fallos seguros/autorización, blockers editoriales y aprobación; desempatar por antigüedad e ID.
- Mostrar motivo comprensible, versión, antigüedad y siguiente acción. Los advisories no se presentan como blockers.
- Resolver/Revisar abre flujo vigente con sus guardas; no enviar ni reintentar desde una lectura o enlace.
- Validar ausencia de duplicados en cola, resolución concurrente, entidad desaparecida y retorno preservando contexto.

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

## Implementación — 11 de septiembre de 2026

`TopicAttentionQueue` implementado en `readAttention` (`topic-overview.repository.ts`) y el panel: hasta cinco entidades visibles, total real (nunca recortado en silencio), agrupando varios motivos del mismo draft con "+N more". Prioridad por severidad — entrega incierta, fallo seguro de envío, bloqueo editorial, pendiente de aprobar imagen — con desempate por antigüedad e ID (`rankAttentionItems`, con test unitario). Motivo en lenguaje claro, nunca un nombre de campo interno. Badges de color diferenciados por severidad (error/warning/muted) en vez de un solo estilo genérico. Resolver/Revisar abre el draft o la sección de Instagram exactos, incluyendo el `draftId` de la pieza (no solo la historia); nunca envía ni reintenta desde la lectura.

Cubierto en el test de integración: cola con más de cinco pendientes (total real vs. cinco mostrados), bloqueo por imagen fallida que deja de contar tras una regeneración exitosa, entrega incierta vs. fallo seguro.

Pendiente: resolución concurrente de un pendiente desde dos pestañas no probada; retorno de foco tras resolver un elemento no verificado en navegador.

Verificación: `npx tsc --noEmit`, `npm run lint`, `npm test` (646/646), `npm run build` en verde.
