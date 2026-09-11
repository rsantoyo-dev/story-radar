# RCP-10 — Validar el recorrido completo y documentar la entrega

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-01 a RCP-09

**Como** editor, **quiero** tener evidencia de que el formato funciona sin regresiones en noticias, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Probar Chez Ricard con Poutine de papa criolla con sobrebarriga desde entrada manual hasta paquete aprobable.
- Cubrir receta simple sin salsa, receta vegetariana, cantidades faltantes, discrepancia de papas, preparación omitida y texto que no cabe.
- Probar referencias cambiadas, fallos de proveedor, regeneración individual, aprobaciones obsoletas y aislamiento con un topic de noticias.
- Validar navegación con teclado, etiquetas, foco, errores y responsive en móvil y escritorio con dos paletas; registrar evidencia visual.
- Ejecutar pruebas de dominio y contratos, lint y build; db:check cuando corresponda. Publicación de prueba requiere autorización explícita.
- Documentar límites de revisión culinaria y de fidelidad visual, actualizar fichas y kanban con evidencia; planificado no equivale a implementado.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
