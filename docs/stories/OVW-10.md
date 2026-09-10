---
id: OVW-10
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p0]
---

# OVW-10 — Validar Overview de extremo a extremo y accesibilidad

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01 a OVW-07; repetir alcance correspondiente al entregar OVW-08/OVW-09

**Como** editor, **quiero** confiar en el informe y sus accesos, **para** operar sin errores de contexto o estado.

## Criterios de aceptación

- Preparar fixtures de topic vacío, activo y grande; drafts bloqueados/aprobados, varias versiones, entregas inciertas y dos destinos.
- Comprobar contadores contra listados, navegación contextual, permisos, caché y respuestas asíncronas fuera de orden.
- Verificar que abrir/actualizar Overview no ejecuta llamadas de IA, Meta, fal, publicaciones ni aprobaciones.
- Validar UXDSL, contraste, teclado, foco, lectura semántica, zoom y layouts xs/sm/md/lg/xl sin overflow.
- Ejecutar pruebas relevantes, lint y build; db:check si cambia esquema. Registrar evidencia, presupuesto medido y pendientes por fase.
- Para el informe usar proveedores simulados; generación real pagada o publicación no son requisito del QA visual.

- Añadir revisión visual contra referencias A/B usando la matriz de correspondencia de la feature: jerarquía del hero, miniaturas, densidad de filas, sidebar, tarjetas, timeline y acciones rápidas.
- Verificar fallback sin ilustración/miniaturas, sin scores vigentes, sin métricas y sin búsqueda/notificaciones implementadas; no aceptar números o controles ficticios para completar el diseño.

- Validar al menos dos topics con paletas distintas y alternar entre ellos: verificar actualización de tokens, contraste, foco, estados, gráficos y ausencia de colores residuales del topic anterior.

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
