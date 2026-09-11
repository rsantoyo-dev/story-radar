---
id: OVW-05
feature: FEAT-OVW-001
status: review
board: topic-overview.kanban.md
tags: [overview, review, p0]
---

# OVW-05 — Resumir publicaciones y capacidades operativas

**Estado:** [[status-review]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** OVW-01, OVW-02

**Como** editor, **quiero** ver entregas recientes y la salud del topic, **para** detectar problemas de distribución.

## Criterios de aceptación

- Implementar TopicPublicationSummary y TopicHealthPanel con estados y frescura según la feature.
- Mostrar hasta cinco entregas confirmadas/recientes con versión, plataforma, cuenta, fecha y permalink cuando exista; distinguir cada destino y éxito parcial.
- Distinguir contenedor listo, resultado incierto, éxito remoto con registro pendiente y publicación confirmada.
- Exponer capacidades reales: Instagram, Facebook o agenda solo cuando implementados; mostrar conexión, permisos y última actividad conocida sin inventar heartbeat.
- Enlazar configuración e historial; no llamar proveedores ni iniciar workers al montar.

- Componer una tarjeta de publicación semejante a la referencia A: identidad/cuenta, estado real, indicadores disponibles y accesos a crear/revisar publicaciones, sin envío implícito.
- Mostrar Sources health con leyenda y cantidades por estado; anillo opcional solo con categorías disjuntas y alternativa textual, incluyendo desconocidos.

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

`TopicPublicationSummary` y `TopicHealthPanel` implementados (`readPublications`, `readHealth`, `readCapabilities`). Estados de entrega distinguidos: confirmada, éxito remoto con registro pendiente, incierta, contenedor listo, en curso, fallo seguro, y registro manual (no confirmado por proveedor) — nunca se presenta una entrega confirmada sin permalink como fallida. El total de "Ver todos" aplica la misma exclusión que la lista mostrada (sin contar dos veces un job y su registro manual). Salud de fuentes por estados disjuntos incluyendo desconocidas, con el resultado real de la última recolección. Capacidades reales: Instagram muestra conexión/publicar/insights por separado y última actividad conocida sin inventar heartbeat; Facebook y agenda declaran `available: false` con motivo, nunca una cifra falsa. Ninguna llamada a Meta/fal al montar — verificado por auditoría de imports, no solo por diseño.

Pendiente: sin evidencia visual del anillo opcional de salud de fuentes ni de la tarjeta de publicación contra la referencia A en navegador real.

Verificación: `npx tsc --noEmit`, `npm run lint`, `npm test` (646/646), `npm run build` en verde.
