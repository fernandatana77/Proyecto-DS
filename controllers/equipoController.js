'use strict';

const { validarIdEntero } = require('../utils/validacion');
const EquipoService = require('../services/EquipoService');

async function finalizarReparacion(req, res, next) {
  try {
    const equipoId = validarIdEntero(req.params.id, 'id');
    const { resultado, observaciones, componentes, cerrarIncidencias } = req.body || {};

    const r = await EquipoService.finalizarReparacion({
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
          ? `Reparación finalizada. ${r.equipo.codigo_interno} vuelve a estar disponible en el catálogo.`
          : `${r.equipo.codigo_interno} se marcó como "De Baja".`,
      equipo: { id: r.equipo.id, codigoInterno: r.equipo.codigo_interno, estado: r.equipo.estado },
      incidenciasCerradas: r.incidenciasCerradas,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { finalizarReparacion };