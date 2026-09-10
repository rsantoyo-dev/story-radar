---
id: OVW-02
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p0]
---

# OVW-02 — Construir cabecera, estructura responsive y estados comunes

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01

**Como** editor, **quiero** identificar mi topic y leer su resumen con claridad, **para** orientarme rápidamente.

## Criterios de aceptación

- Reemplazar la cabecera genérica dentro de #overview por TopicOverview y TopicOverviewHeader; mantener navegación existente y contexto del topic.
- Implementar periodo 7/30/90 días, zona y frescura; separar Actualizar datos de Actualizar informe. El montaje solo lee datos propios.
- Implementar OverviewMetricCard y OverviewSectionState según contratos, incluyendo skeleton, vacío, error parcial y capacidad ausente.
- Aplicar jerarquía y responsive UXDSL de la feature, paleta dinámica del topic activo, foco y encabezados semánticos.
- Probar cambio rápido de topic/periodo, móvil, teclado, zoom y títulos largos sin overflow ni datos cruzados.

- Aplicar las referencias A/B descritas en la feature: sidebar oscuro agrupado, topbar con selector único, hero editorial de altura contenida y cuatro tarjetas con iconos. Heredar la identidad del topic mediante la tematización dinámica y los tokens UXDSL existentes; el color del sidebar se resuelve con ese tema.
- Contemplar visual opcional aprobado específico del topic y fallback tipográfico, sin generación al montar. No mostrar búsqueda, notificaciones o perfil si no hay funcionalidad existente.

- Reutilizar el mecanismo de tema ya operativo; no introducir una paleta fija ni un sistema paralelo. Al cambiar de topic, todas las superficies, acentos e iconos adoptan su tema.

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
