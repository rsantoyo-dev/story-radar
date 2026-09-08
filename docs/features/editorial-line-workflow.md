# Feature: Flujo unificado de líneas editoriales y revisión de candidatos

**ID:** FEAT-ELW-001  
**Estado:** Completado  
**Fecha de cierre:** 2026-09-08  
**Tablero:** [editorial-line-workflow.kanban.md](editorial-line-workflow.kanban.md)  
**Feature base:** [Recolección por líneas editoriales](editorial-collection-lines.md)

## Resultado entregado

Cada marca utiliza una lista de líneas editoriales. Topics & Sources configura sus objetivos, periodos, feeds y búsqueda IA; Collection ejecuta una línea seleccionada. La recolección anterior queda representada por Actualidad, y las líneas temáticas existentes permanecen a su lado.

En el workspace editorial se pueden combinar línea y Shortlist only, revisar candidatos y conservar los vínculos a historias, borradores y publicaciones. La explicación del estado Review y su promoción recoge comportamiento existente verificado; no se atribuye a esta entrega un cambio del criterio de evaluación.

Este documento registra como completado el trabajo realizado en esta conversación. No declara completados trabajos futuros del feature base ni una validación integral de publicaciones que no se haya ejecutado.

## Recorrido disponible

1. Configurar líneas en Topics & Sources: Actualidad y las temáticas deseadas.
2. Elegir una en Collection; si solo existe una activa, queda seleccionada.
3. Añadir opcionalmente Research today y ejecutar Collect and save.
4. Evaluar candidatos con IA.
5. Filtrar por línea y, si corresponde, activar Shortlist only.
6. Aprobar candidatos de shortlist o usar Promote to selected para un candidato Review.
7. Continuar hacia el brief y borrador con su contexto conservado.

## Historias completadas

### ELW-01 — Configurar líneas editoriales dentro de cada marca

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** guardar objetivos editoriales independientes, **para** investigar actualidad, contexto y guías desde la misma marca.

**Tareas y resultado verificado**

- [x] Crear, editar, archivar y restaurar líneas con control de revisión.
- [x] Configurar nombre, objetivo, temas, modo, periodo y zona horaria.
- [x] Conservar configuración histórica y aislamiento por marca.

**Referencia:** [editorial-lines.repository.ts](../../src/app/modules/editorial-lines/editorial-lines.repository.ts).

### ELW-02 — Separar configuración y ejecución

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** configurar una vez y ejecutar desde Collection, **para** evitar formularios duplicados.

**Tareas y resultado verificado**

- [x] Mostrar la gestión de líneas únicamente en Topics & Sources.
- [x] Mostrar en Collection el selector, configuración efectiva y Research today opcional.
- [x] Actualizar el selector al guardar líneas, feeds o configuración IA de marca.
- [x] Conservar el periodo guardado en la línea; retirar su editor de Collection.

**Referencia:** [editorial-lines-panel.tsx](../../src/app/editorial-lines-panel.tsx).

### ELW-03 — Configurar feeds y búsqueda IA por línea

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** combinar fuentes RSS e investigación web, **para** adaptar la búsqueda a cada intención editorial.

**Tareas y resultado verificado**

- [x] Heredar feeds activos o seleccionar un subconjunto con exclusiones.
- [x] Permitir IA heredada, desactivada o personalizada por línea.
- [x] Personalizar instrucción, orientación, idioma, región, resultados, recuperación de contenido y prioridad.
- [x] Permitir una búsqueda IA personalizada aunque el valor predeterminado de marca esté desactivado.
- [x] Admitir feeds, IA o ambos; aplicar el periodo y los dominios de la línea.
- [x] Compartir proveedores, credenciales y presupuesto; validar opciones en servidor.

**Referencia:** [editorial-lines.ts](../../src/app/modules/editorial-lines/editorial-lines.ts).

### ELW-04 — Convertir la recolección predeterminada en Actualidad

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** tener todas las opciones de recolección como líneas, **para** usar un único modelo de colección.

**Tareas y resultado verificado**

- [x] Inicializar Actualidad al cargar las líneas o al recolectar por primera vez en una marca.
- [x] Asignar 72 horas, feeds e IA heredados; permitir editar su configuración.
- [x] Usar una identidad estable por marca para evitar duplicación concurrente.
- [x] Conservar líneas temáticas y cambios posteriores sin sobrescribirlos durante la inicialización.
- [x] Mantener la línea inicial disponible: puede editarse, pero no archivarse.
- [x] No reasignar retrospectivamente historias, borradores o publicaciones.

**Referencia:** [editorial-lines.repository.ts](../../src/app/modules/editorial-lines/editorial-lines.repository.ts).

### ELW-05 — Recolectar siempre desde una línea

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** escoger qué línea ejecutar, **para** obtener candidatos con una intención y periodo definidos.

**Tareas y resultado verificado**

