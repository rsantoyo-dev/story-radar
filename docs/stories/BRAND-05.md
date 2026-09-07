---
id: BRAND-05
feature: FEAT-BRAND-001
status: todo
board: brand-visual-references.kanban.md
tags: [brand, todo, p0]
---

# BRAND-05 — Guardar referencias en el draft y sus versiones

**Estado:** [[status-todo]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** guardar referencias en el draft y sus versiones, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-04

**Criterios de aceptación**

- Cada unidad guarda un snapshot de referencias seleccionadas: ID, versión, hash, función e instrucciones de uso. Cada ejecución registra además el conjunto efectivamente enviado y lo vincula al asset resultante.
- Cambiar un archivo o sus instrucciones crea una nueva revisión de biblioteca. Un draft existente no adopta silenciosamente esa revisión ni pierde la referencia que explica su imagen.
- Las entradas del hash de generación incluyen referencias y sus instrucciones, de modo que cambios reales invaliden la caché correspondiente.
- Actualizar deliberadamente referencias de un draft crea una nueva versión y deja los resultados afectados pendientes de revisión; no modifica assets históricos ni regenera todas las unidades.
- Respuestas tardías se vinculan a la versión que las solicitó y no reemplazan selecciones o aprobaciones más recientes.
