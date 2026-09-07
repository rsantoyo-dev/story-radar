---
id: IMG-06
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-06 — Respetar la fidelidad documental y los permisos

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** que las ediciones respeten la política vigente del draft, **para** evitar que un ajuste convierta un lugar real en una representación engañosa.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-03

**Criterios de aceptación**

- El servidor comprueba la política efectiva y las condiciones de uso al ejecutar y al incorporar un resultado; una política antigua del snapshot no permite saltar restricciones actuales.
- En fotografía documental solo se permite recomposición sobre el original elegible. No se envía al generador para añadir, eliminar o reconstruir edificios, personas o elementos del lugar.
- Los mapas se recomponen con sus datos y proveedor autorizados; no se modifican calles ni marcadores mediante generación.
- La edición con referencias verifica permisos para transformación y envío al proveedor y conserva la identificación de ilustración cuando corresponda.
- Una solicitud incompatible se guarda con una explicación, pero no se ejecuta ni cambia silenciosamente de modo. Cambiar de política requiere el flujo explícito existente.
- La evidencia, el original, las condiciones de uso y la atribución permanecen vinculados a cada versión. La nueva versión vuelve a requerir la revisión final correspondiente.

**Avance parcial (con IMG-02)**

- Ya implementado: al aplicar se re-comprueba la política **efectiva vigente** (`assertGenerativeImageryAllowed` con el modo heredado en vivo); `photo-required` / `verified-references` / draft documental → no ejecuta; `editType = "composition"` → rechazado hasta IMG-03; base desactualizada → rechazada; una solicitud incompatible queda pendiente con `blocked_reason` persistente y no cambia de modo.
- Pendiente (necesita IMG-03): recomposición determinista de fotografías documentales y mapas sobre el original elegible; comprobación de política **al incorporar** el resultado (IMG-05); mantener evidencia/atribución/licencia como capa reproducible.
