---
id: OVW-09
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p1]
---

# OVW-09 — Integrar resultados y agenda según capacidades disponibles

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P1 · **Dependencias:** OVW-05, OVW-07; métricas existentes de IG y PUB-05/PUB-11 para agenda

**Como** editor, **quiero** ver resultados y próximos envíos, **para** evaluar y planificar la distribución.

## Criterios de aceptación

- Implementar TopicPerformanceSummary con datos almacenados, fecha de captura, cobertura y periodo correctamente etiquetados.
- No sumar alcance como audiencia única ni calcular tendencias sin capturas comparables; faltantes aparecen como no disponibles.
- Integrar agenda solo después de programación durable: fecha, zona, destino, estado y enlace al detalle de la orden.
- Facebook se habilita según integración de PUB-09/PUB-10 y soporte real de métricas; no duplicar implementación de conectores.
- Probar capacidades parciales, métricas ausentes, publicaciones con distintos tiempos de captura y programación alrededor de cambios de zona/horario.

- No copiar seguidores o porcentajes de las capturas: mostrar cifras/tendencias solo con métricas y comparación válidas, y ocultar variaciones no sustentadas.

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
