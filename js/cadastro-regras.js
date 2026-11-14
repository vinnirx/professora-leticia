export function validarNovaAtividade(dados) {
  const titulo = String(dados.titulo || "").trim();
  const resumo = String(dados.resumo || "").trim();
  const explicacao = String(dados.explicacao || "").trim();
  const preco = Number(dados.preco);
  const area = String(dados.area || "");
  const tema = String(dados.tema || "");
  const temas = dados.temasDaArea || [];
  if (titulo.length < 3) return "Diga qual é a atividade.";
  if (!dados.capa) return "Escolha a imagem da capa.";
  if (dados.capa && !/^image\/(jpeg|png|webp)$/.test(dados.tipoCapa || "")) return "A capa precisa ser JPG, PNG ou WebP.";
  if (!area) return "Escolha a área da loja.";
  if (temas.length && !temas.includes(tema)) return "Escolha o tema dessa área.";
  if (resumo.length < 10) return "Escreva uma descrição breve, com pelo menos 10 letras.";
  if (explicacao.length < 20) return "Escreva o texto da página, com pelo menos 20 letras.";
  if (!preco || preco <= 0) return "O valor precisa ser maior que zero.";
  if (!String(dados.quantidade || "").trim()) return "Diga a quantidade do material.";
  if (!String(dados.formato || "").trim()) return "Diga o formato do material.";
  return "";
}
