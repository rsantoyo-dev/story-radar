---
id: IMG-08
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-08 — Validar edición incremental y regresiones

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** validar el recorrido con drafts nuevos, existentes y aprobados, **para** entregar ajustes por imagen sin degradar el flujo editorial.

**Prioridad:** P0 · **Dependencias:** IMG-07

**Criterios de aceptación**

- Pruebas verifican persistencia al recargar, separación de prompt e instrucción y ausencia de llamadas al proveedor al guardar.
- En un carrusel de tres imágenes, editar la segunda produce una sola nueva imagen; las versiones de la primera y tercera se conservan.
- Pruebas cubren base antigua, comparación, recuperación de versión, archivo ausente, doble envío, fallo parcial, cambio de política y resultado asíncrono obsoleto.
- La composición documental conserva el original y los rótulos; se comprueba que ninguna rama documental llama al generador, incluso ante un error.
- Editar un conjunto aprobado exige una nueva aprobación del conjunto modificado y conserva la trazabilidad de exportaciones y publicaciones anteriores.
- Se valida el flujo en móvil y escritorio con un draft existente y un carrusel aprobado. Pasan pruebas relevantes, lint y build; db:check solo si se requieren migraciones. Se documentan bloqueos reales del entorno.
- En un carrusel existente y aprobado, cambiar el título de la segunda slide y guardar conserva las tres imágenes sin llamadas al proveedor, marca solo la segunda pendiente y recupera ese estado al recargar. Actualizarla produce una sola versión nueva, usando su imagen anterior y el texto guardado sin prompt manual.
- Pruebas cubren varios cambios de título antes de aplicar, cambio durante la ejecución, reordenación de slides, restauración del texto anterior y cambios de caption sin efecto visual. Ningún resultado obsoleto elimina el estado pendiente del texto vigente.
- La aprobación y exportación del conjunto se bloquean mientras texto e imagen estén desfasados; después de incorporar el resultado y revisar el conjunto, las otras unidades conservan sus versiones. Se verifica tanto la edición generativa como la recomposición determinista.

**Avance de actualización de texto:** implementado para unidades con identidad, orden y configuración visual conservados. Véanse alcance, persistencia y validación en la feature; no da por terminados los demás criterios de esta historia.
