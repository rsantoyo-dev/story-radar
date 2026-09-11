# RCP-11 — Desarrollar propuestas de receta desde una idea

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P1 · **Dependencias:** RCP-01 a RCP-10

**Como** editor, **quiero** explorar platos nuevos con IA antes de convertirlos en publicaciones, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Generar una propuesta editable desde una idea, restricciones e identidad culinaria; identificarla como propuesta no probada.
- No atribuir cantidades inventadas a una fuente ni afirmar que la receta fue cocinada; separar decisiones generadas de datos aportados.
- Exigir revisión y aceptación del brief propuesto antes de entrar al flujo normal de carrusel.
- Registrar ajustes de prueba culinaria del editor como nuevas versiones; nunca inferir que aprobar una imagen valida sabor o cocción.
- Dejar escalado de porciones, nutrición automática y adaptación a video como ampliaciones separadas.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
