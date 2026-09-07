---
id: IMG-07
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-07 — Controlar errores, concurrencia y coste por edición

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** que cada edición tenga un estado y límites propios, **para** reintentar fallos sin perder resultados ni pagar ejecuciones duplicadas.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-05, IMG-06

**Criterios de aceptación**

- Los estados distinguen solicitud guardada, en ejecución, resultado pendiente de revisión y fallo; los errores se muestran en la unidad afectada.
- La ejecución usa una clave idempotente vinculada a draft, unidad, base y revisión de solicitud. Un doble clic no inicia dos trabajos; un reintento deliberado conserva su propio intento.
- Cada trabajo utiliza un snapshot inmutable. Editar una instrucción durante la ejecución crea una revisión distinta y no altera el trabajo en curso.
- Un resultado tardío no sobrescribe una selección, solicitud o aprobación posterior. Se conserva en historial y se presenta como resultado de una revisión anterior.
- Los límites de tiempo, intentos y presupuesto creativo existentes se aplican por ejecución; no se reintenta indefinidamente ni se cambia a un proveedor más caro de forma silenciosa.
- Autorización, lectura del original, proveedor y almacenamiento se ejecutan en servidor con aislamiento por tema. No se exponen claves privadas ni URLs con credenciales.
- Un fallo del proveedor o almacenamiento conserva la base y las otras unidades, registra el estado y permite reintento acotado.

**Avance parcial (con IMG-02)**

- Ya implementado: estados `saved` / `running` / `applied` / `failed` en `creative_asset_edit_requests`; compare-and-swap `saved → running` para que un doble clic no lance dos trabajos; escritura del resultado guardada por revisión, de modo que un guardado durante la generación (revisión nueva) no queda marcado como aplicado ni fallido por el trabajo anterior; `last_error` visible en la unidad y reintento vía "Reintentar".
- Pendiente: clave idempotente completa por (draft, unidad, base, revisión) con reintento deliberado como intento propio; aplicación de límites de tiempo / intentos / presupuesto por ejecución; resultado asíncrono tardío presentado como revisión anterior en el historial (necesita IMG-04/05).
