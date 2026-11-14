export function caminhoPdf(atividadeId, arquivo) {
  const atividade = String(atividadeId || "");
  const nome = String(arquivo || "");
  if (!/^[a-z0-9-]{1,48}$/.test(atividade)) return "";
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(nome)) return "";
  return `${atividade}/${nome}`;
}
