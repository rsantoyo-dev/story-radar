# RCP-08 — Generar imágenes consistentes con el plato y la marca

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-07

**Como** editor, **quiero** obtener un carrusel apetitoso que represente la receta aprobada, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Reutilizar la integración fal, prompts, personajes, marca y versiones de assets; salida 4:5 de 1080×1350.
- Preparar una referencia común del plato terminado: fotografía propia aprobada o propuesta visual generada y revisada; registrar su origen.
- Construir referencias por slide: resultado final en portada/cierre y estado intermedio apropiado en preparación; no exigir el plato terminado en cada paso.
- Mantener variedad de papa, corte de carne, ingredientes visibles, estilo de vajilla y dirección visual; impedir que el prompt cambie papa criolla por papas largas por defecto.
- Integrar la referencia en el flujo creativo, no convertir todo el carrusel en una plantilla documental al encontrar una foto.
- Incluir copy legible y coherente, sin perder cantidades, unidades o numeración; la referencia visual no autoriza ingredientes nuevos.
- No usar la búsqueda de lugares como requisito para recetas; respetar los permisos y atribuciones de cualquier fotografía externa.
- Clave de caché incluye versión de receta, slide, referencia de plato, marca y política de prompt; reintentar una imagen no regenera las demás.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
