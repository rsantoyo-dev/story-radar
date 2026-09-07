---
id: BRAND-04
feature: FEAT-BRAND-001
status: todo
board: brand-visual-references.kanban.md
tags: [brand, todo, p0]
---

# BRAND-04 — Enviar referencias al recorrido image-to-image

**Estado:** [[status-todo]] · **Feature:** [Referencias visuales de marca](../features/brand-visual-references.md)

**Como** editor, **quiero** enviar referencias al recorrido image-to-image, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-03

**Criterios de aceptación**

- Las imágenes seleccionadas se transmiten desde el servidor al endpoint explícito image-to-image, junto con el prompt y las referencias de protagonista aplicables. No basta con incluir sus nombres o URLs como texto del prompt.
- El adaptador conserva un mapeo entre cada entrada visual y su función: identidad del protagonista o lenguaje visual de marca. El prompt explica qué tomar de cada referencia sin prometer reproducción exacta.
- Una lámina de 30 elementos se envía como referencia visual completa dentro de los límites del proveedor; no requiere segmentación, extracción individual ni montaje posterior de stickers.
- El resultado mantiene el formato configurado, actualmente 4:5 a 1080×1350. Se registran proveedor, endpoint, versión del prompt y referencias efectivamente enviadas, sin exponer URLs temporales o credenciales.
- Fallos, incompatibilidad o límites del proveedor producen un error o alternativa explícita permitida por la política; no se omiten referencias solicitadas silenciosamente ni se reintenta sin límites.
