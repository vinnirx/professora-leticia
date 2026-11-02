(function () {
  if (window.top === window.self) return;
  document.documentElement.replaceChildren();
  try {
    window.top.location.replace(window.location.href);
  } catch {
    /* a página emoldurada fica vazia */
  }
})();
