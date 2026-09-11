---
id: OVW-01
feature: FEAT-OVW-001
status: review
board: topic-overview.kanban.md
tags: [overview, review, p0]
---

# OVW-01 — Definir agregados y contrato de datos del topic

**Estado:** [[status-review]] · **Feature:** [Topic Overview](../features/topic-overview.md)

**Prioridad:** P0 · **Dependencias:** Ninguna

**Como** editor, **quiero** consultar un resumen coherente del topic, **para** confiar en las cifras y sus accesos.

## Criterios de aceptación

- Inventariar campos/repositorios reales y resolver las definiciones temporales y unidades de cada contador según la feature; documentar el timestamp de alta por topic o ajustar la etiqueta.
- Definir DTO y servicio autenticado con secciones independientes, capacidades y frescura; autorizar topic y no exponer credenciales ni contenido innecesario.
- Construir consultas acotadas sin N+1; verificar totales con listas paginadas y exclusión de entregas no confirmadas.
- Definir invalidación, cancelación y claves de caché por topic/periodo/autorización. Medir consultas y latencia con datos representativos.
- Probar aislamiento entre dos topics, cero vs dato desconocido, varias revisiones por historia y dos destinos para una pieza.

- Añadir al contrato candidatos editoriales: shortlist elegible, score vigente/desactualizado, fuente, miniatura autorizada y orden estable. Contador y Ver todos deben compartir filtros; documentar umbrales reales antes de mostrar prioridades.
- Proveer salud de fuentes por estados disjuntos, incluyendo desconocido; no confundir fuentes del topic con total global ni sumar dos veces una fuente.

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

DTO tipado (`topic-overview.types.ts`), servicio de agregación (`topic-overview.repository.ts`) y ruta autenticada `GET /api/radar/overview` implementados. Cada sección (métricas, candidatos, atención, producción, publicaciones, salud, actividad, capacidades) devuelve estado y frescura independientes; un fallo en una sección no bloquea el resto. Autoriza el topic en servidor antes de consultar; no expone tokens, claves R2 ni prompts.

Contadores verificados contra sus listas mediante un test de integración con PostgreSQL en memoria (`topic-overview.repository.test.ts`, PGlite, usando los tipos de columna reales del esquema): topic vacío, dos topics aislados, drafts bloqueados, varias revisiones de una historia (incluida la misma fila de draft publicada y luego revisada en el sitio), entrega incierta, dos destinos para una pieza y candidatos ordenados por evaluación editorial vigente en vez de por relevancia previa a IA. Varias rondas de revisión de código corrigieron: conteo de bloqueos por versión superseded/lote `stale`, paquetes vencidos tratados como listos, y una consulta duplicada entre atención y producción (ahora comparten un solo cálculo).

Pendiente: presupuesto de consultas/latencia no medido contra un topic grande real (sin acceso a base de datos en vivo en esta sesión); invalidación de caché sigue apoyada en actualización manual y las invalidaciones existentes, no en un mecanismo dedicado nuevo.

Verificación: `npx tsc --noEmit`, `npm run lint`, `npm test` (646/646) y `npm run build` en verde. `db:check` no aplica — sin cambios de esquema/migración.
