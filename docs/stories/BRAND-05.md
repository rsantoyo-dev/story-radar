---
id: BRAND-05
feature: FEAT-BRAND-001
status: done
board: brand-visual-references.kanban.md
tags: [brand, done, p0]
---

# BRAND-05 — Guardar referencias en el draft y sus versiones

**Estado:** [[status-done]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** guardar referencias en el draft y sus versiones, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-04

**Criterios de aceptación**

- Cada unidad guarda un snapshot de referencias seleccionadas: ID, versión, hash, función e instrucciones de uso. Cada ejecución registra además el conjunto efectivamente enviado y lo vincula al asset resultante.
- Cambiar un archivo o sus instrucciones crea una nueva revisión de biblioteca. Un draft existente no adopta silenciosamente esa revisión ni pierde la referencia que explica su imagen.
- Las entradas del hash de generación incluyen referencias y sus instrucciones, de modo que cambios reales invaliden la caché correspondiente.
- Actualizar referencias de una unidad crea una nueva versión de su asset dentro del draft y deja ese resultado pendiente de revisión, conservando las demás unidades. Cambiar los defaults generales mediante guardado crea una nueva versión del draft; ninguno de los recorridos reescribe imágenes históricas.
- Respuestas tardías se vinculan a la versión que las solicitó y no reemplazan selecciones o aprobaciones más recientes.


## Entrega

Implementación terminada; operación y validación en la [feature](../features/brand-visual-references.md).
