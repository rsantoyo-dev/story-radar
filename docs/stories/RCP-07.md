# RCP-07 — Editar y aprobar el Recipe Carousel Draft

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-05, RCP-06

**Como** editor, **quiero** revisar el carrusel completo antes de gastar en imágenes, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Reutilizar el workspace de draft con listado de slides y edición de hook, copy, pasos, continuidad y CTA.
- Mostrar porciones y referencias a ingredientes/pasos sin exponer detalles técnicos en la lectura normal.
- Mostrar blockers y advisories por slide con acceso directo al campo; permitir guardar un draft incompleto sin aprobarlo.
- Aprobar la versión completa solo al resolver blockers; no heredar aprobación de un brief o imagen anterior.
- Conservar acceso al brief y origen; navegar desde Overview al draft y versión correctos.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
