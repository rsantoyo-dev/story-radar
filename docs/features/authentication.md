# Feature: Autenticación y cuentas — login fiable con Better Auth

**ID:** FEAT-AUTH-001  
**Estado:** En implementación desde AUTH-01; el resto sigue planificado.  
**Fecha:** 25 de septiembre de 2026  
**Producto:** Press Craftor  
**Tablero:** [authentication.kanban.md](authentication.kanban.md)

## Objetivo y experiencia esperada

Cada persona entra con su propia cuenta, trabaja dentro de su workspace y ningún secreto de servidor vuelve a viajar al navegador. Esta base permite que el producto se venda como SaaS: los créditos que un cliente compre pertenecen a su workspace y cada acción queda atribuida a quien la hizo.

Historia principal: **Como editor, quiero entrar con mi cuenta de Google y operar en mi workspace, para que mi trabajo y mis créditos sean míos y el acceso sea seguro y trazable.**

Modo alfa acordado el 25 de septiembre de 2026: el registro es abierto, cada workspace nuevo nace con 1 USD de crédito y el acceso real se limita con la pantalla de consentimiento de Google en modo de pruebas. La feature cubre identidad, tenencia, autorización de las rutas actuales y el asiento inicial de crédito. El consumo de créditos es una feature posterior (FEAT-BILL-001).

## Punto de partida comprobado

- No existen usuarios ni sesiones. `src/app/api/radar/radar-api-auth.ts` compara una cabecera `Authorization: Bearer` con `RADAR_COLLECTOR_SECRET` en 69 de los 70 route handlers. Las dos excepciones son la entrega pública por token opaco (`/api/deliver/[token]`) y el endpoint interno del worker de Instagram.
- El navegador guarda ese secreto en `sessionStorage` (`story-radar:collector-secret`, en `src/app/radar-dashboard.tsx`) y 20 componentes cliente lo envían en cada `fetch`. Es un secreto compartido de servidor expuesto al cliente: cualquiera que lo conozca opera toda la instalación y no hay trazabilidad por persona.
- `workspaces` (`id` text, seed `default`) ya es la frontera de tenencia declarada. `topics`, `rss_sources` y `knowledge_documents` llevan `workspace_id`. `DEFAULT_WORKSPACE_ID` es el valor por defecto de unas 25 funciones en `topic-catalog.repository.ts` y en `knowledge-documents.repository.ts`; `requireTopic` no comprueba el workspace.
- Persistencia: Drizzle 0.45 con Neon `neon-http`, que no soporta transacciones. El adaptador `@better-auth/drizzle-adapter` 1.7.6 en PostgreSQL usa `RETURNING` y solo abre transacciones si se configura `transaction: true`; con el valor por defecto (`false`) es compatible con el cliente actual.
- Next.js 16: `proxy.ts` sustituye a middleware, corre en Node y no es autoridad de sesión. Los server functions no pasan por el proxy; cada handler y cada server component deben verificar por sí mismos. `headers()` y `cookies()` son asíncronos.
- Patrones reutilizables ya presentes: estado firmado con HMAC (`meta-oauth-state.ts`), cifrado AES-256-GCM en reposo (`meta-token-crypto.ts`), tests `node:test` con PGlite, campo `connected_by` en conexiones Meta, y contabilidad en micro-dólares en `creative_text_calls` (`reserved_micros`, `charged_micros`).
- Despliegue en Vercel con funciones serverless: la memoria de proceso no sirve para límites de tasa ni para caché de sesión.
- No hay proveedor de correo entre las dependencias. Con Google como único método de acceso no hace falta en esta feature.

## Decisiones de arquitectura

