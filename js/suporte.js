export const ASSUNTOS_AJUDA = {
  pagamento: "Pagamento",
  download: "Download",
  acesso: "Acesso",
  material: "Material",
  reembolso: "Cancelamento e reembolso",
  outro: "Outro assunto",
};

export function rotuloAssunto(assunto) {
  return ASSUNTOS_AJUDA[assunto] || "Outro assunto";
}

export function rotuloSolicitacao(status) {
  if (status === "atendimento") return "Em atendimento";
  if (status === "resolvido") return "Resolvido";
  return "Aberto";
}

export function protocoloVisivel(item) {
  const oficial = String(item?.protocolo || "").trim();
  if (oficial) return oficial;
  const id = String(item?.id || "").replace(/-/g, "");
  return id ? `AJ-${id.slice(0, 8).toUpperCase()}` : "";
}

export function aguardaResposta(item) {
  const mensagens = item?.mensagens || [];
  if (!mensagens.length) return item?.status !== "resolvido";
  const ultima = mensagens[mensagens.length - 1];
  if (ultima?.autor_id && item?.usuario_id) return ultima.autor_id === item.usuario_id;
  return item?.status !== "resolvido";
}
