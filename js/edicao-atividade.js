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

const EXIGIDOS = new Set(["titulo", "resumo", "explicacao", "preco"]);

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

export function avisoCatalogo(ficha) {
  const exigidos = [];
  const opcionais = [];
  Object.entries(ficha?.origem || {}).forEach(([chave, valor]) => {
    if (chave === "informacoes" || valor !== "catalogo" || !ROTULOS[chave]) return;
    (EXIGIDOS.has(chave) ? exigidos : opcionais).push(ROTULOS[chave]);
  });
  Object.entries(ficha?.origem?.informacoes || {}).forEach(([rotulo, valor]) => {
    if (valor === "catalogo") opcionais.push(rotulo.toLowerCase());
  });
  if (!exigidos.length && !opcionais.length) return "";
  const nomes = [...exigidos, ...opcionais];
  return `Estes dados aparecem na loja a partir do catálogo e ainda não estão gravados: ${juntar(nomes)}. Salvar outro campo não grava esses dados.`;
}

function juntar(nomes) {
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

function textoMudou(ficha, chave, atual) {
  return String(atual ?? "").trim() !== String(ficha.campos[chave] ?? "").trim();
}

function informacoesDoBanco(ficha) {
  try {
    return normalizarInformacoes(JSON.parse(ficha.banco.informacoes || "[]"));
  } catch {
    return [];
  }
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

function informacoesEditadas(ficha, atuais) {
  const mudou = INFORMACOES.some(([, rotulo]) => {
    return String(atuais?.[rotulo] || "").trim() !== String(ficha.campos.informacoes[rotulo] || "").trim();
  });
  if (!mudou) return null;
  return informacoesParaGravar(ficha, atuais);
}

export function payloadEdicao(atual, ficha) {
  const mudancas = {};
  const erros = [];
  const registrar = (chave, minimo, rotulo) => {
    if (!textoMudou(ficha, chave, atual[chave])) return;
    const valor = String(atual[chave] ?? "").trim();
    if (minimo && valor.length < minimo) erros.push(rotulo);
    else mudancas[chave] = valor;
  };
  registrar("titulo", 3, "título");
  registrar("resumo", 10, "descrição breve");
  registrar("explicacao", 20, "texto da página");
  registrar("area", 0, "");
  registrar("tema", 0, "");
  registrar("inclui", 0, "");
  registrar("habilidades", 0, "");
  if (centavos(atual.preco) !== centavos(ficha.campos.preco)) {
    const preco = Number(atual.preco);
    if (!(preco > 0)) erros.push("preço");
    else mudancas.preco = preco;
  }
  if ((atual.destaque === true) !== (ficha.destaque === true)) mudancas.destaque = atual.destaque === true;
  const informacoes = informacoesEditadas(ficha, atual.informacoes);
  if (informacoes) mudancas.informacoes = informacoes;
  if (erros.length) {
    return { ok: false, mensagem: `Corrija ${erros.join(", ")} antes de salvar. Os outros campos não foram alterados.` };
  }
  const banco = ficha.banco;
  const completo = {
    id: ficha.id,
    titulo: mudancas.titulo ?? banco.titulo,
    resumo: mudancas.resumo ?? banco.resumo,
    explicacao: mudancas.explicacao ?? banco.explicacao,
    preco: mudancas.preco ?? banco.preco,
    uso: ficha.uso,
    inclui: mudancas.inclui ?? banco.inclui,
    habilidades: mudancas.habilidades ?? banco.habilidades,
    destaque: Object.hasOwn(mudancas, "destaque") ? mudancas.destaque : banco.destaque,
    area: mudancas.area ?? banco.area,
    tema: mudancas.tema ?? banco.tema,
    informacoes: mudancas.informacoes ?? informacoesDoBanco(ficha),
  };
  const compativel = completo.titulo.length >= 3
    && completo.resumo.length >= 10
    && completo.explicacao.length >= 20
    && Number(completo.preco) > 0;
  return {
    ok: true,
    alterouTexto: Object.keys(mudancas).length > 0,
    mudancas,
    compativel,
    atividade: completo,
  };
}

export function decidirGravacao(plano, arquivos = {}) {
  if (!plano?.ok) {
    return { acao: "erro", mensagem: plano?.mensagem || "Não foi possível salvar. Os dados anteriores foram mantidos." };
  }
  if (!plano.alterouTexto && !arquivos.capa && !arquivos.pdf) {
    return { acao: "parar", mensagem: "Nenhuma alteração para salvar" };
  }
  if (!plano.alterouTexto) return { acao: "arquivos" };
  return { acao: "editar_campos", campos: plano.mudancas };
}

export function mensagemFuncaoAusente() {
  return "Não consegui salvar. A gravação de um campo só ainda não está instalada no banco. Nada foi alterado.";
}

export function confirmarFicha(ficha, mudancas) {
  Object.entries(mudancas).forEach(([chave, valor]) => {
    if (chave === "informacoes") {
      ficha.banco.informacoes = JSON.stringify(valor);
      ficha.campos.informacoes = {};
      ficha.origem.informacoes = {};
      INFORMACOES.forEach(([, rotulo]) => {
        const achado = valor.find((par) => par[0] === rotulo);
        ficha.campos.informacoes[rotulo] = achado ? achado[1] : "";
        ficha.origem.informacoes[rotulo] = achado ? "banco" : "vazio";
      });
      return;
    }
    if (chave === "preco") {
      ficha.banco.preco = Number(valor);
      ficha.campos.preco = String(valor);
      ficha.origem.preco = "banco";
      return;
    }
    if (chave === "destaque") {
      ficha.banco.destaque = valor === true;
      ficha.destaque = valor === true;
      return;
    }
    ficha.banco[chave] = valor;
    ficha.campos[chave] = valor;
    ficha.origem[chave] = String(valor || "").trim() ? "banco" : "vazio";
  });
}

function normalizarInformacoes(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((par) => Array.isArray(par) && String(par[0] || "").trim() && String(par[1] || "").trim())
    .map((par) => [String(par[0]), String(par[1]).trim()])
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}
