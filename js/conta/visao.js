import { agruparPedidos, resumirVendas } from "./grupos-pedido.js";

export function pedidosRecentes(pedidos, limite = 5) {
  const ordem = [...agruparPedidos(pedidos)].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const relevantes = ordem.filter((grupo) => grupo.status === "pago" || grupo.status === "aguardando");
  return (relevantes.length ? relevantes : ordem).slice(0, limite);
}

export function chamadosPendentes(itens) {
  if (!Array.isArray(itens)) return null;
  return itens.filter((item) => item.status === "aberto" || item.status === "atendimento").length;
}

export function indicadoresDaVisao(pedidos) {
  const resumo = resumirVendas(pedidos);
  return {
    pagos: resumo.pedidosPagos,
    bruto: resumo.bruto,
    aguardando: resumo.aguardando,
  };
}
