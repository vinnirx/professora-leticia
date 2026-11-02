import { aviso } from "./avisos.js";
import { dinheiro, linhas } from "../texto.js";
import { areas, temasPorArea } from "../temas.js";

let capaUrl = "";

function slugAtividade(titulo, existentes) {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "atividade";
  let id = base;
  let numero = 2;
  while (existentes.has(id)) {
    id = `${base}-${numero}`.slice(0, 48);
    numero += 1;
  }
  return id;
}

function preencherTemas(area, temaAtual) {
  const tema = document.querySelector("#tema-atividade");
  tema.replaceChildren();
  if (!area) {
    const aguarda = document.createElement("option");
    aguarda.value = "";
    aguarda.textContent = "Escolha a área primeiro";
    tema.append(aguarda);
    tema.disabled = true;
    return;
  }
  const lista = temasPorArea[area] || [];
  if (!lista.length) {
    const vazio = document.createElement("option");
    vazio.value = "";
    vazio.textContent = "Essa área ainda não tem temas";
    tema.append(vazio);
    tema.disabled = true;
    return;
  }
  tema.disabled = false;
  const escolha = document.createElement("option");
  escolha.value = "";
  escolha.textContent = "Escolha o tema";
  tema.append(escolha);
  lista.forEach((nome) => {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    opcao.selected = nome === temaAtual;
    tema.append(opcao);
  });
}

function informacoesDe(campos) {
  return [
    ["Área do conhecimento", campos.get("info_area")],
    ["Categoria", campos.get("info_categoria")],
    ["Subcategoria", campos.get("info_subcategoria")],
    ["Operação", campos.get("info_operacao")],
    ["Campo numérico", campos.get("info_campo")],
    ["Quantidade", campos.get("info_quantidade")],
    ["Recursos", campos.get("info_recursos")],
    ["Formato", campos.get("info_formato")],
  ]
    .map(([rotulo, valor]) => [rotulo, String(valor || "").trim()])
    .filter(([, valor]) => valor);
}

function lerCadastro(formulario, existentes) {
  const campos = new FormData(formulario);
  const titulo = String(campos.get("titulo") || "").trim();
  const resumo = String(campos.get("resumo") || "").trim();
  const explicacao = String(campos.get("explicacao") || "").trim();
  const preco = Number(campos.get("preco"));
  const area = String(campos.get("area") || "");
  const tema = String(campos.get("tema") || "");
  const capa = formulario.querySelector('[name="capa"]').files[0];
  const temas = temasPorArea[area] || [];
  if (titulo.length < 3) return { erro: "Diga qual é a atividade." };
  if (!capa) return { erro: "Escolha a imagem da capa." };
  if (!/^image\/(jpeg|png|webp)$/.test(capa.type)) return { erro: "A capa precisa ser JPG, PNG ou WebP." };
  if (!area) return { erro: "Escolha a área da loja." };
  if (temas.length && !temas.includes(tema)) return { erro: "Escolha o tema dessa área." };
  if (resumo.length < 10) return { erro: "Escreva uma descrição breve, com pelo menos 10 letras." };
  if (explicacao.length < 20) return { erro: "Escreva o texto da página, com pelo menos 20 letras." };
  if (!preco || preco <= 0) return { erro: "O valor precisa ser maior que zero." };
  const informacoes = informacoesDe(campos);
  if (!informacoes.some(([rotulo]) => rotulo === "Quantidade")) return { erro: "Diga a quantidade do material." };
  if (!informacoes.some(([rotulo]) => rotulo === "Formato")) return { erro: "Diga o formato do material." };
  return {
    erro: "",
    atividade: {
      id: slugAtividade(titulo, existentes),
      titulo,
      resumo,
      explicacao,
      preco,
      destaque: campos.get("destaque") === "sim",
      area,
      tema,
      uso: "",
      inclui: String(campos.get("inclui") || "").trim(),
      habilidades: String(campos.get("habilidades") || "").trim(),
      informacoes,
      capa,
      pdf: formulario.querySelector('[name="pdf"]').files[0] || null,
    },
  };
}

function paragrafo(texto) {
  const p = document.createElement("p");
  p.textContent = texto;
  return p;
}

