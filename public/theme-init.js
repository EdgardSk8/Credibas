(function () {
  try {
    var stored = window.localStorage.getItem('credibas-theme-v2');
    var mode = stored === 'dark' ? 'dark' : 'gold';
    if (mode === 'gold') {
      document.documentElement.setAttribute('data-theme', 'gold');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', mode === 'gold' ? '#f2f6ef' : '#16211f');
  } catch (error) {
    /* Sin acceso a localStorage se usa el tema claro (oro) por defecto. */
  }
})();
