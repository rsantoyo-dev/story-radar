# RCP-04 — Construir y editar Recipe Brief

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-03

**Como** editor, **quiero** convertir mi receta en una especificación completa y revisable, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Extraer ingredientes, cantidades, unidades, porciones y pasos desde la fuente preservando su significado y trazabilidad.
- Agrupar componentes como sobrebarriga, gravy, papas y montaje; relacionar cada paso con ingredientes mediante IDs.
- Mostrar tiempos activos, cocción y total solo cuando estén respaldados; no sumar tareas paralelas como si fueran secuenciales.
- Permitir editar y confirmar datos faltantes; cambios culinarios sugeridos por IA requieren aceptación explícita.
- Incluir estado de prueba culinaria separado de aprobación editorial, sin presentar una receta no probada como validada.
- Guardar una versión y snapshot aprobables del brief; no convertir automáticamente cantidades a otras porciones en fase 1.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
