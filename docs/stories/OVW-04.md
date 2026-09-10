---
id: OVW-04
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p0]
---

# OVW-04 — Mostrar producción y continuar piezas en contexto

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01, OVW-02

**Como** editor, **quiero** ver etapas y piezas pendientes de producción, **para** continuar el siguiente paso editorial.

## Criterios de aceptación

- Implementar TopicProductionPipeline con cinco etapas y hasta tres piezas continuables; declarar la unidad de cada contador.
- Reutilizar evaluadores de aprobación/vigencia y no equiparar draft aprobado con paquete publicable.
- Implementar navegación a lista filtrada y revisión exacta; conservar topic, filtros y periodo donde corresponda.
- Contemplar múltiples formatos y revisiones, miniatura ausente y nueva revisión de una historia ya publicada.
- No presentar las etapas solapadas como embudo estadístico ni modificar datos al navegar.

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
