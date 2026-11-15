function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function confirmacaoComum(grupo) {
  const valores = [...new Set((grupo.itens || []).map((item) => item.confirmacao || ""))];
  if (valores.length === 1 && valores[0]) return valores[0];
  return null;
}

export function origemFinanceira(grupo, cobranca, cobrancasDisponiveis) {
  const confirmacao = confirmacaoComum(grupo);
  if (!cobrancasDisponiveis) {
    return {
      conhecido: false,
      origem: "desconhecida",
      taxa: null,
      liquido: null,
      asaas: "Não disponível",
      motivo: "A consulta das cobranças não retornou. Nenhuma taxa é presumida.",
    };
  }
  const taxa = cobranca?.taxa;
  const liquido = cobranca?.valor_liquido;
  if (cobranca && taxa != null && liquido != null && Number.isFinite(Number(taxa)) && Number.isFinite(Number(liquido))) {
    return {
      conhecido: true,
      origem: "asaas",
      taxa: arredondar(taxa),
      liquido: arredondar(liquido),
      asaas: cobranca.cobranca_externa || "Asaas",
      motivo: "Tarifa e líquido gravados pela cobrança Asaas.",
    };
  }
  if (cobranca || confirmacao === "asaas") {
    return {
      conhecido: false,
      origem: "asaas",
      taxa: null,
      liquido: null,
      asaas: cobranca?.cobranca_externa || "Asaas",
      motivo: "A cobrança Asaas ainda não tem tarifa e valor líquido gravados.",
    };
  }
  if (confirmacao === "admin" || confirmacao === "legado_conferido") {
    return {
      conhecido: true,
      origem: "manual",
      taxa: 0,
      liquido: arredondar(grupo.valor),
      asaas: "Pix manual",
      motivo: "Pagamento confirmado sem o gateway Asaas. A taxa desse gateway é zero.",
    };
  }
  return {
    conhecido: false,
    origem: "desconhecida",
    taxa: null,
    liquido: null,
    asaas: "Não disponível",
    motivo: "Não há confirmação de que esta venda dispensou o Asaas.",
  };
}

export function fecharCaixa(gruposPagos, cobrancas, cobrancasDisponiveis) {
  const lista = cobrancasDisponiveis ? cobrancas || [] : [];
  const linhas = (gruposPagos || []).map((grupo) => {
    const encontradas = lista.filter((item) => item.txid === grupo.txid);
    const cobranca = encontradas.find((item) => item.taxa != null && item.valor_liquido != null) || encontradas[0] || null;
    return { grupo, ...origemFinanceira(grupo, cobranca, cobrancasDisponiveis) };
  });
  const conhecidas = linhas.every((linha) => linha.conhecido);
  const conhecido = linhas.length === 0 || conhecidas;
  let motivo = "Não há venda paga neste intervalo.";
  if (linhas.length && conhecidas && linhas.every((linha) => linha.origem === "manual")) {
    motivo = "As vendas pagas deste intervalo são Pix manual. A taxa Asaas é zero e o líquido acompanha o bruto.";
  } else if (linhas.length && conhecidas) {
    motivo = "Soma do líquido conhecido. Pix manual entra com taxa Asaas zero. Cobrança Asaas usa a tarifa e o líquido gravados.";
  } else if (linhas.length) {
    motivo = "Há venda paga com custo ainda desconhecido. O líquido não é estimado.";
  }
  return {
    linhas,
    conhecido,
    taxa: conhecido ? arredondar(linhas.reduce((soma, linha) => soma + linha.taxa, 0)) : null,
    liquido: conhecido ? arredondar(linhas.reduce((soma, linha) => soma + linha.liquido, 0)) : null,
    motivo,
  };
}

export function linhaExportada(linha, formatar) {
  return [
    linha.conhecido ? formatar(linha.taxa) : "Não disponível",
    linha.conhecido ? formatar(linha.liquido) : "Não disponível",
  ];
}
