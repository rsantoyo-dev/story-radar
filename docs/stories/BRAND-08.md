---
id: BRAND-08
feature: FEAT-BRAND-001
status: todo
board: brand-visual-references.kanban.md
tags: [brand, todo, p0]
---

# BRAND-08 — Validar referencias de marca y regresiones

**Estado:** [[status-todo]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** validar referencias de marca y regresiones, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-06 y BRAND-07

**Criterios de aceptación**

- Fixtures incluyen post terminado, sticker transparente, señalética con texto francés y lámina con 30 motivos; verifican que llegan como imágenes al adaptador y con su función correcta.
- Pruebas cubren aislamiento entre temas, archivo inválido, permisos insuficientes, límites conjuntos con protagonistas, biblioteca vacía y fallos o timeout del proveedor.
- Pruebas de versiones cubren cambio de referencia, edición de una sola unidad, caché, respuesta obsoleta y conservación de aprobaciones históricas sin aprobar nuevas imágenes.
- Se verifica que fotografía obligatoria nunca invoque el generador a causa de esta biblioteca y que OCR o instrucciones dentro de una imagen no modifiquen las políticas.
- La validación visual final del piloto compara coherencia de marca e identidad del protagonista en posts y carruseles; registra alteraciones de textos y motivos. Los mocks no sustituyen esta validación con el proveedor configurado.
- Pasan pruebas relevantes, lint y build; db:check si la implementación requiere migraciones. Bloqueos del entorno y validación pendiente quedan documentados.
