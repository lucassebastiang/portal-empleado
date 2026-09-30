/**
 * Almacén privado de ficheros de personas (nóminas, expediente, adjuntos).
 *
 * - Vive en un volumen montado SOLO en la API, nunca en la carpeta pública de la web.
 * - En disco, cada fichero tiene un nombre opaco (UUID): no se puede adivinar
 *   ni deducir del contenido.
 * - Nada se sirve como estático: siempre en streaming, desde un handler que
 *   ya ha comprobado permisos. Una URL adivinada no devuelve la nómina de nadie.
 *
 * Reescrito de forma genérica a partir del proyecto real.
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';

const ALMACEN = process.env.ALMACEN_DIR ?? '/almacen';
const FIRMA_PDF = Buffer.from('%PDF');

/** Un PDF de verdad empieza por %PDF: el tipo que declara el navegador no basta. */
export function esPdf(contenido: Buffer): boolean {
  return contenido.subarray(0, 4).equals(FIRMA_PDF);
}

/** Guarda con nombre opaco y devuelve la ruta relativa, que es lo único que va a la base de datos. */
export async function guardarFichero(carpeta: string, contenido: Buffer, extension: string): Promise<string> {
  await mkdir(join(ALMACEN, carpeta), { recursive: true });
  const ruta = `${carpeta}/${randomUUID()}${extension}`;
  await writeFile(join(ALMACEN, ruta), contenido);
  return ruta;
}

/** Flujo de lectura con cinturón contra path traversal. */
export function flujoFichero(ruta: string) {
  const completa = normalize(join(ALMACEN, ruta));
  if (!completa.startsWith(normalize(ALMACEN))) throw new Error('Ruta fuera del almacén');
  return createReadStream(completa);
}

/* ---------------------------------------------------------------------------
 * Ver o descargar una nómina: permisos, acuse, auditoría y streaming.
 */
app.get('/api/nominas/:id/fichero', async (req, reply) => {
  const actor = exigirSesion(req);
  const { modo } = leerModo(req.query); // 'ver' | 'descargar'
  const n = await buscarNomina(req.params.id);
  if (!n) throw new ErrorHttp(404, 'No existe');

  const esTitular = actor.empleadoId !== null && actor.empleadoId === n.empleadoId;
  const gestiona = ambito(actor, 'nominas.gestionar') === 'todos';
  // El titular solo ve lo publicado; RRHH, también borradores y archivo.
  if (!(gestiona || (esTitular && n.estado === 'publicada'))) {
    throw new ErrorHttp(404, 'No existe'); // ni se confirma que exista
  }

  if (esTitular) {
    // Acuse automático: solo la primera vez (índice único) y solo del titular.
    await registrarAcuse(n.id, modo === 'descargar' ? 'descarga' : 'visto');
  } else {
    // Que alguien de RRHH abra la nómina de otra persona queda auditado.
    await auditar(req, 'nominas.fichero_consultado', { entidad: 'nomina', entidadId: n.id, detalles: { modo } });
  }

  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `${modo === 'descargar' ? 'attachment' : 'inline'}; filename="${nombreLimpio(n)}"`)
    .header('Cache-Control', 'private, no-store')
    .send(flujoFichero(n.ficheroRuta));
});
