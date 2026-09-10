---
id: OVW-08
feature: FEAT-OVW-001
status: todo
board: topic-overview.kanban.md
tags: [overview, todo, p1]
---

# OVW-08 — Generar y conservar el informe editorial fundamentado

**Estado:** [[status-todo]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P1 · **Dependencias:** OVW-01, OVW-07

**Como** editor, **quiero** leer un informe de mi topic con fuentes y oportunidades, **para** decidir qué cubrir con evidencia.

## Criterios de aceptación

- Implementar TopicEditorialReport con síntesis, hallazgos, cambios sustentados, oportunidades y cobertura, sin reemplazar el resumen operativo cuando no existe informe.
- Generación explícita y acotada, deduplicada por snapshot/topic/periodo; nunca por montaje o cambio de pestaña.
- Validar salida estructurada, IDs autorizados y respaldo de afirmaciones; distinguir hecho de interpretación y no fabricar citas.
- Conservar versiones, fuentes, periodo y fecha; marcar desactualización y mantener informe anterior si falla el nuevo.
- Revisar persistencia existente antes de decidir esquema; registrar uso de proveedor y errores saneados siguiendo abstracciones actuales.
- Probar entradas insuficientes, fuente maliciosa, cita inexistente, doble clic, cambio de topic durante generación y fallo del proveedor con mocks.

- Mantener el informe como resumen expandible de ancho completo sin desplazar ni reemplazar la lista de candidatos; detalle con evidencia accesible por teclado.

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
