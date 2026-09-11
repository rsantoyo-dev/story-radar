# RCP-02 — Configurar identidad culinaria y objetivos de Chez Ricard

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** RCP-01

**Como** editor, **quiero** definir voz, audiencia y estilo culinario de la marca, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Extender el perfil existente con identidad culinaria, público, idioma, tono, dificultad preferida y objetivos de deslizar, guardar y seguir.
- Permitir configurar mezcla cultural, expresiones francesas y español principal; no introducir bilingüismo automáticamente por ubicación.
- Reutilizar paleta dinámica, logo, referencias visuales y personajes aprobados; personaje opcional para no desplazar al plato.
- Definir reglas de portada: plato protagonista, hook breve, promesa verificable e invitación explícita a deslizar.
- Guardar cambios explícitamente y aplicar snapshots en siguientes versiones; no reescribir publicaciones existentes.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