- [x] Eliminar Existing brand collection del selector.
- [x] Seleccionar automáticamente cuando existe una sola línea activa.
- [x] Exigir elegir una línea cuando hay varias y deshabilitar Collect and save hasta entonces.
- [x] Ejecutar con consulta opcional, fuentes, IA y ventana efectivas de esa línea.
- [x] Asociar solicitudes antiguas sin lineId a Actualidad; conservar su ventana explícita en el snapshot.
- [x] Guardar contexto de ejecución y aplicar la cuota compartida de marca.

**Referencia:** [route.ts](../../src/app/api/radar/collect/route.ts).

### ELW-06 — Conservar contexto, fechas y vínculos

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** revisar por qué se encontró cada historia, **para** reutilizarla sin perder trazabilidad.

**Tareas y resultado verificado**

- [x] Aplicar la ventana editorial a resultados RSS e IA y respetar dominios permitidos.
- [x] Permitir material histórico pertinente en contexto sin presentarlo como última hora.
- [x] Guardar asociaciones de historia, línea y ejecución sin duplicar la historia canónica.
- [x] Conservar opciones IA efectivas, motivos y contexto de investigación.
- [x] Trasladar el contexto elegido a nuevos briefs y conservar el de borradores existentes.

**Referencia:** [collect-and-persist-story-candidates.ts](../../src/app/modules/stories/collect-and-persist-story-candidates.ts).

### ELW-07 — Filtrar la shortlist por línea editorial

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** combinar shortlist y línea editorial, **para** revisar únicamente los candidatos de la temática elegida.

**Tareas y resultado verificado**

- [x] Ubicar Filter stories by editorial line junto a la lista de historias.
- [x] Ofrecer todas las líneas, una línea concreta y Without a line para historias históricas.
- [x] Incluir líneas archivadas para consultar sus resultados anteriores.
- [x] Combinar Shortlist only con la línea seleccionada en Collected stories.
- [x] Aplicar el filtro de línea también a Selected stories.
- [x] Hacer que Select visible shortlist respete los filtros y mostrar selecciones ocultas.
- [x] Restablecer los filtros desde Reset filters sin modificar historias.

**Referencia:** [radar-dashboard.tsx](../../src/app/radar-dashboard.tsx).

### ELW-08 — Documentar y verificar Review y promoción editorial

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** entender por qué un candidato no tiene casilla de selección, **para** decidir si debe pasar a Selected.

**Tareas y resultado verificado**

- [x] Verificar que la casilla requiere evaluación shortlist, ausencia de revisión humana y ausencia de vínculo de duplicado.
- [x] Distinguir la relevancia de descubrimiento de la decisión posterior de evaluación.
- [x] Verificar Promote to selected para Review y Override to selected para Reject, con confirmación humana.
- [x] Conservar la decisión IA original al registrar la aprobación humana.
- [x] Confirmar en la API local que el artículo de Statistics Canada sobre patrimonio figuraba como review y reviewable=false.

**Referencia:** [story-editorial.repository.ts](../../src/app/modules/stories/story-editorial.repository.ts).

### ELW-09 — Corregir la vigencia del brief tras recargar su contexto

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** que el brief conserve su vigencia al abrirlo de nuevo, **para** continuar al carrusel sin repetir una actualización que ya tuvo éxito.

- [x] Normalizar el orden de campos del contexto para el hash, conservando compatibilidad con briefs guardados.
- [x] Verificar el round-trip JSONB con PostgreSQL en memoria, sin alterar el orden de arrays ni ignorar cambios reales de contexto.
- [x] Llevar el foco a los controles de draft tras actualizar correctamente el brief.
- [x] Mostrar progreso y errores junto a la acción de actualización.
- [x] Comprobar en localhost que el mismo brief de «Labour market experiences of recent immigrants, 2019 to 2025» pasa de obsoleto a vigente sin regeneración.

**Validación:** 475 pruebas pasan. La petición de refresh devolvió cached; el GET posterior al arreglo devuelve briefIsCurrent=true con el mismo ID.

## Evidencia de entrega y límites

- Suite de **474 pruebas** satisfactoria tras integrar inicialización de Actualidad, compatibilidad y configuración IA por línea.
- **Lint y build** satisfactorios también después del ajuste final de shortlist.
- Las pruebas incluyen persistencia y revisiones con PostgreSQL en memoria, aislamiento, ventanas temporales, opciones IA y separación del formulario de configuración.
- Consulta autenticada a localhost: el artículo «Trends in the wealth gap between immigrant and Canadian-born families from 2016 to 2023» devolvió HTTP 200, evaluationDecision=review y reviewable=false. No se promovió ni aprobó automáticamente.
- La inicialización de Actualidad es al cargar/usar la marca, no un backfill masivo ejecutado sobre todas las marcas.
- Los filtros se aplican a los datos cargados. El límite existente es de 2000 asociaciones recientes y hasta 30 ejecuciones por historia en Creative Studio.
- No se ejecutó una prueba automatizada de navegador ni se certificó la calidad editorial de una publicación final.

## Fuera de este cierre

Programación por línea, mezcla editorial automática, paginación ampliada, reconciliación de ejecuciones interrumpidas y validación integral de publicaciones permanecen fuera de esta entrega. El seguimiento del alcance original continúa en el feature base; LINE-08 no se marca como implementada.