function mostrarPrevia(atividade) {
  const previa = document.querySelector("#previa-atividade");
  previa.hidden = false;
  previa.replaceChildren();
  const avisoPrevia = paragrafo("Prévia. Nada foi salvo na loja.");
  avisoPrevia.className = "aviso-conta aviso-ok";
  const lugar = paragrafo(atividade.destaque
    ? `Entra em Materiais em destaque e também em ${atividade.area}${atividade.tema ? ` > ${atividade.tema}` : ""}.`
    : `Não entra em Materiais em destaque. Aparece em ${atividade.area}${atividade.tema ? ` > ${atividade.tema}` : ""}.`);
  if (!atividade.tema && !(temasPorArea[atividade.area] || []).length) {
    lugar.textContent += " Essa área ainda não tem temas no menu.";
  }

  const card = document.createElement("article");
  card.className = "card previa-card";
  const amostra = document.createElement("div");
  amostra.className = "amostra amostra-capa";
  const imagem = document.createElement("img");
  imagem.src = capaUrl;
  imagem.alt = atividade.titulo;
  amostra.append(imagem);
  const oferta = document.createElement("div");
  oferta.className = "oferta";
  const tituloCard = document.createElement("h3");
  tituloCard.textContent = atividade.titulo;
  const preco = paragrafo(dinheiro(atividade.preco));
  preco.className = "preco";
  const ver = document.createElement("span");
  ver.className = "botao";
  ver.textContent = "Ver Atividade";
  const adicionar = document.createElement("span");
  adicionar.className = "botao botao-secundario";
  adicionar.textContent = "Adicionar ao carrinho";
  oferta.append(tituloCard, preco, ver, adicionar);
  card.append(amostra, oferta);

  const ficha = document.createElement("div");
  ficha.className = "previa-ficha";
  const tituloFicha = document.createElement("h3");
  tituloFicha.textContent = atividade.titulo;
  const precoFicha = paragrafo(dinheiro(atividade.preco));
  precoFicha.className = "preco";
  ficha.append(tituloFicha, precoFicha);
  const extra = linhas(atividade.inclui)[0];
  if (extra) ficha.append(paragrafo(extra));
  linhas(atividade.explicacao).forEach((texto) => ficha.append(paragrafo(texto)));
  const habilidades = linhas(atividade.habilidades);
  if (habilidades.length) {
    const tituloHabilidades = document.createElement("h3");
    tituloHabilidades.textContent = "Habilidades desenvolvidas";
    const lista = document.createElement("ul");
    habilidades.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      lista.append(li);
    });
    ficha.append(tituloHabilidades, lista);
  }
  if (atividade.informacoes.length) {
    const tituloInfo = document.createElement("h3");
    tituloInfo.textContent = "Informações do material";
    const fichaInfo = document.createElement("dl");
    fichaInfo.className = "ficha-info";
    atividade.informacoes.forEach(([rotulo, valor]) => {
      const linha = document.createElement("div");
      const termo = document.createElement("dt");
      const descricao = document.createElement("dd");
      termo.textContent = rotulo;
      descricao.textContent = valor;
      linha.append(termo, descricao);
      fichaInfo.append(linha);
    });
    ficha.append(tituloInfo, fichaInfo);
  }

  const grade = document.createElement("div");
  grade.className = "previa-loja";
  grade.append(card, ficha);
  previa.append(avisoPrevia, lugar, grade);
  previa.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function prepararCadastro(loja, existentes, aoCriar) {
  const formulario = document.querySelector("#nova-atividade");
  const area = formulario.querySelector('[name="area"]');
  if (!area.options.length) {
    const inicial = document.createElement("option");
    inicial.value = "";
    inicial.textContent = "Escolha a área";
    area.append(inicial);
    areas.forEach((nome) => {
      const opcao = document.createElement("option");
      opcao.value = nome;
      opcao.textContent = nome;
      area.append(opcao);
    });
  }
  area.addEventListener("change", () => preencherTemas(area.value, ""));
  preencherTemas("", "");

  const capa = formulario.querySelector('[name="capa"]');
  capa.addEventListener("change", () => {
    if (capaUrl) URL.revokeObjectURL(capaUrl);
    const arquivo = capa.files[0];
    const mini = document.querySelector("#capa-mini");
    if (!arquivo || !/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
      capaUrl = "";
      mini.hidden = true;
      mini.removeAttribute("src");
      return;
    }
    capaUrl = URL.createObjectURL(arquivo);
    mini.src = capaUrl;
    mini.alt = "Capa escolhida";
    mini.hidden = false;
  });

  const botao = formulario.querySelector('[type="submit"]');
  const avisoCadastro = document.querySelector("#cadastro-aviso");
  if (loja?.configurada) {
    avisoCadastro.textContent = "O banco está ligado. Ao criar, a atividade entra na loja.";
    botao.textContent = "Criar atividade";
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const estado = document.querySelector("#nova-status");
    const leitura = lerCadastro(formulario, existentes);
    if (leitura.erro) {
      aviso(estado, leitura.erro);
      return;
    }
    const atividade = leitura.atividade;
    if (!loja?.configurada) {
      mostrarPrevia(atividade);
      aviso(estado, "Nada foi salvo. A atividade só entra na loja quando o banco de dados estiver ligado.", true);
      return;
    }
    const resultado = await loja.criarAtividade(atividade);
    if (!resultado.ok) {
      aviso(estado, resultado.mensagem);
      return;
    }
    existentes.add(atividade.id);
    const criada = resultado.atividade;
    const capaEnviada = await loja.enviarCapa(atividade.id, atividade.capa);
    if (!capaEnviada.ok) {
      aviso(estado, `A atividade foi criada, mas a capa não entrou. ${capaEnviada.mensagem}`);
      return;
    }
    await loja.definirCapa(atividade.id, capaEnviada.url);
    if (aoCriar) aoCriar({ ...criada, titulo: atividade.titulo, preco: atividade.preco, resumo: atividade.resumo });
    if (atividade.pdf) {
      const envio = await loja.enviarPdf(atividade.id, atividade.pdf, criada.arquivo);
      if (!envio.ok) {
        aviso(estado, `A atividade foi criada, mas o PDF não entrou. ${envio.mensagem}`);
        return;
      }
    }
    formulario.reset();
    formulario.querySelector('[name="preco"]').value = "10";
    formulario.querySelector('[name="info_formato"]').value = "PDF para impressão";
    document.querySelector("#capa-mini").hidden = true;
    document.querySelector("#previa-atividade").hidden = true;
    const link = document.createElement("a");
    link.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
    link.textContent = "Abrir a página exclusiva";
    estado.replaceChildren();
    estado.classList.add("aviso-ok");
    estado.append("Atividade criada. O card já entra na loja. ", link);
  });
}
