---
id: PUB-08
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-08 — Validar publicación y trazabilidad de extremo a extremo

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** validar publicación y trazabilidad de extremo a extremo, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04, PUB-06, PUB-07

**Criterios de aceptación**

- Pruebas cubren aprobación parcial, versión editada, permiso ausente, cuenta sustituida, doble clic, workers concurrentes, timeout antes y después del envío y fallo de persistencia tras éxito remoto.
- Se verifica que un envío confirmado aparece una sola vez en galería e historia, asociado a su snapshot exacto, incluso tras sincronizar de nuevo o editar el draft actual.
- Para PUB-05 se añaden pruebas de zona horaria, cambio horario, caducidad, cancelación concurrente, reprogramación, retraso y pérdida de vigencia. No son requisito para entregar solamente “Publicar ahora”.
- Las pruebas de integración públicas requieren una cuenta de prueba y autorización explícita para cada publicación de validación. La documentación de esta feature no autoriza publicar contenido real.
- La UI usa UXDSL, la paleta del proyecto y sus breakpoints. Pasan pruebas relevantes, TypeScript, lint, build y db:check si hay cambios de esquema; los bloqueos se documentan.
- El despliegue de programación requiere scheduler/worker durable y observabilidad comprobados. Mientras falten se deshabilita “Programar”, manteniendo honesto el alcance disponible.
