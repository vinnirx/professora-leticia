export function statusDoGrupo(itens) {
  if (!itens.length) return "aguardando";
  if (itens.every((item) => item.status === "pago")) return "pago";
  if (itens.some((item) => item.status === "estornado")) return "estornado";
  if (itens.every((item) => item.status === "cancelado")) return "cancelado";
  return "aguardando";
}

export function agruparPedidos(pedidos) {
  const mapa = new Map();
  pedidos.forEach((pedido) => {
    const chave = `${pedido.txid}::${pedido.usuario_id || pedido.perfis?.email || ""}`;
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        txid: pedido.txid,
        usuario_id: pedido.usuario_id || "",
        perfis: pedido.perfis || {},
        criado_em: pedido.criado_em,
        itens: [],
        valor: 0,
      };
      mapa.set(chave, grupo);
    }
    grupo.itens.push(pedido);
    grupo.valor += Number(pedido.valor) || 0;
    if (pedido.criado_em < grupo.criado_em) grupo.criado_em = pedido.criado_em;
  });
  return [...mapa.values()].map((grupo) => ({
    ...grupo,
    valor: Math.round(grupo.valor * 100) / 100,
    status: statusDoGrupo(grupo.itens),
  }));
}

export function resumirVendas(pedidos) {
  const grupos = agruparPedidos(pedidos);
  const pagos = grupos.filter((grupo) => grupo.status === "pago");
  const bruto = Math.round(pagos.reduce((soma, grupo) => soma + grupo.valor, 0) * 100) / 100;
  return {
    bruto,
    pedidosPagos: pagos.length,
    unidadesPagas: pedidos.filter((pedido) => pedido.status === "pago").length,
    aguardando: grupos.filter((grupo) => grupo.status === "aguardando").length,
    encerrados: grupos.filter((grupo) => grupo.status === "cancelado" || grupo.status === "estornado").length,
  };
}
