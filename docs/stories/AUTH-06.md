---
id: AUTH-06
feature: FEAT-AUTH-001
status: todo
board: authentication.kanban.md
tags: [auth, todo, p0, tenancy]
---

# AUTH-06 — Aislar repositorios y servicios por workspace

**Estado:** [[status-todo]] · **Feature:** [Autenticación y cuentas](../features/authentication.md)

**Prioridad:** P0 · **Dependencias:** [[AUTH-04]]

**Como** cliente del SaaS, **quiero** que ningún otro workspace pueda ver ni tocar mis topics, fuentes y documentos, **para** confiar mis datos y mis créditos a la plataforma.

## Criterios de aceptación

- Retirar el valor por defecto `DEFAULT_WORKSPACE_ID` de las funciones de `topic-catalog.repository.ts` y `knowledge-documents.repository.ts` que sirven a rutas de usuario; el `workspaceId` llega explícito desde `requireWorkspaceContext()` o desde `authorizeRadarRequest`. La constante queda reservada a seeds, migraciones y workers.
- Todas las consultas de topics, fuentes RSS, fuentes de investigación y documentos filtran por `workspace_id`; los listados se limitan a los workspaces donde el usuario es miembro.
- Los workers server-to-server declaran el workspace de forma explícita, por parámetro o iterando los workspaces activos; ningún worker asume `default` de forma implícita.
- Documentar qué tablas hijas (historias, drafts, assets, publicaciones) heredan la tenencia a través de `topic_id` y cómo `requireTopic` la garantiza; añadir constraint o índice compuesto solo si una consulta concreta lo requiere.
- Pruebas con PGlite: dos workspaces con un topic cada uno; el usuario de A no lista, lee, edita ni borra topics, fuentes ni documentos de B; la respuesta es indistinguible de un recurso inexistente.
- `npm test` del dominio de topics y documentos y `npm run db:check` si hubo cambios de esquema.

## Notas de diseño

Cambio de firma en cadena: preferir parámetros obligatorios a valores por defecto para que el compilador señale cada llamada pendiente. Evitar una refactorización simultánea de dominio y UI; los componentes no cambian en esta historia.

## Validación y entrega

Lista de funciones cuya firma cambió y salida de las pruebas de aislamiento. Hasta cerrar esta historia no se debe anunciar aislamiento multi-tenant.
