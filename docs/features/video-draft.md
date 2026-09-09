# Feature: Video Draft desde Script Draft

**ID:** FEAT-VID-001  
**Estado:** Planificado — sin implementación iniciada  
**Fecha:** 9 de septiembre de 2026  
**Producto:** Press Craftor  
**Tablero:** [video-draft.kanban.md](video-draft.kanban.md)

## Objetivo

Derivar de una versión guardada de Script Draft un Video Draft editable que reutilice sus hechos, evidencia, enfoque editorial, marca y personajes. Preparar una narración única, recursos visuales y clips del personaje, componerlos con Remotion y entregar un video aprobado 1080×1920 en R2 y descargable.

El Video Draft es el espacio de trabajo que agrupa revisiones del plan, audio, timeline, assets, clips, renders y aprobaciones. Crear esta derivación no modifica el Script Draft original ni hereda automáticamente su aprobación para una adaptación audiovisual.

## Alcance de fase 1

- Un narrador por video: Jo **o** Sofi, con una única voz asignada. La misma voz continúa durante las escenas sin personaje visible.
- Video vertical 9:16, final 1080×1920. Esto no cambia el estándar 4:5 / 1080×1350 de imágenes y carruseles existentes.
- Escenas de tipos `VO`, `STAT`, `TEXT`, `CTA` y `NARRATOR`, resueltas mediante plantillas y animaciones sencillas, predefinidas y versionadas.
- Reutilización de slides, imágenes, fotos y gráficos existentes, recompuestos para el lienzo vertical; generación de recursos faltantes con la integración actual de GPT Image cuando la política lo permita.
- Una generación de voz de la narración completa mediante ElevenLabs por versión de texto/voz/configuración, con alineación temporal normalizada.
- Lip-sync y eliminación de fondo únicamente para escenas `NARRATOR`.
- Preview, cambios selectivos, aprobación del montaje, MP4 final, almacenamiento privado en R2 y descarga controlada.
- Referencia inicial para el MVP: 3–5 escenas y aproximadamente 20–40 segundos. VID-01/02 deben fijar límites definitivos según calidad, coste, requisitos del proveedor y tiempo de render; no se impone esta duración cortando palabras ni acelerando audio.

Fuera de fase 1: publicación en Meta/Reels, programación, diálogos con múltiples voces/personajes, generación de video cinematográfico de cuerpo completo, edición libre de código React, música generativa, clonación de voces y un editor de timeline de propósito general. [VID-16](../stories/VID-16.md) conserva la entrega posterior de Reels.

## Decisiones acordadas

### Remotion recibe todo listo

**JSON resuelto → frames → MP4.** Remotion no llama ElevenLabs, espera fal, elimina fondos, busca imágenes ni decide modelos. Tampoco ejecuta código generado por el Video Director.

La orquestación resuelve recursos y tiempos antes del render. Un worker materializa archivos y fuentes en un paquete local verificable; la composición consume ese paquete. Si falta una dependencia, el trabajo permanece en preparación o bloqueado. Un fallo de render permite repetir solo el render, sin repetir operaciones creativas pagadas.

Se versionan renderer, plantillas, fuentes, configuración y entorno necesario para reproducir el montaje. El objetivo es conservar contenido, tiempos y composición; no se promete identidad binaria de todos los MP4 entre entornos o codificadores.

### Una sola narración maestra

```text
Texto scene1 + scene2 + scene3 + scene4
                  ↓
      UNA generación ElevenLabs
                  ↓
 master-narration.mp3 + alineación
                  ↓
          Timeline Compiler
                  ↓
  tiempos reales + frames + captions
```

Las escenas referencian tramos exactos del texto mediante IDs/rangos, no mediante búsqueda de frases. La duración real del audio manda sobre estimaciones del director. La integración transforma la alineación por caracteres a palabras si hace falta; si necesita alineación adicional, se calcula sobre el mismo audio.

Solo una escena `NARRATOR` extrae un segmento de ese máster para Sync-3. El recorte usa posiciones de audio y márgenes explícitos, sin generar otra voz. Remotion reproduce el máster completo una sola vez; los videos de personaje están silenciados. Se comprueban silencios, retrasos de codificación, límites de palabra y offsets para no introducir deriva.

Una llamada favorece continuidad de voz y pausas, pero no garantiza entonación idéntica. “Una generación por versión” significa reutilizar el resultado y no generar por escena; no significa que el proveedor garantice exactly-once ante fallos de red.

### Personaje como capa con alpha

```text
Imagen aprobada Jo/Sofi + segmento del máster
                    ↓
 fal-ai/sync-lipsync/v3/image-to-video
                    ↓
       talking-character.mp4
                    ↓
     veed/video-background-removal
         output_codec = vp9
                    ↓
        character.webm + alpha
```

El MP4 documentado por Sync-3 no aporta una salida alpha garantizada. VEED documenta VP9 con alpha; su salida `video` es una lista de archivos. La alternativa H264 produce RGB y máscara separados y no es el camino inicial.

