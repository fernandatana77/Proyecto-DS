'use strict';

const { enTransaccion } = require('../config/database');
const { ESTADOS_EQUIPO, ACCIONES_AUDITORIA } = require('../config/constantes');
const { errores } = require('../utils/errores');
const { normalizarEntradaComponentes, tieneDano } = require('../utils/estadoEquipo');

const equipoModel = require('../models/equipoModel');
const componenteEquipoModel = require('../models/componenteEquipoModel');
const mantenimientoModel = require('../models/mantenimientoModel');
const incidenciaModel = require('../models/incidenciaModel');

const AuditoriaService = require('./AuditoriaService');
const NotificacionService = require('./NotificacionService');

/**
 * Reglas de negocio del ciclo de vida del equipo. Por ahora: cerrar una
 * reparacion (el equipo pasa de 'En Reparación' a 'Disponible' o 'De Baja').
 * Solo lo hace TIC (Admin / Tecnico); el Empleado nunca decide el estado.
 */

/**
 * @param {object} params
 * @param {number} params.equipoId
 * @param {'Disponible'|'De Baja'} params.resultado
 * @param {string} params.observaciones            que se hizo en la reparacion
 * @param {object} [params.componentes]            `{ <componente>: 'bueno'|'regular'|'malo' }` para ajustar el estado fisico
 * @param {boolean} [params.cerrarIncidencias=true]
 * @param {{ tipo: string, id?: number }} params.actor  staff
 */
function finalizarReparacion({ equipoId, resultado, observaciones, componentes, cerrarIncidencias = true, actor, ip }) {
  const equipo = equipoModel.buscarPorId(equipoId);
  if (!equipo) throw errores.noEncontrado('El equipo indicado no existe.', 'EQUIPO_NO_ENCONTRADO');
  if (equipo.estado !== ESTADOS_EQUIPO.EN_REPARACION) {
    throw errores.conflicto(
      `El equipo ${equipo.codigo_interno} no esta en reparacion (estado actual: "${equipo.estado}").`,
      'EQUIPO_NO_EN_REPARACION'
    );
  }
  if (resultado !== ESTADOS_EQUIPO.DISPONIBLE && resultado !== ESTADOS_EQUIPO.DE_BAJA) {
    throw errores.solicitudInvalida(
      `El resultado debe ser "${ESTADOS_EQUIPO.DISPONIBLE}" o "${ESTADOS_EQUIPO.DE_BAJA}".`,
      'RESULTADO_INVALIDO'
    );
  }

  const detalle = String(observaciones ?? '').trim();
  if (detalle.length < 5) {
    throw errores.solicitudInvalida(
      'Describe brevemente que se hizo en la reparacion (minimo 5 caracteres).',
      'OBSERVACIONES_REQUERIDAS'
    );
  }

  // Ajuste del estado fisico (opcional). Si no viene, se deja el actual.
  const componentesFinales = componentes ? normalizarEntradaComponentes(equipo.categoria, componentes) : null;

  // Coherencia: un equipo que vuelve a 'Disponible' no puede quedar con componentes en 'malo'.
  if (resultado === ESTADOS_EQUIPO.DISPONIBLE) {
    const aRevisar = componentesFinales || componenteEquipoModel.listarPorEquipo(equipoId);
    if (tieneDano(aRevisar)) {
      throw errores.conflicto(
        'Aun hay componentes en "malo". Corrigelos en el checklist o marca el equipo como "De Baja".',
        'COMPONENTES_CON_DANO'
      );
    }
  }

  const realizadoPor = actor.tipo + (actor.id ? ` #${actor.id}` : '');

  const salida = enTransaccion(() => {
    if (componentesFinales) {
      for (const c of componentesFinales) {
        componenteEquipoModel.actualizarEstado({
          equipoId,
          nombre: c.nombre,
          estado: c.estado,
          observacion: c.observacion || null,
          actualizadoPorId: actor.id || null,
        });
      }
    }

    const mantenimiento = mantenimientoModel.crearFinalizado({
      equipoId,
      tipo: 'Correctivo',
      descripcion: detalle,
      realizadoPor,
    });

    const incidenciasCerradas = cerrarIncidencias
      ? incidenciaModel.cerrarAbiertasDeEquipo(equipoId, { atendidaPorId: actor.id || null })
      : 0;

    const equipoActualizado = equipoModel.actualizarEstado(equipoId, resultado);

    AuditoriaService.registrar({
      actorTipo: actor.tipo,
      actorId: actor.id || null,
      accion:
        resultado === ESTADOS_EQUIPO.DE_BAJA
          ? ACCIONES_AUDITORIA.EQUIPO_DADO_DE_BAJA
          : ACCIONES_AUDITORIA.REPARACION_FINALIZADA,
      entidad: 'equipo',
      entidadId: equipoId,
      detalle: { resultado, mantenimientoId: mantenimiento.id, incidenciasCerradas },
      ip,
    });

    return { equipo: equipoActualizado, mantenimiento, incidenciasCerradas };
  });

  NotificacionService.notificar(
    resultado === ESTADOS_EQUIPO.DE_BAJA ? 'EQUIPO_DE_BAJA' : 'EQUIPO_REPARADO',
    'inventario-tic',
    { equipo: equipo.codigo_interno, por: realizadoPor }
  );
  return salida;
}

module.exports = { finalizarReparacion };
