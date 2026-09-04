'use strict';

const { validarIdEntero } = require('../utils/validacion');
const EquipoService = require('../services/EquipoService');

/**
 * POST /api/equipos/:id/reparacion/finalizar   (auth: staff Admin/Tecnico)
 * TIC cierra la reparacion de un equipo que estaba "En Reparación".
 * Body: {
 *   resultado: 'Disponible' | 'De Baja',
 *   observaciones: string,               // que se hizo
 *   componentes?: { <componente>: 'bueno'|'regular'|'malo' },  // ajuste opcional del estado fisico
 *   cerrarIncidencias?: boolean           // default true
 * }
 */
async function finalizarReparacion(req, res, next) {
  try {
    const equipoId = validarIdEntero(req.params.id, 'id');
    const { resultado, observaciones, componentes, cerrarIncidencias } = req.body || {};

    const r = EquipoService.finalizarReparacion({
      equipoId,
      resultado,
      observaciones,
      componentes,
      cerrarIncidencias: cerrarIncidencias !== false,
      actor: req.actor,
      ip: req.ip,
    });

    res.status(200).json({
      mensaje:
        r.equipo.estado === 'Disponible'
          ? `Reparacion finalizada. ${r.equipo.codigo_interno} vuelve a estar disponible en el catalogo.`
          : `${r.equipo.codigo_interno} se marco como "De Baja".`,
      equipo: { id: r.equipo.id, codigoInterno: r.equipo.codigo_interno, estado: r.equipo.estado },
      incidenciasCerradas: r.incidenciasCerradas,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { finalizarReparacion };
