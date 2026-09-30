/**
 * Correo de Microsoft 365 como espejo: webhooks de Microsoft Graph para
 * enterarse al momento, y un barrido periódico debajo por si se pierde alguno.
 *
 * - El correo real sigue en Microsoft 365. El portal guarda una copia
 *   sincronizada con consultas delta y todo lo que se hace en el portal se
 *   escribe en el buzón de verdad.
 * - Todas las peticiones piden identificadores inmutables
 *   (`Prefer: IdType="ImmutableId"`): sin eso, el id de un mensaje cambia al
 *   moverlo de carpeta y el espejo se rompe en silencio.
 * - La notificación no se cree: no trae el mensaje, solo dispara la sincronización.
 *
 * Reescrito de forma genérica a partir del proyecto real.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Al suscribirse a un buzón se genera un secreto propio, que se guarda cifrado. */
export async function suscribir(buzon: Buzon) {
  const clientState = randomBytes(24).toString('base64url');
  const sub = await graph.post('/subscriptions', {
    changeType: 'created,updated,deleted',
    notificationUrl: `${BASE_URL}/api/correo/webhook`,
    resource: `/users/${buzon.idGraph}/messages`,
    expirationDateTime: new Date(Date.now() + 70 * 3600_000).toISOString(), // caducan a las ~70 h
    clientState,
  });
  await guardarSuscripcion({ buzonId: buzon.id, idGraph: sub.id, clientStateCifrado: cifrar(clientState) });
}

function mismoSecreto(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * La URL es pública (la llama Microsoft, no un navegador): el clientState es lo
 * único que separa un aviso legítimo de cualquiera que conozca la dirección.
 */
app.post('/api/correo/webhook', async (req, reply) => {
  // Validación inicial de Graph: devolver el token tal cual
  const token = (req.query as { validationToken?: string }).validationToken;
  if (token) return reply.type('text/plain').send(token);

  let aceptados = 0;
  let descartados = 0;
  for (const aviso of (req.body as { value?: AvisoGraph[] }).value ?? []) {
    const sub = await buscarSuscripcion(aviso.subscriptionId);
    if (!sub || !aviso.clientState || !mismoSecreto(aviso.clientState, descifrar(sub.clientStateCifrado))) {
      descartados++;
      continue;
    }
    colaSincronizacion.pedir(sub.buzonId); // el delta sigue siendo la única fuente de verdad
    aceptados++;
  }
  req.log.info({ aceptados, descartados }, 'avisos de correo');

  // SIEMPRE 202: un error hace que Graph reintente el mismo lote hasta retirar la suscripción.
  return reply.code(202).send();
});

/* ---------------------------------------------------------------------------
 * La red debajo del trapecio: un webhook se puede perder (una caída, un
 * despliegue, una suscripción caducada) y nadie lo reintenta.
 */
setInterval(() => sincronizarTodosLosBuzones(), 3 * 60_000);   // barrido cada 3 minutos
setInterval(() => renovarSuscripciones({ margenHoras: 24 }), 30 * 60_000); // renovación con un día de margen
