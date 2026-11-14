const ROTULOS = {
  titulo: "título",
  resumo: "descrição breve",
  explicacao: "texto da página",
  preco: "preço",
  area: "área",
  tema: "tema",
  inclui: "o que inclui",
  habilidades: "habilidades",
};

const INFORMACOES = [
  ["info_area", "Área do conhecimento"],
  ["info_categoria", "Categoria"],
  ["info_subcategoria", "Subcategoria"],
  ["info_operacao", "Operação"],
  ["info_campo", "Campo numérico"],
  ["info_quantidade", "Quantidade"],
  ["info_recursos", "Recursos"],
  ["info_formato", "Formato"],
];

export function rotulosInformacao() {
  return INFORMACOES.map(([campo, rotulo]) => ({ campo, rotulo }));
}

function texto(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean).join("\n");
  return String(valor || "");
}

function mapaInformacoes(lista) {
  const mapa = new Map();
  if (!Array.isArray(lista)) return mapa;
  lista.forEach((par) => {
    if (Array.isArray(par) && par[0]) mapa.set(String(par[0]), String(par[1] || "").trim());
  });
  return mapa;
}

function centavos(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 100);
}

function definirCampo(campos, origem, chave, doBanco, doCatalogo) {
  const banco = String(doBanco ?? "").trim();
  const apoio = String(doCatalogo ?? "").trim();
  if (banco) {
    campos[chave] = banco;
    origem[chave] = "banco";
    return;
  }
  campos[chave] = apoio;
  origem[chave] = apoio ? "catalogo" : "vazio";
}

export function fichaInicial(banco, catalogo) {
  const base = banco || {};
  const apoio = catalogo || {};
  const campos = {};
  const origem = {};
  definirCampo(campos, origem, "titulo", base.titulo, apoio.titulo);
  definirCampo(campos, origem, "resumo", base.resumo, apoio.resumo);
  definirCampo(campos, origem, "explicacao", texto(base.explicacao), texto(apoio.explicacao));
  definirCampo(campos, origem, "habilidades", texto(base.habilidades), texto(apoio.habilidades));
  definirCampo(campos, origem, "inclui", texto(base.inclui), texto(apoio.inclui));
  definirCampo(campos, origem, "area", base.area, apoio.area);
  definirCampo(campos, origem, "tema", base.tema, (apoio.temas || [])[0] || apoio.tema || "");
  const precoBanco = Number(base.preco);
  const precoCatalogo = Number(apoio.preco);
  if (precoBanco > 0) {
    campos.preco = String(precoBanco);
    origem.preco = "banco";
  } else if (precoCatalogo > 0) {
    campos.preco = String(precoCatalogo);
    origem.preco = "catalogo";
  } else {
    campos.preco = "";
    origem.preco = "vazio";
  }
  const infoBanco = mapaInformacoes(base.informacoes);
  const infoCatalogo = mapaInformacoes(apoio.informacoes);
  campos.informacoes = {};
  origem.informacoes = {};
  INFORMACOES.forEach(([, rotulo]) => {
    const gravado = infoBanco.get(rotulo) || "";
    const complemento = infoCatalogo.get(rotulo) || "";
    campos.informacoes[rotulo] = gravado || complemento;
    origem.informacoes[rotulo] = gravado ? "banco" : (complemento ? "catalogo" : "vazio");
  });
  return {
    id: base.id || apoio.id || "",
    uso: String(base.uso || ""),
    destaque: base.destaque === true,
    capa: String(base.capa || apoio.capa || ""),
    capaDoBanco: Boolean(String(base.capa || "").trim()),
    arquivo: String(base.arquivo || apoio.download || ""),
    arquivoDoBanco: Boolean(String(base.arquivo || "").trim()),
    campos,
    origem,
    banco: {
      titulo: String(base.titulo || "").trim(),
      resumo: String(base.resumo || "").trim(),
      explicacao: texto(base.explicacao).trim(),
      habilidades: texto(base.habilidades).trim(),
      inclui: texto(base.inclui).trim(),
      area: String(base.area || "").trim(),
      tema: String(base.tema || "").trim(),
      preco: precoBanco > 0 ? precoBanco : 0,
      destaque: base.destaque === true,
      informacoes: JSON.stringify(base.informacoes || []),
    },
  };
}

