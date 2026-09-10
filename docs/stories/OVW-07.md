---
id: OVW-07
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p0]
---

# OVW-07 — Integrar el Overview operativo y resumen sin IA

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-02, OVW-03, OVW-04, OVW-05, OVW-06

**Como** editor, **quiero** tener una portada útil incluso sin informe generado, **para** gestionar el topic desde un solo lugar.

## Criterios de aceptación

- Ensamblar los componentes en el orden y proporciones de la feature; resumen operativo calculado como panel principal de fase 1.
- Mostrar piezas seleccionadas y cantidades con enlaces, sin presentar texto calculado como análisis de IA.
- Ofrecer acciones contextuales según pendientes reales, evitando repetir configuraciones y herramientas completas.
- Comprobar que un fallo de actividad o métricas no bloquea producción y atención.
- Entregar captura/revisión visual de escritorio y móvil, con casos lleno, vacío y error parcial.

- Implementar TopicEditorialCandidates como panel principal de filas con miniaturas, fuente, antigüedad, evaluación y Revisar, junto a columna de atención/publicación; mantener informe/resumen compacto encima.
- Implementar TopicQuickActions con hasta cuatro accesos contextuales; conservar los contratos de navegación/ejecución descritos en la feature.
- Comparar composición con referencia A y continuidad con B: hero, cuatro indicadores, candidatos 2/3, columna operativa 1/3 y tarjetas inferiores; no reproducir formularios completos en la portada.

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
