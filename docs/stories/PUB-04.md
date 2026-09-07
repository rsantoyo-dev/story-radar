---
id: PUB-04
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-04 — Publicar ahora desde el SaaS

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** publicar ahora desde el SaaS, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03, PUB-07

**Criterios de aceptación**

- “Publicar ahora” presenta cuenta, pieza, texto y conjunto exactos. La acción explícita autoriza ese envío; la aprobación editorial sola no lo inicia.
- El servidor vuelve a comprobar la autorización y vigencia, crea los contenedores correspondientes, espera su disponibilidad y ejecuta media_publish. Se conserva cada ID de proveedor y transición.
- En carruseles se respeta el orden congelado y se envía un único post. No se publican slides sueltos como alternativa ante un fallo.
- La UI distingue preparando, publicando, pendiente de confirmación, publicado y fallido. Un contenedor terminado no equivale a una publicación confirmada.
- El trabajo persiste y puede continuar aunque el editor cierre el navegador. Ningún endpoint depende de una pestaña abierta ni mantiene un sleep hasta completar el proceso.