export function camposDoCatalogo(ficha) {
  const nomes = [];
  Object.entries(ficha?.origem || {}).forEach(([chave, valor]) => {
    if (chave === "informacoes") return;
    if (valor === "catalogo" && ROTULOS[chave]) nomes.push(ROTULOS[chave]);
  });
  Object.entries(ficha?.origem?.informacoes || {}).forEach(([rotulo, valor]) => {
    if (valor === "catalogo") nomes.push(rotulo.toLowerCase());
  });
  return nomes;
}

function escolher(ficha, chave, atual) {
  const mostrado = String(ficha.campos[chave] ?? "").trim();
  const digitado = String(atual ?? "").trim();
  if (ficha.origem[chave] === "catalogo" && digitado === mostrado) return "";
  return digitado;
}

function informacoesParaGravar(ficha, atuais) {
  const lista = [];
  const conhecidos = new Set(INFORMACOES.map(([, rotulo]) => rotulo));
  const gravadas = mapaInformacoes(JSON.parse(ficha.banco.informacoes || "[]"));
  gravadas.forEach((valor, rotulo) => {
    if (!conhecidos.has(rotulo) && valor) lista.push([rotulo, valor]);
  });
  INFORMACOES.forEach(([, rotulo]) => {
    const digitado = String(atuais?.[rotulo] || "").trim();
    const mostrado = String(ficha.campos.informacoes[rotulo] || "").trim();
    if (ficha.origem.informacoes[rotulo] === "catalogo" && digitado === mostrado) return;
    if (!digitado) return;
    lista.push([rotulo, digitado]);
  });
  return lista;
}

export function payloadEdicao(atual, ficha) {
  const titulo = escolher(ficha, "titulo", atual.titulo);
  const resumo = escolher(ficha, "resumo", atual.resumo);
  const explicacao = escolher(ficha, "explicacao", atual.explicacao);
  const area = escolher(ficha, "area", atual.area);
  const tema = escolher(ficha, "tema", atual.tema);
  const inclui = escolher(ficha, "inclui", atual.inclui);
  const habilidades = escolher(ficha, "habilidades", atual.habilidades);
  const precoDigitado = String(atual.preco ?? "").trim();
  const precoCatalogoIntacto = ficha.origem.preco === "catalogo" && centavos(precoDigitado) === centavos(ficha.campos.preco);
  const preco = precoCatalogoIntacto ? 0 : Number(precoDigitado);
  const faltam = [];
  if (titulo.length < 3) faltam.push("título");
  if (resumo.length < 10) faltam.push("descrição breve");
  if (explicacao.length < 20) faltam.push("texto da página");
  if (!(preco > 0)) faltam.push("preço");
  if (faltam.length) {
    return {
      ok: false,
      mensagem: `Estes campos ainda não estão gravados e continuam só no catálogo: ${faltam.join(", ")}. Altere o que quiser salvar. O restante do catálogo não foi gravado.`,
    };
  }
  const informacoes = informacoesParaGravar(ficha, atual.informacoes);
  const destaque = atual.destaque === true;
  const informacoesNormais = normalizarInformacoes(informacoes);
  const bancoInformacoes = normalizarInformacoes(JSON.parse(bancoSeguro(ficha)));
  const atividade = {
    id: ficha.id,
    titulo,
    resumo,
    explicacao,
    preco,
    uso: ficha.uso,
    inclui,
    habilidades,
    destaque,
    area,
    tema,
    informacoes: informacoesNormais,
  };
  const banco = ficha.banco;
  const alterouTexto = titulo !== banco.titulo
    || resumo !== banco.resumo
    || explicacao !== banco.explicacao
    || inclui !== banco.inclui
    || habilidades !== banco.habilidades
    || area !== banco.area
    || tema !== banco.tema
    || centavos(preco) !== centavos(banco.preco)
    || destaque !== banco.destaque
    || JSON.stringify(informacoesNormais) !== JSON.stringify(bancoInformacoes);
  return { ok: true, alterouTexto, atividade };
}

function bancoSeguro(ficha) {
  const textoBanco = ficha?.banco?.informacoes || "[]";
  try {
    JSON.parse(textoBanco);
    return textoBanco;
  } catch {
    return "[]";
  }
}

function normalizarInformacoes(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((par) => Array.isArray(par) && String(par[0] || "").trim() && String(par[1] || "").trim())
    .map((par) => [String(par[0]), String(par[1]).trim()])
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}
