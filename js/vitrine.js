export function montarVitrine(locais, remotas, autoridade) {
  const base = Array.isArray(locais) ? locais : [];
  const vindas = Array.isArray(remotas) ? remotas : [];
  if (!autoridade) {
    if (!vindas.length) return base;
    const ids = new Set(vindas.map((item) => item.id));
    return [...vindas, ...base.filter((item) => item && !ids.has(item.id))];
  }
  return vindas.filter((item) => item && !item.arquivada_em);
}

export function podeVoltarALoja(atividade) {
  if (!atividade) return "Atividade não encontrada.";
  if (!String(atividade.arquivo || "").trim()) return "Esta atividade precisa de um PDF antes de voltar à loja.";
  if (!(Number(atividade.preco) > 0)) return "Esta atividade precisa de um preço maior que zero antes de voltar à loja.";
  return "";
}

export function semVenda(pedidos, atividadeId) {
  return !(pedidos || []).some((pedido) => pedido.atividade_id === atividadeId);
}

export function escolherNovidades(itens, limite = 4) {
  const quantidade = Number.isInteger(limite) && limite > 0 ? limite : 4;
  return [...(Array.isArray(itens) ? itens : [])]
    .filter((item) => item && !item.arquivada_em && !item.arquivadaEm)
    .sort((a, b) => {
      const dataA = Date.parse(a.publicadaEm || a.publicada_em || "");
      const dataB = Date.parse(b.publicadaEm || b.publicada_em || "");
      const temA = Number.isFinite(dataA);
      const temB = Number.isFinite(dataB);
      if (temA !== temB) return temA ? -1 : 1;
      if (temA && dataA !== dataB) return dataB - dataA;
      return String(a.id).localeCompare(String(b.id), "pt");
    })
    .slice(0, quantidade);
}
