---
id: BRAND-01
feature: FEAT-BRAND-001
status: review
board: brand-visual-references.kanban.md
tags: [brand, review, p0]
---

# BRAND-01 — Subir referencias visuales de marca

**Estado:** [[status-review]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** subir referencias visuales de marca, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- La biblioteca por tema permite subir PNG, JPEG y WebP: posts terminados, posters, stickers, señalética y láminas con múltiples elementos. Conserva el original; no exige separar una lámina en objetos.
- Cada referencia registra ID estable, versión, hash, dimensiones, tipo, nombre, procedencia y condiciones declaradas para reutilización y envío al proveedor. Subirla no la convierte en un logo ni en un personaje.
- El servidor valida contenido, límites de bytes y dimensiones antes de guardar mediante las abstracciones privadas de R2. Lecturas y vistas previas requieren autenticación y aislamiento por tema; no exponen claves de almacenamiento.
- La UI usa UXDSL, paleta y breakpoints del proyecto; permite ver, nombrar y desactivar referencias sin borrar originales usados en versiones históricas.
