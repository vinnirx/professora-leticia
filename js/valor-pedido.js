export function totalConfirmado(ids, pedidos) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 12) return null;
  if (!Array.isArray(pedidos) || pedidos.length !== ids.length) return null;
  const vistos = new Map();
  for (const pedido of pedidos) {
    const id = typeof pedido?.atividade_id === "string" ? pedido.atividade_id : "";
    const valor = Number(pedido?.valor);
    if (!id || !ids.includes(id) || vistos.has(id) || !Number.isFinite(valor) || valor <= 0) return null;
    vistos.set(id, { valor, titulo: String(pedido?.titulo || "") });
  }
  if (vistos.size !== ids.length) return null;
  const total = Number(ids.reduce((soma, id) => soma + vistos.get(id).valor, 0).toFixed(2));
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    total,
    titulos: ids.map((id) => vistos.get(id).titulo).filter(Boolean),
  };
}
