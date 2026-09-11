# RCP-03 — Crear o importar una receta propia

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-01, RCP-02

**Como** editor, **quiero** iniciar una publicación desde mi receta sin necesitar una noticia, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Agregar Nueva receta desde el topic y permitir título, texto manual y URL opcional; receta propia no requiere URL ficticia.
- Importar URL mediante extracción existente con recuperación manual ante bloqueo; registrar fuente, autor cuando se conozca y método de entrada.
- Permitir adjuntar una fotografía propia como referencia del plato usando almacenamiento privado y permisos existentes.
- Validar tamaño y estructura de entrada; no ejecutar HTML ni instrucciones incluidas en la fuente.
- Distinguir campos faltantes antes de continuar; permitir guardar incompleto y solicitar los datos necesarios sin inventar cantidades.
- La acción crea contenido dentro del topic actual y abre Recipe Brief; no cambia el ranking ni la recolección de noticias.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
