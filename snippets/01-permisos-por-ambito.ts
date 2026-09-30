/**
 * Permisos centralizados por acción y ámbito.
 *
 * Cada módulo declara sus acciones y, para cada rol, hasta dónde alcanza:
 * solo a uno mismo, a su equipo, a todos o a nadie. Los handlers preguntan
 * SIEMPRE aquí: ningún módulo reimplementa la autorización.
 *
 * Reescrito de forma genérica a partir del proyecto real.
 */

export type Rol = 'empleado' | 'responsable' | 'rrhh' | 'direccion' | 'admin';
export type Ambito = 'propio' | 'equipo' | 'todos' | 'no';

type Politica = Record<string, Partial<Record<Rol, Ambito>>>;

const politica: Politica = {};

/** Cada módulo registra sus acciones al cargarse. Una acción duplicada es un error de arranque. */
export function registrarAcciones(modulo: string, acciones: Politica): void {
  for (const [accion, ambitos] of Object.entries(acciones)) {
    const clave = `${modulo}.${accion}`;
    if (politica[clave]) throw new Error(`Acción duplicada: ${clave}`);
    politica[clave] = ambitos;
  }
}

const ORDEN: Ambito[] = ['no', 'propio', 'equipo', 'todos'];

/** El ámbito más amplio que dan los roles de una persona para una acción. */
export function ambitoDe(roles: Rol[], accion: string): Ambito {
  const reglas = politica[accion];
  // Una acción sin registrar es un error de programación, no un permiso por defecto.
  if (!reglas) throw new Error(`Acción no registrada: ${accion}`);
  return roles
    .map((r) => reglas[r] ?? 'no')
    .reduce((a, b) => (ORDEN.indexOf(b) > ORDEN.indexOf(a) ? b : a), 'no' as Ambito);
}

export function puede(roles: Rol[], accion: string): boolean {
  return ambitoDe(roles, accion) !== 'no';
}

/* ---------------------------------------------------------------------------
 * Ejemplos de declaración. Los datos más sensibles tienen su propia acción,
 * separada de «ver la ficha».
 */
registrarAcciones('empleados', {
  ver: { empleado: 'propio', responsable: 'equipo', rrhh: 'todos', direccion: 'todos', admin: 'todos' },
  ver_bancario: { rrhh: 'todos', direccion: 'todos', admin: 'todos' }, // ni el propio empleado
  editar: { rrhh: 'todos', admin: 'todos' },
});

registrarAcciones('nominas', {
  ver: { empleado: 'propio', rrhh: 'todos', admin: 'todos' }, // cada persona, solo las suyas
  gestionar: { rrhh: 'todos', admin: 'todos' },
});

registrarAcciones('aprobaciones', {
  // vacaciones, ausencias y correcciones de fichaje
  resolver: { responsable: 'equipo', rrhh: 'todos', direccion: 'todos', admin: 'todos' },
});

/* ---------------------------------------------------------------------------
 * En un handler: se exige el permiso y el ámbito decide el alcance de la consulta.
 */
export async function listarAusencias(req: Peticion) {
  const actor = exigir(req, 'aprobaciones.resolver'); // 401 sin sesión, 403 sin permiso
  switch (ambito(actor, 'aprobaciones.resolver')) {
    case 'todos':
      return consultarAusencias({});
    case 'equipo':
      // «equipo» lo traduce UN solo sitio: quién depende de quién
      return consultarAusencias({ empleadoIds: await miembrosDelEquipo(actor), excluir: actor.empleadoId });
    default:
      return consultarAusencias({ empleadoIds: [actor.empleadoId] });
  }
}