| Tema | Decisión | Motivo |
|---|---|---|
| Librería | Better Auth 1.7.6 con `@better-auth/drizzle-adapter` (misma versión) y el plugin `nextCookies` en última posición | Esquema propio en Drizzle, sesiones en nuestra base, sin servicio externo de identidad; compatible con `neon-http` |
| Ubicación | Config server-only en `src/app/modules/auth/auth.ts`, cliente en `src/app/modules/auth/auth-client.ts`, handler en `src/app/api/auth/[...all]/route.ts` | Sigue la separación actual entre `src/app/api` y `src/app/modules` |
| Método de acceso | Solo Google (OpenID Connect) durante la alfa. Sin contraseñas ni correo transaccional. La cuenta se crea en el primer inicio de sesión y el email llega verificado por Google | Elimina almacenamiento de contraseñas, verificación y restablecimiento; un solo botón. `accountLinking` con `trustedProviders: ["google"]` deja preparada la incorporación de otros métodos |
| Sesiones | Tabla `sessions` con cookie httpOnly, Secure y SameSite=Lax; expiración 7 días, refresco cada 24 h; `cookieCache` compacto de 5 minutos | Revocación real y menos consultas a Neon por render. Se descartan JWT sin estado porque impiden cerrar sesiones |
| Tenencia | Tabla propia `workspace_members` (`workspace_id`, `user_id`, `role`) y `sessions.active_workspace_id`. Cada usuario nuevo recibe un workspace personal en su primer inicio de sesión. Sin plugin `organization` por ahora | En la alfa cada persona tiene un workspace y no hay equipos; la tabla se diseña con los mismos campos que el plugin `organization` para poder mapearlo después sin migrar datos |
| Alta | Abierta. Al crear el workspace personal se registra un asiento de crédito inicial de 1 USD (1 000 000 micros) en un libro mayor append-only | Es el modelo de negocio acordado; el asiento existe desde el primer día para que FEAT-BILL-001 solo añada el consumo |
| Bloqueo de alfa | Pantalla de consentimiento de Google en estado "Testing" con lista de usuarios de prueba (máximo 100). Además `AUTH_ALLOWED_EMAILS` opcional en servidor; vacía significa abierto | Bloqueo sin código en el lado de Google y un segundo cierre barato en el nuestro, retirable sin migración |
| Autorización | Tres capas: proxy optimista (solo cookie, solo redirección de páginas), capa de acceso a datos con `requireSession` y `requireWorkspaceContext`, y `authorizeRadarRequest` en cada handler | Alineado con la guía de autenticación de Next 16; el proxy nunca es la única barrera |
| Server-to-server | Los workers y el cron siguen usando `RADAR_COLLECTOR_SECRET` e `INSTAGRAM_PUBLISH_WORKER_SECRET` por Bearer; el navegador deja de conocerlos | El secreto vuelve a ser solo de servidor sin romper la automatización |

### Capas de autorización

```
Navegador ──cookie──▶ proxy.ts (¿hay cookie? si no, redirige a /login)
                       │  solo páginas; excluye /api/auth, /api/deliver, /api/internal, _next
                       ▼
                    route handler / server component
                       │  authorizeRadarRequest(request)  ó  requireWorkspaceContext()
                       │  sesión válida en BD  ó  Bearer de servidor
                       │  en POST/PUT/PATCH/DELETE con cookie: Origin del mismo sitio
                       ▼
                    repositorio con workspaceId explícito
```

## Modelo de datos

| Tabla | Origen | Notas |
|---|---|---|
| `users` | Better Auth | `id` text, `email` único sin distinguir mayúsculas, `email_verified`, `name`, `image`, timestamps |
| `sessions` | Better Auth | `token` único, `expires_at`, `ip_address`, `user_agent`, `active_workspace_id` |
| `accounts` | Better Auth | `provider_id` + `account_id` (Google), tokens OAuth; `password` nula mientras no exista ese método |
| `verifications` | Better Auth | `identifier`, `value`, `expires_at`; la librería la usa para el estado OAuth |
| `workspaces` | existente | Sin cambios de forma; se conservan checks de nombre y slug |
| `workspace_members` | propia | `id` text, `workspace_id`, `user_id`, `role` (`owner`, `admin`, `member`), `created_at`; único por par; mismos campos que `member` del plugin `organization` |
| `workspace_credit_entries` | propia, mínima | `id`, `workspace_id`, `kind` (`signup_grant` por ahora), `amount_micros`, `idempotency_key` único, `actor`, `created_at`; append-only, saldo derivado por suma |

Migraciones aditivas generadas con `db:generate` y validadas con `db:check`. Nombres de tabla en plural y columnas en snake_case como el resto del esquema (`usePlural`). Las propiedades del esquema Drizzle conservan los nombres de campo de Better Auth (`emailVerified`, `expiresAt`, `ipAddress`) porque el adaptador resuelve por propiedad, no por nombre de columna. Los identificadores son texto generado por Better Auth, compatibles con `workspaces.id`.

## Flujos

