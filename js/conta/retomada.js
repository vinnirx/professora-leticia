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
