---
id: PUB-09
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-09 — Conectar Meta y elegir Facebook e Instagram

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** conectar Meta y elegir mi Página de Facebook y mi cuenta de Instagram, **para** gestionar ambos destinos desde el Topic.

**Prioridad:** P0 · **Dependencias:** [PUB-02](PUB-02.md), [PUB-13](PUB-13.md), [AUTH-04](AUTH-04.md), [AUTH-05](AUTH-05.md), [AUTH-06](AUTH-06.md)

**Criterios de aceptación**

- Identificar la página destino y verificar autorización y capacidad de publicación con la API oficial vigente antes de habilitarla. La conexión de Instagram Login no se interpreta como autorización de Facebook Pages.
- Conservar por separado identidad, revisión y estado de cada conexión. Reconectar o cambiar de página nunca redirige órdenes ya autorizadas.
- Mostrar cuenta/página conectada, permiso ausente, autorización vencida y reconexión necesaria. Los tokens y llamadas permanecen en servidor y aislados por tema y usuario autorizado.
- Documentar permisos, revisión de aplicación y requisitos de la versión elegida durante implementación. El alcance es páginas administradas; no perfiles personales.
- Validar conexión sin publicar automáticamente. Registrar QA con una página de prueba y autorización explícita para cualquier envío real.

## Recorrido de conexión Meta

- Mostrar «Conectar Meta» como entrada principal, con autorización mediante Facebook Login for Business y selección explícita de activos. Conservar «Conectar solo Instagram» como alternativa; no cambiar automáticamente conexiones existentes.
- Listar páginas accesibles con paginación y permisos efectivos. Permitir Facebook solo, Instagram vinculado o ambos; si falta el Instagram profesional vinculado, explicar cómo conectarlo sin impedir usar Facebook.
- Comprobar los activos elegidos en servidor al confirmar; no aceptar un page ID o Instagram ID arbitrario del navegador. Guardar únicamente destinos seleccionados y mantener temporalmente las credenciales del paso intermedio en servidor, con caducidad.
- Registrar mecanismo de autorización, app, IDs estables, actor, Topic/workspace, permisos concedidos, expiración, última comprobación y revisión. Distinguir credenciales de la app de Facebook y del producto Instagram; no intercambiar sus IDs o tokens.
- OAuth usa intento persistido, nonce de un solo uso, TTL y vinculación a usuario/sesión, workspace, Topic y mecanismo. Validar de nuevo acceso al completar el callback; cancelación, replay o cambio de workspace no deja una conexión parcialmente aplicada.
- «Conectada», «Puede publicar», «Puede sincronizar» y «Métricas disponibles» son capacidades diferentes. Verificar permisos de Facebook Pages y de Instagram para el mecanismo elegido; no reutilizar los scopes de Instagram Login como si autorizaran Facebook.
- Owner/admin configura conexiones; el permiso para publicar se resuelve desde el contexto del usuario/Topic en servidor. El cliente no recibe tokens ni depende de compartir el Collector secret. Los workers conservan su autenticación de servicio.
- Desconectar, revocar acceso o cambiar un activo suspende futuras entregas afectadas y conserva publicaciones, historial y auditoría. Si ambas plataformas dependen del mismo grant, mostrar el alcance de la desconexión.

## Validación y entrega

Cubrir cuenta sin páginas, página sin Instagram, permisos parciales, páginas con el mismo nombre, selección manipulada, callback repetido/expirado, sesión revocada, otro workspace y coexistencia con Instagram directo.

Entregar una matriz de capacidades/scopes por adaptador y versión, requisitos de App Review/Advanced Access para clientes y diagnóstico de callback HTTPS. Verificar los nombres y requisitos vigentes al implementar; los permisos opcionales de métricas no bloquean publicación.

Referencia: [Instagram mediante Facebook Login, colección oficial de Meta](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login). Esta modalidad exige vincular el Instagram profesional a una Página. Las dependencias AUTH bloquean la habilitación para clientes; las pruebas de adaptadores pueden avanzar con datos simulados.
