# RCP-05 — Generar hook y estructura narrativa del carrusel

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-02, RCP-04

**Como** editor, **quiero** atraer al lector con el plato y desarrollar la receta al deslizar, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Proponer hasta tres hooks respaldados por la receta y permitir seleccionar o editar uno antes de aprobar.
- Evitar promesas inventadas como lista en 10 minutos, saludable o auténtica; no sacrificar información culinaria por viralidad.
- Proponer seis slides por defecto y permitir de cuatro a ocho dentro del límite soportado por el modelo existente; ampliar o repartir contenido en lugar de truncarlo.
- Asignar roles cover, ingredients, preparation, sauce, assembly y closing, adaptándolos a la receta; no exigir una salsa si no existe.
- Usar continuationCue para anunciar el siguiente paso, y CTA de cierre guardable con solicitud de seguimiento cuando corresponda al objetivo.
- Asegurar que todo paso necesario aparece en el carrusel; caption complementa, pero no oculta pasos esenciales.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
