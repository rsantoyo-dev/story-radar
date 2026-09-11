---
id: OVW-04
feature: FEAT-OVW-001
status: review
board: topic-overview.kanban.md
tags: [overview, review, p0]
---

# OVW-04 — Mostrar producción y continuar piezas en contexto

**Estado:** [[status-review]] · **Feature:** [Topic Overview](../features/topic-overview.md)

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

## Implementación — 11 de septiembre de 2026

`TopicProductionPipeline` implementado (`readProduction`): cinco etapas con unidad declarada (historias, drafts, imágenes) y hasta tres piezas continuables con miniatura real (portada de la última versión aprobada, placeholder neutro si no existe). Siguiente paso derivado solo de estado almacenado, sin llamada a proveedor, respetando el orden real: aprobar el draft → generar imágenes → revisar y aprobar cada imagen → congelar el paquete → publicarlo. Correlacionado por `(draftId, draftVersion)`, no solo por id — una revisión nueva de un draft ya publicado (misma fila, versión incrementada) permanece continuable en vez de darse por terminada. Dentro del lote vigente, solo cuenta la versión más reciente de cada diapositiva (una regeneración exitosa reemplaza al fallo anterior) y se descartan lotes `stale` y paquetes congelados ya vencidos. "Continuar" abre el draft y la versión exactos (`initialDraftId` en `CreativeDraftWorkspace`), no solo la historia.

Cubierto en el test de integración: revisión nueva de un draft publicado, imagen aprobada tras un fallo anterior en el mismo slot, lote `stale` más nuevo que no le gana a uno `completed` más viejo, paquete congelado vencido.

Pendiente: los accesos de los cuatro indicadores del header siguen sin aplicar el filtro/periodo exacto (mismo hueco de contrato de navegación general que OVW-06); sin evidencia visual en navegador.

Verificación: `npx tsc --noEmit`, `npm run lint`, `npm test` (646/646), `npm run build` en verde.
