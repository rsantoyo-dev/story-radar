---
id: PUB-14
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0, preview]
---

# PUB-14 — Mostrar el preview de publicación al terminar el draft

**Estado:** [[status-todo]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P0 · **Dependencias:** [PUB-01](PUB-01.md), [PUB-03](PUB-03.md), [PUB-09](PUB-09.md), [PUB-13](PUB-13.md)

**Como** editor, **quiero** ver cómo quedará la publicación en cada destino después de generar el draft, **para** revisar la pieza y decidir su envío desde una sola pantalla.

## Criterios de aceptación

- La finalización de un draft crea o actualiza idempotentemente una candidatura de preview para esa revisión. Está disponible desde el draft y la Story, y se recupera al volver a abrir la app.
- Mostrar pestañas Facebook/Instagram con página o cuenta, imágenes en orden, texto público, hashtags, atribuciones y accesibilidad admitida. Identificar como aproximada la representación visual de la interfaz de Meta.
- Si solo terminó el texto, mostrar assets pendientes y permitir completar la producción creativa; no simular imágenes finales ni habilitar el envío. La preview está disponible aunque falten conexión, aprobación o permisos, con los bloqueos correspondientes.
- Reutilizar las imágenes aprobadas. Facebook presenta la composición admitida por su adaptador —foto o publicación con varias imágenes— sin asumir que se comporta como el carrusel de Instagram.
- Las variantes de texto y composición por destino tienen revisión propia. Editarlas conserva el historial e invalida la aprobación y el paquete afectados; no modifica una entrega ya autorizada, programada o publicada.
- La vista final de envío utiliza el paquete exacto congelado de PUB-03/PUB-13, incluidos recortes o conversiones que requieran revisión. El envío posterior utiliza ese paquete aunque el draft actual cambie.
- Presentar selección de destinos y acciones «Guardar para revisar», «Aprobar y publicar» y «Aprobar y programar». Cada acción combinada explicita contenido, cuentas y fecha autorizados y registra la aprobación humana y la orden; no convierte el botón editorial existente en un envío implícito.
- Validar en servidor permisos, vigencia y revisión esperada antes de confirmar. Si otro editor cambia el contenido, mostrar la revisión actual y solicitar una nueva decisión, sin enviar el paquete anterior por accidente.
- Un fallo antes de crear la orden permite recuperar la operación con la misma clave; un timeout al confirmar consulta la orden existente. Recargar, cerrar o abrir dos pestañas no crea entregas duplicadas.
- Los estados, foco, navegación por teclado y controles móviles usan los componentes y tokens UXDSL; reutilizar el panel de candidatura actual como base.

## Validación y entrega

Cubrir draft de solo texto, generación parcial de imágenes, revisión documental conjunta, variantes por destino, aprobación caducada, edición concurrente y doble confirmación. Comparar los IDs/hashes y texto del preview aprobado con el paquete utilizado por el adaptador. Ningún preview ni cambio de pestaña publica.