- **Primer inicio de sesión.** El botón "Continuar con Google" abre el consentimiento de Google. Al volver, Better Auth crea `users` y `accounts`; un hook posterior crea el workspace personal, la membresía `owner` y el asiento de 1 USD con clave de idempotencia. Como `neon-http` no tiene transacciones, `requireWorkspaceContext` repara la falta de workspace de forma perezosa y con las mismas claves de idempotencia.
- **Inicio de sesión posterior.** Mismo botón; la sesión fija `active_workspace_id` al único workspace del usuario o al último usado.
- **Usuario no permitido.** Con `AUTH_ALLOWED_EMAILS` definida, el hook previo a la creación de usuario rechaza el email con un error genérico y no crea nada. Fuera de la lista de prueba de Google, el propio consentimiento de Google bloquea antes.
- **Cierre de sesión y sesiones activas.** Cerrar la actual; listar y revocar otras desde ajustes de cuenta.
- **Instagram OAuth.** El callback de Meta sigue firmando el `state` con HMAC; al volver, la sesión está en la cookie, así que desaparece la dependencia de `sessionStorage`.

## Google Cloud y Vercel

- Credencial "ID de cliente de OAuth 2.0" de tipo aplicación web en APIs y servicios > Credenciales. URI de redirección exactas: `https://<dominio de producción>/api/auth/callback/google` y `https://localhost:3000/api/auth/callback/google` (con `npm run dev:https`, igual que Instagram).
- Los despliegues de vista previa de Vercel tienen URL variable y Google no admite comodines: el inicio de sesión se prueba en local y en producción, o en un dominio fijo de vista previa registrado a mano.
- Pantalla de consentimiento externa con solo `openid`, `email` y `profile`. En estado "Testing" solo entran los usuarios de prueba listados; es el bloqueo de la alfa. Publicarla a producción no requiere verificación con esos ámbitos.
- `BETTER_AUTH_URL` y `RADAR_APP_URL` apuntan al mismo dominio por entorno; `trustedOrigins` se limita a ese valor.

## Seguridad y fiabilidad

- Sin contraseñas propias en la alfa; el email verificado lo aporta Google. Al añadir otro método (AUTH-09) se mantiene `accountLinking` solo con proveedores de confianza.
- Límites de tasa con almacenamiento en base de datos, no en memoria, con reglas específicas para las rutas de `/api/auth`.
- Cookies httpOnly, Secure en producción, SameSite=Lax y prefijo propio. `trustedOrigins` limitado a `RADAR_APP_URL`.
- Las rutas mutadoras que se autorizan por cookie exigen `Origin` o `Sec-Fetch-Site` del mismo sitio. Las que se autorizan por Bearer no dependen de cookies.
- El proxy solo lee la cookie y redirige; nunca consulta la base ni concede acceso. Toda decisión real ocurre en el handler o en el server component.
- Respuestas 401 y 403 uniformes que no revelan si un topic o un usuario existen en otro workspace.
- Sin secretos de servidor en `NEXT_PUBLIC_*`, en `sessionStorage` ni en el bundle del cliente. El secreto de cliente de Google solo vive en el servidor.
- Cabeceras de seguridad en `next.config.ts` compatibles con UXDSL y las fuentes de Google.
- Auditoría mínima: `sessions` guarda IP y user agent; las acciones sensibles registran el actor (`user:<id>` o `service:collector`), empezando por `connected_by` y por el asiento de crédito.
- Cada capa tiene pruebas con `node:test`: autorización de rutas (cookie válida, expirada, Bearer, origen cruzado), creación idempotente de workspace y asiento, y aislamiento entre workspaces con PGlite. Better Auth no se prueba por dentro.

## Compatibilidad y despliegue por fases

| Fase | Qué cambia | Qué se conserva | Historias |
|---|---|---|---|
| A: cimientos | Paquetes, esquema, migraciones, config con Google, handler `/api/auth`, página de acceso, workspace personal y owner del workspace `default` | Todo el comportamiento actual; el Bearer del navegador sigue funcionando | AUTH-01, AUTH-02, AUTH-03 |
| B: doble autorización | `authorizeRadarRequest` acepta sesión o Bearer en los 69 handlers; proxy optimista | Workers y cron con Bearer; el campo de secreto en el dashboard aún existe | AUTH-04, AUTH-05 (primera parte) |
| C: retirada del secreto | Se eliminan el campo, el `sessionStorage` y la cabecera de los 20 componentes; workspace desde la sesión en repositorios | Bearer solo server-to-server; flag `AUTH_REQUIRED=false` durante una versión como retroceso | AUTH-05 (segunda parte), AUTH-06 |
| D: alfa abierta | Endurecimiento, crédito inicial y bloqueo de alfa | Modelo de datos sin migraciones destructivas | AUTH-07, AUTH-08 |
| Después | Segundo método de acceso, invitaciones y equipos | Tablas compatibles con el plugin `organization` | AUTH-09, AUTH-10 |

