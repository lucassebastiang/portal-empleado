# Fragmentos

Fragmentos **reescritos de forma genérica** a partir del proyecto real, para ilustrar las piezas más interesantes. No son el código de producción y no compilan por separado: faltan imports internos, el esquema de la base de datos y la configuración. No contienen datos, dominios ni credenciales reales.

| Fichero | Qué enseña |
|---|---|
| [01-permisos-por-ambito.ts](01-permisos-por-ambito.ts) | Permisos centralizados por acción y ámbito (propio, equipo, todos), y cómo el ámbito decide el alcance de una consulta |
| [02-almacen-privado.ts](02-almacen-privado.ts) | Ficheros de personas fuera de la web pública: nombres opacos, comprobación de PDF, streaming tras permisos, acuse y auditoría |
| [03-auditoria-solo-escritura.sql](03-auditoria-solo-escritura.sql) | Auditoría de solo escritura garantizada con un trigger, y una limpieza que solo puede ser deliberada |
| [04-webhook-correo.ts](04-webhook-correo.ts) | Espejo del correo de Microsoft 365: webhooks de Graph autenticados con `clientState` y un barrido periódico debajo |
| [05-asistente-dos-cerebros.ts](05-asistente-dos-cerebros.ts) | Asistente con un modelo local: los datos se contestan sin IA y el manual con búsqueda semántica y umbrales medidos |
