/* Registro del service worker + indicador de conexion. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((e) => {
      console.warn('No se pudo registrar el service worker:', e);
    });
  });
}

function pintarEstadoConexion() {
  const barra = document.getElementById('estado-conexion');
  if (!barra) return;
  barra.hidden = navigator.onLine;
}
window.addEventListener('online', pintarEstadoConexion);
window.addEventListener('offline', pintarEstadoConexion);
document.addEventListener('DOMContentLoaded', pintarEstadoConexion);