Reglas de transición, en línea con la sección 19 de AGENTS.md: los datos del workspace `default` no se mueven ni se renombran; el owner inicial se asigna con un script idempotente; `DEFAULT_WORKSPACE_ID` queda reservado a seeds, migraciones y workers hasta que AUTH-06 lo retire de las rutas de usuario.

## Variables de entorno nuevas

| Variable | Uso |
|---|---|
| `BETTER_AUTH_SECRET` | Firma de cookies y tokens; obligatoria, el arranque falla sin ella |
| `BETTER_AUTH_URL` | Igual a `RADAR_APP_URL`; base de callbacks y `trustedOrigins` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credencial OAuth de Google Cloud; solo servidor |
| `AUTH_ALLOWED_EMAILS` | Opcional; lista separada por comas de emails o dominios (`@ejemplo.com`) admitidos en la alfa; vacía significa abierto |
| `AUTH_SIGNUP_CREDIT_USD` | Crédito inicial por workspace nuevo; por defecto `1` |
| `AUTH_REQUIRED` | Transitoria en la fase C; `false` mantiene el Bearer del navegador una versión |

## Entregas y límites

Fuera de alcance de esta feature: consumo y compra de créditos (FEAT-BILL-001), contraseñas y correo transaccional (AUTH-09, en backlog), invitaciones y equipos (AUTH-10, en backlog), SSO empresarial, segundo factor y permisos finos por topic. No prometer aislamiento multi-tenant hasta cerrar AUTH-06.

## Criterios de entrega transversales

- Ningún secreto de servidor llega al navegador tras la fase C; se verifica revisando el bundle y las peticiones de red.
- Todo handler que acepte cookie y mute estado comprueba el origen; todo handler que acepte Bearer sigue funcionando desde los workers.
- Un usuario de un workspace no puede leer ni modificar topics, fuentes, documentos ni drafts de otro; pruebas con dos workspaces.
- La creación de workspace y del asiento de crédito es idempotente: repetir el primer inicio de sesión o una reparación perezosa nunca duplica créditos.
- Página de acceso con UXDSL: roles de Button y Surface, densidades y paleta existentes; responsive y accesible.
- `npm run lint`, `npm run build`, `npm test` para el dominio afectado y `npm run db:check` en cada cambio de esquema.
- Leer `node_modules/next/dist/docs/` antes de crear el proxy, el handler catch-all y los server components con sesión.

## Historias de implementación

- [AUTH-01 — Instalar Better Auth con Drizzle, esquema de identidad e inicio de sesión con Google](../stories/AUTH-01.md) · P0.
- [AUTH-02 — Crear el workspace personal y la membresía en el primer inicio de sesión](../stories/AUTH-02.md) · P0.
- [AUTH-03 — Construir la página de acceso con Google, menú de usuario y cierre de sesión](../stories/AUTH-03.md) · P0.
- [AUTH-04 — Crear la capa de acceso a datos y la autorización de rutas](../stories/AUTH-04.md) · P0.
- [AUTH-05 — Retirar el secreto del navegador y proteger la aplicación](../stories/AUTH-05.md) · P0.
- [AUTH-06 — Aislar repositorios y servicios por workspace](../stories/AUTH-06.md) · P0.
- [AUTH-07 — Endurecer sesiones, límites y auditoría](../stories/AUTH-07.md) · P1.
- [AUTH-08 — Registrar el crédito inicial de 1 USD y el bloqueo de alfa](../stories/AUTH-08.md) · P1.
- [AUTH-09 — Añadir un segundo método de acceso con correo](../stories/AUTH-09.md) · P2.
- [AUTH-10 — Invitaciones y equipos por workspace](../stories/AUTH-10.md) · P2.

## Decisiones tomadas el 25 de septiembre de 2026

1. Solo Google como método de acceso durante la alfa; el correo transaccional (Resend, disponible en el Marketplace de Vercel) queda para AUTH-09.
2. Tenencia con tabla propia `workspace_members`, compatible por nombres con el plugin `organization` para adoptarlo en AUTH-10 si hacen falta equipos.
3. Registro abierto con 1 USD de crédito por workspace nuevo; el acceso durante la alfa se limita con la lista de usuarios de prueba de Google y, si se desea, `AUTH_ALLOWED_EMAILS`.
