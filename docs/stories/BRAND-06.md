---
id: BRAND-06
feature: FEAT-BRAND-001
status: todo
board: brand-visual-references.kanban.md
tags: [brand, todo, p0]
---

# BRAND-06 — Reutilizar referencias al editar una imagen

**Estado:** [[status-todo]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** reutilizar referencias al editar una imagen, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-05; integración con IMG-01 a IMG-08

**Criterios de aceptación**

- Al modificar una imagen individual se recuperan sus referencias guardadas y las instrucciones de marca, junto con la imagen base y la petición de cambio, dentro de los límites del proveedor.
- El editor puede mantener, quitar o sustituir referencias para esa unidad; la decisión queda persistida y no afecta automáticamente al resto del carrusel.
- El cambio crea una nueva versión de la imagen con linaje hacia su base. La aprobación anterior no aprueba el resultado nuevo y las demás imágenes conservan su historial.
- Si una referencia histórica está desactivada o ya no es elegible para transmisión, el sistema conserva el snapshot pero no la reenvía; explica la limitación sin reemplazarla silenciosamente.
- No se promete edición localizada perfecta: una solicitud pequeña puede alterar otros detalles en image-to-image y el resultado necesita revisión.
