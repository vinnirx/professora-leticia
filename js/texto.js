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

export function linkAjuda({ txid = "", email = "", motivo = "" } = {}) {
  const chave = String(window.loja?.pixChave || "");
  const destino = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave) ? chave : "leticiapimenteldemacedo@gmail.com";
  const assunto = txid ? `Problema no pagamento do pedido ${txid}` : "Problema para pagar na loja";
  const corpo = [
    "Olá, Letícia.",
    "Tive um problema no pagamento.",
    txid ? `Código do pedido: ${txid}.` : "",
    email ? `Meu e-mail: ${email}.` : "",
    motivo,
  ].filter(Boolean).join("\n");
  return `mailto:${destino}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
