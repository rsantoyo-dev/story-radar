# RCP-09 — Revisar imágenes y publicar con el flujo existente

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-08

**Como** editor, **quiero** aprobar cada imagen y publicar la receta completa en Instagram, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Comparar visualmente ingredientes, estado de cocción representado y resultado con el brief; señalar que la IA puede alterar referencias.
- Validar texto visible, cantidades, unidades, orden y correspondencia con el draft mediante los controles existentes y revisión humana.
- Permitir regeneración individual conservando fotografía del plato, personajes, marca y versión de receta; histórico solo lectura.
- Requerir aprobación del conjunto actual antes de congelar paquete; cambios posteriores invalidan su vigencia.
- Reutilizar publicación de carrusel, reconciliación y comprobación de cuenta destino existentes; nunca marcar publicado por terminar de generar imágenes.
- Fuera de alcance: Facebook, programación nueva y Reel automático. No realizar publicación real como prueba sin una orden del editor.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
