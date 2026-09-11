# Topic Overview — FEAT-OVW-001

Estado: OVW-01 a 07 y OVW-10 implementadas y en revisión/QA, con pendientes explícitos anotados en cada ficha (principalmente evidencia visual en navegador real y el contrato de navegación genérico de OVW-06). OVW-08 y OVW-09 (fase 2/3, informe con IA y resultados/agenda) siguen sin empezar. Alineada el 10 de septiembre de 2026 con las dos referencias visuales del usuario: candidatos con miniaturas, hero editorial, sidebar oscuro, publicación, salud de fuentes y acciones rápidas. La paleta hereda la tematización dinámica existente de cada topic. [Feature y componentes](topic-overview.md).

**Criterio de cierre de todas las historias:** UXDSL obligatorio, con paleta dinámica, espaciados/densities, breakpoints y primitivas existentes; validar compilación y comportamiento responsive.

## Por hacer

### OVW-08 — Generar y conservar el informe editorial fundamentado

  - priority: medium
  - tags: [overview, p1]
  - ficha: [OVW-08](../stories/OVW-08.md)

### OVW-09 — Integrar resultados y agenda según capacidades disponibles

  - priority: medium
  - tags: [overview, p1]
  - ficha: [OVW-09](../stories/OVW-09.md)

## En progreso

## En revisión / QA

### OVW-01 — Definir agregados y contrato de datos del topic

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-01](../stories/OVW-01.md)
  - nota: DTO, repositorio y ruta autenticada implementados; contadores verificados con fixtures reales en PostgreSQL en memoria. Pendiente: presupuesto de consultas/latencia contra un topic grande.

### OVW-02 — Construir cabecera, estructura responsive y estados comunes

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-02](../stories/OVW-02.md)
  - nota: cabecera, periodo, tarjetas de métrica y estados comunes implementados. Pendiente: hero ilustrado con visual opcional por topic; QA visual en navegador.

### OVW-03 — Priorizar pendientes y accesos para resolverlos

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-03](../stories/OVW-03.md)
  - nota: cola de atención con severidad, total real y accesos al draft exacto implementada y cubierta por test de integración.

### OVW-04 — Mostrar producción y continuar piezas en contexto

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-04](../stories/OVW-04.md)
  - nota: pipeline de producción y "Continuar" con siguiente paso real (aprobar → generar → revisar imagen → congelar → publicar), correlacionado por versión del draft. Pendiente: los indicadores del header no aplican filtro/periodo exacto.

### OVW-05 — Resumir publicaciones y capacidades operativas

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-05](../stories/OVW-05.md)
  - nota: estados de entrega, salud de fuentes y capacidades reales implementados. Pendiente: QA visual del anillo/tarjeta contra la referencia A.

### OVW-06 — Añadir actividad reciente y navegación compartida

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-06](../stories/OVW-06.md)
  - nota: actividad reciente, sidebar reagrupado y drawer con retorno de foco implementados. Pendiente: contrato de navegación genérico con URL compartible, "Ver más" en actividad, y refresco automático del Overview tras acciones en el workspace.

### OVW-07 — Integrar el Overview operativo y resumen sin IA

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-07](../stories/OVW-07.md)
  - nota: composición final (candidatos 2/3, columna operativa 1/3, quick actions, resumen calculado no-IA) ensamblada. Pendiente: captura/revisión visual de escritorio y móvil.

### OVW-10 — Validar Overview de extremo a extremo y accesibilidad

  - priority: high
  - tags: [overview, review, p0]
  - ficha: [OVW-10](../stories/OVW-10.md)
  - nota: fixtures de aislamiento/contadores y auditoría de accesibilidad/llamadas externas por código completos. Pendiente: QA visual real en navegador (capturas, zoom 200%, dos paletas alternadas) y presupuesto de latencia.

## Hecho
