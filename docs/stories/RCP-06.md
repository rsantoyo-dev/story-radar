# RCP-06 — Validar y reparar coherencia culinaria del draft

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-04, RCP-05

**Como** editor, **quiero** recibir un draft consistente después de las revisiones automáticas, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Aplicar reglas de receta en lugar de imponer requisitos propios de una noticia, conservando los controles generales de evidencia.
- Detectar ingredientes usados sin declarar, ingredientes principales sin uso, cantidades incompatibles, pasos omitidos y sustituciones no aprobadas.
- Caso obligatorio: título papa criolla con lista Russet debe bloquear y señalar la discrepancia; el sistema no elige una variedad silenciosamente.
- Caso obligatorio: papas crujientes sin paso que explique su preparación debe señalarse; una descripción del resultado no sustituye el procedimiento.
- Reparar automáticamente copy, distribución y CTA cuando el brief contiene la respuesta; volver a ejecutar validadores sobre el resultado reparado.
- Limitar el ciclo de reparación y mostrar el dato específico que falta cuando no puede resolverse desde la evidencia, evitando aprobar o inventar por agotamiento de reintentos.
- No inventar afirmaciones nutricionales, ausencia de alérgenos ni instrucciones de seguridad; preservar temperaturas y condiciones aportadas y someter dudas a revisión.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
