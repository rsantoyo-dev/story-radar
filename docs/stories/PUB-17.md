---
id: PUB-17
feature: FEAT-PUB-001
status: backlog
board: instagram-publishing.kanban.md
tags: [publishing, backlog, p1, automation]
---

# PUB-17 — Habilitar publicación autónoma con autorización y límites explícitos

**Estado:** [[status-backlog]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P1, opcional tras el modo supervisado · **Dependencias:** [PUB-16](PUB-16.md), [PUB-07](PUB-07.md), [PUB-12](PUB-12.md), [AUTH-04](AUTH-04.md), [AUTH-05](AUTH-05.md), [AUTH-06](AUTH-06.md)

**Como** responsable del Topic, **quiero** autorizar workflows acotados que publiquen sin revisar manualmente cada pieza, **para** automatizar los casos que cumplen mis criterios y detener los demás.

## Criterios de aceptación

- Deshabilitado por defecto. Solo un actor autorizado puede activar una política versionada para el Topic y un workflow concreto. Configurar destinos/cuentas permitidos, formatos, alcance editorial, vigencia, horario, límites por cuenta/Topic y condiciones de suspensión.
- La activación explica que se enviará contenido sin aprobación individual y registra responsable, fecha y alcance. Es una autorización distinta de conectar Meta, generar un draft o activar PUB-16; no se aplica retroactivamente a borradores existentes salvo selección explícita.
- Factualidad, evidencia y calificadores, brand policy del Topic, accesibilidad, derechos de uso y validaciones técnicas son gates persistidos sobre la revisión exacta. El agente generador no puede declarar cumplida su propia validación sin pasar los controles independientes definidos.
- Si cualquier gate requerido está pendiente, falla o tiene incertidumbre material, derivar a revisión humana. Los umbrales son configuración del Topic/workflow y no premian sensacionalismo ni cambian hechos para superar el control.
- Construir y conservar siempre el preview y el paquete inmutable antes del envío, accesibles desde la Story. Configurar publicación inmediata tras los gates o un horario/ventana de espera; indicar cuándo todavía puede detenerse.
- Registrar la autorización de política y las validaciones como evidencia propia, sin inventar un aprobador humano. Extender las comprobaciones actuales de aprobación mediante este modo explícito; conservar sus invariantes para los workflows supervisados.
- Comprobar límites y reservar cuota local de forma atómica por destino antes de despachar. Acotar reintentos y coste; otra ejecución del mismo draft/política no genera una nueva publicación.
- Un control de pausa a nivel Topic y workflow detiene trabajos aún no enviados. Revocar política, membresía autorizante según la regla definida, cuenta o aprobación de evidencia impide nuevas entregas; resultados remotos inciertos siguen reconciliándose.
- Definir respuesta a una publicación incorrecta: localizar paquete, destinos e IDs, detener la cola y abrir una corrección o retirada asistida. Documentar qué operación remota admite cada conector; nunca presentar una cancelación local como borrado de un post publicado.
- Antes de habilitar envíos, ejecutar simulación que registra decisiones y previews sin publicar. La activación de producción exige revisión de resultados y una prueba real expresamente autorizada.

## Validación y entrega

Probar permiso insuficiente para activar, default deshabilitado, fallo de cada gate, cambios de política durante el trabajo, límite concurrente, pausa después de un éxito parcial y recuperación de un resultado incierto sin reenvío. Incluir auditoría completa de un envío autónomo simulado y del recorrido de corrección.

## Alcance

Esta historia especifica una capacidad futura autorizable según AGENTS.md. Su redacción no habilita publicación autónoma ni elimina la aprobación humana exigida por el código actual.