Verificar el recorte sobre fondos claros/oscuros y texto moviéndose por detrás. No basta con el nombre del archivo ni con declarar un canal alpha: Jo y Sofi deben conservar identidad, bordes y sincronía en preview y exportación. VID-01 valida esa viabilidad con clips breves antes de aprobar el camino visual de producción.

## Contratos y responsabilidades

| Documento | Responsabilidad | No debe contener |
|---|---|---|
| `VideoPlan.json` | Intención audiovisual: procedencia del script, narración completa, rangos/IDs de escenas, hechos, personaje/voz, capas e intención de recursos. | Tiempos finales inventados antes del audio; código ejecutable; elección libre de proveedores por el modelo. |
| `VideoTimeline.json` | Montaje determinista desde audio/alineación: duración, reloj de muestras, FPS, frames, captions y segmentos del máster. | Solicitudes de nueva narración por escena o decisiones editoriales nuevas. |
| `ResolvedVideo.json` | Recursos y versiones concretos, plantillas, capas, posiciones, animaciones, tiempos, fuentes y única pista maestra listos para render. | Assets pendientes, búsquedas, prompts por ejecutar, credenciales o dependencia de URLs temporales del proveedor. |

Todos llevan versión de esquema y referencias/hash de sus entradas. El manifiesto persistido apunta a identidades de assets inmutables; la preparación de render resuelve esas identidades a archivos locales. Rutas locales y firmas temporales no alteran el hash semántico. El navegador recibe únicamente la proyección y los accesos temporales que necesite.

Los nombres de campos definitivos y las reglas de validación se entregan en [VID-02](../stories/VID-02.md); esta feature fija responsabilidades, no una migración prematura.

## Flujo de trabajo

```text
Script Draft versionado
    → Video Director
    → VideoPlan.json
    → revisión / aprobación del plan
    → orden explícita: crear Video Job y congelar versiones
        ├─ Asset Resolver → fondos / fotos / gráficos / recursos aprobados
        └─ narración completa → ElevenLabs → máster + alineación
                                              ↓
                                   Timeline Compiler + plan
                                              ↓
                                      VideoTimeline.json
                                              ↓
                                       resolver escenas
                         ┌────────────────────┴──────────────────┐
                   VO / STAT / TEXT / CTA                   NARRATOR
                   datos de plantillas              segmento de audio + personaje
                                                              ↓
                                                        Sync-3 → VEED
                                                              ↓
                                                        clip con alpha
                         └────────────────────┬──────────────────┘
        assets + timeline + máster + escenas resueltas + fuentes / versiones
                                              ↓
                                      ResolvedVideo.json
                                              ↓
                                 preparar paquete local de render
                                              ↓
                                          Remotion
                                              ↓
                                     Draft Render / Preview
                                              ↓
                                        QA / aprobación
                             cambios ↙                 ↘ aprobado
                  nueva revisión y solo                Final MP4 1080×1920
                  dependencias afectadas                         ↓
                                                          R2 + descarga
                                                                ↓
                                                   Meta / Reel: fase posterior
```

R2 conserva también originales, audio, alineaciones, manifiestos, clips y previews durante la preparación. No es únicamente el destino del MP4 final.

## Capas del montaje

De atrás hacia delante:

1. Fondo.
2. Texto y gráficos detrás del personaje.
3. Jo/Sofi con alpha, solo en escenas `NARRATOR`.
4. Texto y gráficos delante del personaje.
5. Captions derivados de la misma alineación del máster.

Una pista maestra de narración acompaña el montaje completo. Las escenas nativas son datos de plantillas predefinidas, no programas React creados por el director.

## Versionado, aprobaciones e invalidación

| Cambio | Qué se vuelve a preparar | Qué se conserva si sigue vigente |
|---|---|---|
| Narración, voz o parámetros TTS | Máster, alineación, timeline, captions y clips dependientes; resolved y render. | Recursos visuales sin cambios. |
| Imagen de Jo/Sofi | Sync-3 y alpha de escenas afectadas; resolved y render. | Audio y timeline si no cambió el texto/voz. |
| Fondo, gráfico o texto visual | Recurso/escena visual afectada, resolved y render; validar legibilidad. | Máster y clips del personaje compatibles. |
| Solo recorte de fondo defectuoso | VEED, resolved y renders dependientes. | MP4 Sync-3 y audio. |
| Fallo técnico de render | Render del mismo paquete. | Todos los recursos preparados y contratos resueltos. |
| Versión del renderer, plantilla o fuente | Nuevo render y revisión del resultado. | Recursos originales que no cambiaron. |
| Cambio del Script Draft fuente | Marcar derivación desactualizada y ofrecer nueva revisión explícita. | Historial anterior íntegro; no sustituirlo automáticamente. |

Recompilar la timeline puede mover escenas sin cambiar el audio de un segmento. Solo se reutiliza un clip si su contenido de audio, imagen, parámetros y compensaciones siguen siendo compatibles y verificables por sus dependencias; no se presupone por coincidir el scene ID.

