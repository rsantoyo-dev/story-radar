---
id: GEO-02
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.kanban.md
tags: [geo, done, p0]
---

# GEO-02

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-01]]

<!-- body -->
**GEO-02 — Extraer menciones de lugares con Luna**

**Como** editor, **quiero** recibir los lugares mencionados en la noticia, **para** seleccionar qué debe aparecer en cada imagen.

**Prioridad:** P0 · **Dependencias:** GEO-01 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Luna devuelve JSON validado con nombre literal, tipo, fragmento exacto de evidencia y contexto geográfico disponible; los campos desconocidos quedan vacíos.
- Se distinguen lugar del evento, lugares secundarios y menciones genéricas como “la plaza pública”.
- Las coordenadas nunca proceden de una inferencia del modelo; se reservan para un proveedor o confirmación manual.
- Artículo, metadatos e imágenes se tratan como datos no confiables, nunca como instrucciones.
- Una ambigüedad excluye ese lugar de la representación automática y se explica al final. La corrección manual se ofrece en la revisión final, no como requisito intermedio.
- Se registran modelo, versión de entrada, uso y fallos; se limita a una extracción y un reintento de estructura por versión, con caché y alternativa automática tipográfica o bloqueada para revisión final.
- Se conserva el idioma y los nombres locales, incluyendo francés y variantes con acentos.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-02

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.

Revisión de búsqueda web: Luna consulta texto e imágenes; URLs reales de herramienta y enlaces de búsqueda Google Maps aparecen en la revisión final sin aprobaciones intermedias. Prueba real aislada: 12 fuentes y dos fotos candidatas. Esto no habilita ingestión automática de nuevas fuentes ni Google Places API; la composición conserva sus verificaciones existentes. Pruebas: 351; validación hiperlocal final pendiente.
