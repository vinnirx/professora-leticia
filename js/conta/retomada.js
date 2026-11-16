const CONSULTA = new Set(["continuar", "recuperar", "confirmar"]);

export function apresentacao(acao) {
  const mapa = {
    continuar: { botao: "Continuar pagamento", tipo: "espera", titulo: "Aguardando pagamento" },
    tentar: { botao: "Tentar gerar Pix novamente", tipo: "problema", titulo: "Pix não gerado" },
    recuperar: { botao: "Continuar pagamento", tipo: "espera", titulo: "Aguardando pagamento" },
    baixar: { botao: "Baixar atividade", tipo: "ok", titulo: "Pagamento confirmado" },
    confirmar: { botao: "", tipo: "espera", titulo: "Pagamento confirmado" },
    vencido: { botao: "Gerar novo Pix", tipo: "problema", titulo: "Pix vencido" },
    analise: { botao: "", tipo: "problema", titulo: "Pagamento em análise" },
    estornado: { botao: "", tipo: "problema", titulo: "Pagamento estornado" },
    cancelado: { botao: "", tipo: "problema", titulo: "Cobrança cancelada" },
    tentativa: { botao: "", tipo: "problema", titulo: "Pedido cancelado" },
    abaixo: { botao: "", tipo: "problema", titulo: "Pix não gerado" },
    aguardar: { botao: "", tipo: "espera", titulo: "Pagamento em conferência" },
    manual: { botao: "", tipo: "espera", titulo: "Pix manual" },
    negar: { botao: "", tipo: "problema", titulo: "Pedido indisponível" },
  };
  return mapa[acao] || mapa.manual;
}

export function deveConsultar(acao, oculto = false) {
  return !oculto && CONSULTA.has(acao);
}

export function intervaloDaTela(acao, oculto = false) {
  return deveConsultar(acao, oculto) ? 15000 : 0;
}

export function podeCancelar(acao) {
  return acao === "abaixo" || acao === "tentar";
}

export function podeOcultar(acao) {
  return ["abaixo", "tentar", "tentativa", "cancelado", "estornado", "negar", "vencido"].includes(acao);
}

export function prioridadeDaAcao(acao) {
  if (acao === "baixar" || acao === "confirmar") return 0;
  if (acao === "continuar" || acao === "recuperar") return 1;
  if (acao === "manual" || acao === "aguardar" || acao === "analise") return 2;
  return 3;
}

export function agruparPorCodigo(pedidos) {
  const mapa = new Map();
  for (const pedido of pedidos || []) {
    const codigo = String(pedido?.txid || "");
    if (!codigo) continue;
    let grupo = mapa.get(codigo);
    if (!grupo) {
      grupo = {
        ...pedido,
        txid: codigo,
        atividades: [],
        titulos: [],
        valor: 0,
        oculto: false,
      };
      mapa.set(codigo, grupo);
    }
    if (pedido.atividade_id) grupo.atividades.push(pedido.atividade_id);
    if (pedido.titulo) grupo.titulos.push(pedido.titulo);
    grupo.valor += Number(pedido.valor) || 0;
    if (pedido.status === "pago") grupo.status = "pago";
    if (pedido.oculto_em) grupo.oculto = true;
    if (String(pedido.criado_em || "") < String(grupo.criado_em || "")) grupo.criado_em = pedido.criado_em;
  }
  return [...mapa.values()].map((grupo) => ({
    ...grupo,
    valor: Math.round(grupo.valor * 100) / 100,
    titulo: grupo.titulos.length > 1 ? grupo.titulos.join(" · ") : grupo.titulo,
  })).sort((a, b) => {
    const peso = (item) => (item.status === "pago" ? 0 : item.status === "aguardando" ? 1 : 2);
    return peso(a) - peso(b) || String(b.criado_em || "").localeCompare(String(a.criado_em || ""));
  });
}