La aprobación del plan habilita una orden de preparación, no la aprobación final. La revisión final identifica el hash de ResolvedVideo, sus assets y versión de renderer. El export utiliza exactamente ese contenido con un perfil de calidad definido. No se cambian silenciosamente tiempos, fuentes, capas o narración entre preview aprobado y final.

## Operación y estados

Estados de producto propuestos: borrador de plan, pendiente de aprobación, plan aprobado, preparación en curso, bloqueado/fallido, listo para render, renderizando, preview en revisión, cambios solicitados, aprobado, final disponible y cancelado. Su traducción a almacenamiento y estados de etapas pertenece a VID-02/05.

Las etapas registran inicio, fin, entradas, resultado, intentos, proveedor, request ID, errores saneados y coste/latencia disponibles. Los resultados inciertos no autorizan otra operación pagada a ciegas. Los trabajos y archivos sobreviven a cierre del navegador o reinicio; después de cancelar no se lanzan etapas nuevas, aunque un proveedor ya iniciado pueda devolver un resultado que debe conservarse.

Credenciales, DB, R2 y llamadas a proveedores permanecen en servidor. Los recursos enviados a proveedores usan el mecanismo de entrega autorizado correspondiente; no se abre el bucket ni se exponen referencias privadas al navegador. La configuración del renderer y su supervisión se validan en local y staging antes de producción.

## Tareas y orden sugerido

| Tarea | Entrega | Dependencias |
|---|---|---|
| [VID-01](../stories/VID-01.md) | Prueba Jo/Sofi: voz, lip-sync y alpha | Ninguna |
| [VID-02](../stories/VID-02.md) | Contratos e invalidación | Ninguna |
| [VID-03](../stories/VID-03.md) | Video Draft + Video Director | VID-02 |
| [VID-04](../stories/VID-04.md) | Edición y aprobación del plan | VID-03 |
| [VID-05](../stories/VID-05.md) | Jobs y orquestación recuperable | VID-02, VID-04 |
| [VID-06](../stories/VID-06.md) | Fondos y assets | VID-02, VID-05 |
| [VID-07](../stories/VID-07.md) | Única narración ElevenLabs | VID-02, VID-05 |
| [VID-08](../stories/VID-08.md) | Timeline Compiler | VID-02, VID-07 |
| [VID-09](../stories/VID-09.md) | Clips NARRATOR con Sync-3 | VID-01, VID-05, VID-08 |
| [VID-10](../stories/VID-10.md) | Alpha con VEED | VID-01, VID-09 |
| [VID-11](../stories/VID-11.md) | ResolvedVideo y paquete listo | VID-06, VID-08, VID-10 |
| [VID-12](../stories/VID-12.md) | Renderer Remotion | VID-11 |
| [VID-13](../stories/VID-13.md) | Preview y cambios selectivos | VID-04, VID-05, VID-12 |
| [VID-14](../stories/VID-14.md) | Aprobación, export y R2 | VID-13 |
| [VID-15](../stories/VID-15.md) | QA end-to-end | VID-14 |
| [VID-16](../stories/VID-16.md) | Publicación Reel, fase posterior | VID-14, VID-15 |

Empezar por VID-01 y VID-02: la prueba visual y los contratos pueden avanzar de forma independiente. Un harness mínimo de render en VID-01 es evidencia de viabilidad, no sustituye el renderer de producto de VID-12. Las plantillas y validaciones pueden desarrollarse con fixtures antes de que todos los proveedores estén integrados; las dependencias de la tabla indican los requisitos para cerrar cada entrega.

## Definición de terminado de fase 1

Un editor deriva un Video Draft de un script guardado, revisa su plan y ordena prepararlo. El sistema genera una narración completa, calcula la timeline, resuelve escenas y alpha donde corresponde y produce un preview. El editor puede corregir un fondo sin pagar de nuevo voz ni lip-sync, aprobar el montaje exacto y descargar su MP4 1080×1920. El trabajo conserva su trazabilidad y se recupera tras interrupciones. Remotion no ejecuta ninguna operación creativa externa. Las pruebas y requisitos de operación de VID-15 están verificados.

No requiere publicar en Meta. El trabajo de [PUB](instagram-publishing.md) sigue con su QA pausada; esta planificación no la reactiva ni implica commit, deploy o generación pagada.

## Referencias de contratos consultadas

Consultadas durante el diseño el 9 de septiembre de 2026; volver a verificar versión, límites, disponibilidad, precios y licencia al implementar cada integración:

- [ElevenLabs: TTS con alineación](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).
- [Sync-3: imagen y audio a video](https://fal.ai/models/fal-ai/sync-lipsync/v3/image-to-video/api).
- [VEED: eliminación de fondo y formatos de salida](https://fal.ai/models/veed/video-background-removal/api).
- [Remotion: renderer](https://www.remotion.dev/docs/renderer) y [videos con transparencia](https://www.remotion.dev/docs/transparent-videos).
