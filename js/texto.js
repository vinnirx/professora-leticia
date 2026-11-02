const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function dinheiro(valor) {
  return moeda.format(valor);
}

export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[caractere]);
}

export function linhas(texto) {
  return String(texto || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}
