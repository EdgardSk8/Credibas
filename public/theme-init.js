(function () {
  try {
    var stored = window.localStorage.getItem('credibas-theme');
    if (stored === 'gold') {
      document.documentElement.setAttribute('data-theme', 'gold');
    }
  } catch (error) {
    /* Sin acceso a localStorage: se usa el tema oscuro por defecto. */
  }
})();
