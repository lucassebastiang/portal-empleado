/**
 * Asistente del portal con un modelo local: «dos cerebros».
 *
 * 1. Los datos de la persona (días de vacaciones, jornada, tareas, a quién
 *    pedir algo) los contesta el servidor SIN IA: una consulta y una frase de
 *    plantilla. El número exacto lo sabe el portal, no el modelo.
 * 2. Solo el «¿cómo se hace…?» pasa por el modelo, y aun así la búsqueda la
 *    hace el servidor: al modelo se le dan los fragmentos del manual ya
 *    encontrados y solo redacta.
 *
 * Los umbrales de similitud no son constantes: se miden contra el contenido
 * real con preguntas de dentro y de fuera del manual, y se recalibran al
 * cambiar el modelo de embeddings o el corpus.
 *
 * Reescrito de forma genérica a partir del proyecto real.
 */

const SIN_RESPUESTA = 'No lo encuentro en el manual. Pregúntale a tu responsable o a RRHH.';

export async function responder(pregunta: string, persona: Persona): Promise<Respuesta> {
  // Cerebro 1: intención reconocida → dato exacto, sin modelo
  const intencion = reconocerIntencion(pregunta); // p. ej. 'vacaciones_restantes'
  if (intencion) return { texto: await contestarConDatos(intencion, persona), conIa: false };

  // Cerebro 2: búsqueda semántica sobre el manual, filtrada por lo que la persona puede ver
  const resultados = await buscar(pregunta, persona, { umbral: UMBRAL_BUSQUEDA, cuantos: 3 });
  if (!resultados.length) return { texto: SIN_RESPUESTA, conIa: false };

  let texto = '';
  try {
    texto = await modeloLocal.chat({
      system: 'Responde SOLO con los fragmentos. Si no está, escribe NO_ESTA_EN_EL_MANUAL.',
      user: `Pregunta: ${pregunta}\n\nFragmentos:\n${formatear(resultados)}`,
      temperature: 0.1, // aquí se quiere fidelidad, no creatividad
      timeoutMs: 45_000, // si tarda más, parece un botón roto
    });
    texto = texto.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); // el razonamiento no se enseña
  } catch {
    // sin modelo, el asistente sigue siendo útil: se devuelve el fragmento literal
    return { texto: resultados[0].texto, fuentes: [resultados[0]], conIa: false };
  }

  if (!texto || texto.includes('NO_ESTA_EN_EL_MANUAL')) {
    // El fallo típico de un modelo pequeño es el falso negativo: dice que no está
    // teniéndolo delante. Si la búsqueda encontró algo CLARAMENTE bueno (por encima
    // de un segundo umbral, más alto y también medido), se enlaza el artículo.
    // Por debajo, la respuesta honrada es que no se encuentra.
    if (resultados[0].puntuacion >= UMBRAL_PISTA) {
      return { texto: 'No sé resumírtelo, pero esto es lo más parecido que hay escrito.', fuentes: [resultados[0]], conIa: true };
    }
    return { texto: SIN_RESPUESTA, conIa: true };
  }

  return { texto, fuentes: sinDuplicados(resultados).slice(0, 2), conIa: true };
}
