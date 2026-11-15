import { validarNovaAtividade } from "../cadastro-regras.js";
import { validarCapa } from "../capa-loja.js";
import { avisoCatalogo, confirmarFicha, decidirGravacao, fichaInicial, mensagemFuncaoAusente, payloadEdicao, rotulosInformacao } from "../edicao-atividade.js?v=4";
import { formatarTamanho, validarPdf } from "../pdf-troca.js";
import { dinheiro, linhas } from "../texto.js";
import { areas, temasPorArea } from "../temas.js";
import { criarTrava } from "../trava.js";
import { paginaAtividade } from "../rotas.js";

let capaUrl = "";
let atividadeEmEdicao = null;
let fichaAberta = null;
let etapaAtual = 1;
const travaSalvar = criarTrava();

async function bytesDoArquivo(arquivo, quantidade) {
  const fatia = quantidade ? arquivo.slice(0, quantidade) : arquivo;
  return new Uint8Array(await fatia.arrayBuffer());
}

function temRascunho(formulario) {
  const titulo = formulario.querySelector('[name="titulo"]').value.trim();
  const resumo = formulario.querySelector('[name="resumo"]').value.trim();
  const explicacao = formulario.querySelector('[name="explicacao"]').value.trim();
  return Boolean(formulario.dataset.editando || titulo || resumo || explicacao);
}

function validarEtapa(formulario, numero) {
  const titulo = formulario.querySelector('[name="titulo"]').value.trim();
  const preco = Number(formulario.querySelector('[name="preco"]').value);
  const area = formulario.querySelector('[name="area"]').value;
  const tema = formulario.querySelector('[name="tema"]').value;
  const resumo = formulario.querySelector('[name="resumo"]').value.trim();
  const explicacao = formulario.querySelector('[name="explicacao"]').value.trim();
  const quantidade = formulario.querySelector('[name="info_quantidade"]').value.trim();
  const formato = formulario.querySelector('[name="info_formato"]').value.trim();
  if (numero === 1) {
    if (titulo.length < 3) return "Diga qual é a atividade.";
    if (!area) return "Escolha a área da loja.";
    const temas = temasPorArea[area] || [];
    if (temas.length && !temas.includes(tema)) return "Escolha o tema dessa área.";
    if (!preco || preco <= 0) return "O valor precisa ser maior que zero.";
    if (resumo.length < 10) return "Escreva uma descrição breve, com pelo menos 10 letras.";
  }
  if (numero === 2) {
    if (explicacao.length < 20) return "Escreva o texto da página, com pelo menos 20 letras.";
    if (!quantidade) return "Diga a quantidade do material.";
    if (!formato) return "Diga o formato do material.";
  }
  if (numero === 3) {
    const capa = formulario.querySelector('[name="capa"]').files[0];
    if (!formulario.dataset.editando && !capa) return "Escolha a imagem da capa.";
    if (capa && !/^image\/(jpeg|png|webp)$/.test(capa.type)) return "A capa precisa ser JPG, PNG ou WebP.";
  }
  return "";
}

function preencherRevisao(formulario) {
  const lista = document.querySelector("#revisao-atividade");
  if (!lista) return;
  const campos = [
    ["Atividade", formulario.querySelector('[name="titulo"]').value.trim()],
    ["Área", formulario.querySelector('[name="area"]').value || "—"],
    ["Tema", formulario.querySelector('[name="tema"]').value || "—"],
    ["Preço", dinheiro(formulario.querySelector('[name="preco"]').value)],
    ["Descrição", formulario.querySelector('[name="resumo"]').value.trim()],
    ["Categoria", formulario.querySelector('[name="info_categoria"]').value.trim() || "—"],
    ["Capa", formulario.querySelector('[name="capa"]').files[0]?.name || formulario.dataset.capaAtual || (formulario.dataset.editando ? "Mantém a capa atual" : "Não escolhida")],
    ["PDF", formulario.querySelector('[name="pdf"]').files[0]?.name || formulario.dataset.arquivoAtual || "Nenhum PDF novo"],
    ["Destaque", formulario.querySelector('[name="destaque"]').checked ? "Entra na vitrine, se ainda houver vaga" : "Não entra na vitrine"],
  ];
  lista.replaceChildren();
  campos.forEach(([rotulo, valor]) => {
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    lista.append(dt, dd);
  });
}

function mostrarTrabalho(modo) {
  const lista = document.querySelector("#lista-trabalho");
  const criar = document.querySelector("#cadastro-atividade");
  const editar = document.querySelector("#ficha-edicao");
  if (lista) lista.hidden = modo !== "lista";
  if (criar) criar.hidden = modo !== "criar";
  if (editar) editar.hidden = modo !== "editar";
}

function definirTrabalho(aberto) {
  mostrarTrabalho(aberto ? "criar" : "lista");
}

function emEdicao(formulario) {
  return formulario.classList.contains("edicao-plana");
}

function mostrarEtapa(formulario, numero) {
  etapaAtual = numero;
  if (emEdicao(formulario)) {
    formulario.querySelectorAll("[data-etapa]").forEach((bloco) => {
      bloco.hidden = false;
    });
    formulario.querySelectorAll("[data-passo]").forEach((botao) => {
      botao.removeAttribute("aria-current");
    });
    const voltar = document.querySelector("#etapa-voltar");
    const seguir = document.querySelector("#etapa-seguir");
    const publicar = formulario.querySelector('[type="submit"]');
    if (voltar) voltar.hidden = true;
    if (seguir) seguir.hidden = true;
    if (publicar) publicar.hidden = false;
    preencherRevisao(formulario);
    return;
  }
  formulario.querySelectorAll("[data-etapa]").forEach((bloco) => {
    bloco.hidden = Number(bloco.dataset.etapa) !== numero;
  });
  formulario.querySelectorAll("[data-passo]").forEach((botao) => {
    if (Number(botao.dataset.passo) === numero) botao.setAttribute("aria-current", "true");
    else botao.removeAttribute("aria-current");
  });
  const voltar = document.querySelector("#etapa-voltar");
  const seguir = document.querySelector("#etapa-seguir");
  const publicar = formulario.querySelector('[type="submit"]');
  if (voltar) voltar.hidden = numero === 1;
  if (seguir) seguir.hidden = numero === 4;
  if (publicar) publicar.hidden = numero !== 4;
  if (numero === 4) preencherRevisao(formulario);
}

function limparEdicao(formulario) {
  atividadeEmEdicao = null;
  fichaAberta = null;
  formulario.classList.remove("edicao-plana");
  delete formulario.dataset.editando;
  delete formulario.dataset.destaqueAtual;
  delete formulario.dataset.capaAtual;
  delete formulario.dataset.arquivoAtual;
  formulario.reset();
  formulario.querySelector('[name="preco"]').value = "10";
  formulario.querySelector('[name="info_formato"]').value = "PDF para impressão";
  preencherTemas("", "");
  document.querySelector("#capa-mini").hidden = true;
  document.querySelector("#previa-atividade").hidden = true;
  document.querySelector("#titulo-nova").textContent = "Nova atividade";
  document.querySelector("#cancelar-edicao").hidden = true;
  const nomeCapa = document.querySelector("#nome-capa");
  const nomePdf = document.querySelector("#nome-pdf");
  const origem = document.querySelector("#origem-catalogo");
  if (nomeCapa) nomeCapa.textContent = "";
  if (nomePdf) nomePdf.textContent = "";
  if (origem) {
    origem.hidden = true;
    origem.textContent = "";
  }
  const botao = formulario.querySelector('[type="submit"]');
  const avisoCadastro = document.querySelector("#cadastro-aviso");
  const ligado = formulario.dataset.ligado === "sim";
  avisoCadastro.textContent = ligado
    ? "O banco está ligado. Ao publicar, a atividade entra na loja."
    : "Nada é salvo agora. Dá para ver a prévia.";
  botao.textContent = ligado ? "Publicar atividade" : "Ver prévia";
  mostrarEtapa(formulario, 1);
}

function atualizarCartao(atividade) {
  const artigo = document.querySelector(`#lista-atividades [data-atividade="${CSS.escape(atividade.id)}"]`);
  if (!artigo) return;
  const titulo = artigo.querySelector("[data-campo='titulo']");
  if (titulo) titulo.textContent = atividade.titulo;
  const preco = artigo.querySelector("[data-campo='preco']");
  if (preco) preco.textContent = dinheiro(atividade.preco);
  const caixa = artigo.querySelector("[data-destaque]");
  if (caixa) caixa.checked = atividade.destaque !== false;
}

function catalogoDa(id) {
  return (window.loja?.atividades || []).find((item) => item.id === id) || null;
}

function preencherInformacoes(formulario, valores) {
  rotulosInformacao().forEach(({ campo, rotulo }) => {
    const entrada = formulario.querySelector(`[name="${campo}"]`);
    if (entrada) entrada.value = valores?.[rotulo] || "";
  });
}

function mostrarArquivosAtuais(ficha) {
  const mini = document.querySelector("#capa-mini");
  const nomeCapa = document.querySelector("#nome-capa");
  const nomePdf = document.querySelector("#nome-pdf");
  if (mini) {
    if (ficha.capa) {
      mini.src = ficha.capa;
      mini.alt = "Capa atual";
      mini.hidden = false;
    } else {
      mini.hidden = true;
      mini.removeAttribute("src");
    }
  }
  if (nomeCapa) {
    nomeCapa.textContent = ficha.capa
      ? "Capa atual. Escolha outra imagem só se quiser trocar."
      : "Nenhuma capa gravada. Escolha uma imagem só se quiser enviar.";
  }
  if (nomePdf) {
    nomePdf.textContent = ficha.arquivo
      ? `PDF atual: ${ficha.arquivo}. Escolha outro arquivo só se quiser trocar.`
      : "Nenhum PDF vinculado. Escolha um arquivo só se quiser enviar.";
  }
}

function garantirOpcao(select, valor) {
  const textoValor = String(valor || "");
  if (!select || !textoValor || [...select.options].some((opcao) => opcao.value === textoValor)) return;
  const extra = document.createElement("option");
  extra.value = textoValor;
  extra.textContent = textoValor;
  select.append(extra);
}

function preencherArea(select) {
  if (!select || select.options.length) return;
  const inicial = document.createElement("option");
  inicial.value = "";
  inicial.textContent = "Escolha a área";
  select.append(inicial);
  areas.forEach((nome) => {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    select.append(opcao);
  });
}

function lerFormularioEdicao(formulario) {
  const campos = new FormData(formulario);
  const informacoes = {};
  rotulosInformacao().forEach(({ campo, rotulo }) => {
    informacoes[rotulo] = String(campos.get(campo) || "");
  });
  return {
    titulo: campos.get("titulo"),
    resumo: campos.get("resumo"),
    explicacao: campos.get("explicacao"),
    preco: campos.get("preco"),
    area: campos.get("area"),
    tema: campos.get("tema"),
    inclui: campos.get("inclui"),
    habilidades: campos.get("habilidades"),
    destaque: campos.get("destaque") === "sim",
    informacoes,
  };
}

function fichaSuja(formulario) {
  if (!fichaAberta) return false;
  const plano = payloadEdicao(lerFormularioEdicao(formulario), fichaAberta);
  const capa = formulario.querySelector('[name="capa"]')?.files?.[0];
  const pdf = formulario.querySelector('[name="pdf"]')?.files?.[0];
  return Boolean(capa || pdf || !plano.ok || plano.alterouTexto);
}

export function abrirEdicao(atividade) {
  const formulario = document.querySelector("#form-edicao");
  const local = catalogoDa(atividade.id);
  atividadeEmEdicao = atividade;
  fichaAberta = fichaInicial(atividade.foraDoBanco ? { ...atividade, destaque: false } : atividade, local);
  const ficha = fichaAberta;
  formulario.dataset.editando = atividade.id;
  formulario.dataset.destaqueAtual = ficha.destaque ? "sim" : "";
  formulario.querySelector('[name="titulo"]').value = ficha.campos.titulo || "";
  formulario.querySelector('[name="preco"]').value = ficha.campos.preco || "";
  formulario.querySelector('[name="destaque"]').checked = ficha.destaque;
  formulario.querySelector('[name="resumo"]').value = ficha.campos.resumo || "";
  formulario.querySelector('[name="explicacao"]').value = ficha.campos.explicacao || "";
  formulario.querySelector('[name="habilidades"]').value = ficha.campos.habilidades || "";
  formulario.querySelector('[name="inclui"]').value = ficha.campos.inclui || "";
  preencherInformacoes(formulario, ficha.campos.informacoes);
  const area = formulario.querySelector('[name="area"]');
  preencherArea(area);
  garantirOpcao(area, ficha.campos.area);
  area.value = ficha.campos.area || "";
  const tema = formulario.querySelector("#tema-edicao");
  preencherTemas(area.value, ficha.campos.tema || "", tema);
  garantirOpcao(tema, ficha.campos.tema);
  if (ficha.campos.tema) {
    tema.value = ficha.campos.tema;
    tema.disabled = false;
  }
  const mini = document.querySelector("#capa-edicao-mini");
  const capaAtual = document.querySelector("#capa-edicao-atual");
  const pdfAtual = document.querySelector("#pdf-edicao-atual");
  if (mini) {
    if (ficha.capa) {
      mini.src = ficha.capa;
      mini.alt = "Capa atual";
      mini.hidden = false;
    } else {
      mini.hidden = true;
      mini.removeAttribute("src");
    }
  }
  if (capaAtual) capaAtual.textContent = ficha.capa ? "Capa atual da atividade." : "Nenhuma capa gravada.";
  if (pdfAtual) pdfAtual.textContent = ficha.arquivo ? `PDF atual: ${ficha.arquivo}` : "Nenhum PDF vinculado.";
  document.querySelector("#capa-edicao-nova").textContent = "";
  document.querySelector("#pdf-edicao-nova").textContent = "";
  formulario.querySelector('[name="capa"]').value = "";
  formulario.querySelector('[name="pdf"]').value = "";
  const origem = document.querySelector("#origem-edicao");
  const textoOrigem = atividade.foraDoBanco ? "" : avisoCatalogo(ficha);
  if (origem) {
    origem.hidden = textoOrigem === "";
    origem.textContent = textoOrigem;
  }
  const estado = document.querySelector("#edicao-status");
  if (estado) {
    estado.className = "aviso-conta";
    estado.textContent = "";
  }
  mostrarTrabalho("editar");
  if (location.hash !== "#atividades") location.hash = "atividades";
  document.querySelector("#ficha-edicao")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

function preencherTemas(area, temaAtual, select) {
  const tema = select || document.querySelector("#tema-atividade");
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

function lerCadastro(formulario, existentes, idAtual = "") {
  const campos = new FormData(formulario);
  const titulo = String(campos.get("titulo") || "").trim();
  const resumo = String(campos.get("resumo") || "").trim();
  const explicacao = String(campos.get("explicacao") || "").trim();
  const preco = Number(campos.get("preco"));
  const area = String(campos.get("area") || "");
  const tema = String(campos.get("tema") || "");
  const capa = formulario.querySelector('[name="capa"]').files[0];
  const temas = temasPorArea[area] || [];
  const informacoes = informacoesDe(campos);
  if (!idAtual) {
    const erroNova = validarNovaAtividade({
      titulo,
      resumo,
      explicacao,
      preco,
      area,
      tema,
      temasDaArea: temas,
      capa: Boolean(capa),
      tipoCapa: capa?.type || "",
      quantidade: informacoes.find(([rotulo]) => rotulo === "Quantidade")?.[1] || "",
      formato: informacoes.find(([rotulo]) => rotulo === "Formato")?.[1] || "",
    });
    if (erroNova) return { erro: erroNova };
  }
  return {
    erro: "",
    atividade: {
      id: idAtual || slugAtividade(titulo, existentes),
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

async function salvarEdicao(evento, formulario, loja) {
  evento.preventDefault();
  if (!travaSalvar.entrar()) return;
  const botoes = [
    ...formulario.querySelectorAll('[type="submit"]'),
    ...document.querySelectorAll('[form="form-edicao"]'),
  ];
  botoes.forEach((botao) => {
    botao.disabled = true;
  });
  const estado = document.querySelector("#edicao-status");
  try {
    if (!fichaAberta) return;
    const plano = payloadEdicao(lerFormularioEdicao(formulario), fichaAberta);
    if (!plano.ok) {
      aviso(estado, plano.mensagem);
      return;
    }
    const capaNova = formulario.querySelector('[name="capa"]').files[0] || null;
    const pdfNovo = formulario.querySelector('[name="pdf"]').files[0] || null;
    if (capaNova) {
      const validacao = validarCapa({
        tipo: capaNova.type,
        tamanho: capaNova.size,
        bytes: await bytesDoArquivo(capaNova, 16),
      });
      if (!validacao.ok) {
        aviso(estado, validacao.mensagem);
        return;
      }
    }
    if (pdfNovo) {
      const validacao = validarPdf({
        nome: pdfNovo.name,
        tipo: pdfNovo.type,
        tamanho: pdfNovo.size,
        bytes: await bytesDoArquivo(pdfNovo, 5),
      });
      if (!validacao.ok) {
        aviso(estado, validacao.mensagem);
        return;
      }
    }
    const decisao = decidirGravacao(plano, { capa: Boolean(capaNova), pdf: Boolean(pdfNovo) });
    if (decisao.acao === "parar" || decisao.acao === "erro") {
      aviso(estado, decisao.mensagem);
      return;
    }
    if (!loja?.configurada) {
      aviso(estado, "Nada foi salvo. A atividade só entra na loja quando o banco de dados estiver ligado.");
      return;
    }
    const jaEraDestaque = formulario.dataset.destaqueAtual === "sim";
    if (plano.atividade.destaque && !jaEraDestaque && document.querySelectorAll("#lista-atividades [data-destaque]:checked").length >= 4) {
      aviso(estado, "A vitrine mostra no máximo 4. Tire uma do destaque antes.");
      return;
    }
    if (decisao.acao === "editar_campos") {
      const resultado = loja.editarCampos
        ? await loja.editarCampos(fichaAberta.id, decisao.campos)
        : { ok: false, ausente: true };
      if (resultado?.ausente) {
        aviso(estado, mensagemFuncaoAusente());
        return;
      }
      if (!resultado?.ok) {
        aviso(estado, resultado?.mensagem || "Não foi possível salvar. Os dados anteriores foram mantidos.");
        return;
      }
      confirmarFicha(fichaAberta, plano.mudancas);
      formulario.dataset.destaqueAtual = fichaAberta.destaque ? "sim" : "";
    }
    let capaUrlSalva = "";
    if (capaNova) {
      const capaEnviada = await loja.enviarCapa(fichaAberta.id, capaNova);
      if (!capaEnviada.ok) {
        aviso(estado, plano.alterouTexto ? `O texto foi salvo, mas a capa não entrou. ${capaEnviada.mensagem}` : capaEnviada.mensagem);
        return;
      }
      const definida = await loja.definirCapa(fichaAberta.id, capaEnviada.url);
      if (!definida?.ok) {
        aviso(estado, "A imagem foi enviada, mas a atividade ainda mostra a capa anterior.");
        return;
      }
      capaUrlSalva = capaEnviada.url;
      fichaAberta.capa = capaUrlSalva;
      fichaAberta.capaDoBanco = true;
    }
    let arquivoSalvo = fichaAberta.arquivo || "";
    if (pdfNovo) {
      const envio = await loja.substituirPdf(fichaAberta.id, pdfNovo, arquivoSalvo);
      if (!envio?.ok) {
        aviso(estado, plano.alterouTexto || capaNova ? `O restante foi salvo. ${envio?.mensagem || "O PDF atual foi mantido."}` : (envio?.mensagem || "O PDF atual foi mantido."));
        return;
      }
      arquivoSalvo = envio.arquivo || arquivoSalvo;
      fichaAberta.arquivo = arquivoSalvo;
      if (envio.anterior) fichaAberta.arquivoAnterior = envio.anterior;
      if (atividadeEmEdicao && envio.anterior) {
        atividadeEmEdicao.pdfAnterior = envio.anterior;
        atividadeEmEdicao.arquivo_anterior = envio.anterior;
      }
      const pdfAtual = document.querySelector("#pdf-edicao-atual");
      if (pdfAtual) pdfAtual.textContent = `PDF atual: ${arquivoSalvo}`;
    }
    if (atividadeEmEdicao) {
      Object.assign(atividadeEmEdicao, {
        titulo: fichaAberta.banco.titulo,
        preco: fichaAberta.banco.preco,
        resumo: fichaAberta.banco.resumo,
        explicacao: fichaAberta.banco.explicacao,
        area: fichaAberta.banco.area,
        tema: fichaAberta.banco.tema,
        inclui: fichaAberta.banco.inclui,
        habilidades: fichaAberta.banco.habilidades,
        destaque: fichaAberta.destaque,
        arquivo: arquivoSalvo,
        capa: capaUrlSalva || atividadeEmEdicao.capa,
        foraDoBanco: false,
      });
      document.dispatchEvent(new CustomEvent("atividade-salva", { detail: { ...atividadeEmEdicao } }));
    }
    atualizarCartao({ id: fichaAberta.id, titulo: fichaAberta.banco.titulo, preco: fichaAberta.banco.preco, destaque: fichaAberta.destaque });
    formulario.querySelector('[name="capa"]').value = "";
    formulario.querySelector('[name="pdf"]').value = "";
    const novaCapa = document.querySelector("#capa-edicao-nova");
    const novoPdf = document.querySelector("#pdf-edicao-nova");
    if (novaCapa) novaCapa.textContent = "";
    if (novoPdf) novoPdf.textContent = "";
    aviso(estado, "Alterações salvas.", true);
  } finally {
    travaSalvar.sair();
    botoes.forEach((botao) => {
      botao.disabled = false;
    });
  }
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

  const ficha = document.querySelector("#form-edicao");
  const areaEdicao = ficha?.querySelector('[name="area"]');
  if (areaEdicao) {
    preencherArea(areaEdicao);
    areaEdicao.addEventListener("change", () => preencherTemas(areaEdicao.value, "", ficha.querySelector("#tema-edicao")));
  }
  ficha?.querySelector('[name="capa"]')?.addEventListener("change", async () => {
    const arquivo = ficha.querySelector('[name="capa"]').files[0];
    const nome = document.querySelector("#capa-edicao-nova");
    const mini = document.querySelector("#capa-edicao-mini");
    if (!arquivo) {
      if (nome) nome.textContent = "";
      return;
    }
    const validacao = validarCapa({
      tipo: arquivo.type,
      tamanho: arquivo.size,
      bytes: await bytesDoArquivo(arquivo, 16),
    });
    if (!validacao.ok) {
      ficha.querySelector('[name="capa"]').value = "";
      if (nome) nome.textContent = validacao.mensagem;
      return;
    }
    if (nome) nome.textContent = `Nova capa: ${arquivo.name} · ${formatarTamanho(arquivo.size)}`;
    if (mini) {
      if (capaUrl) URL.revokeObjectURL(capaUrl);
      capaUrl = URL.createObjectURL(arquivo);
      mini.src = capaUrl;
      mini.alt = "Nova capa";
      mini.hidden = false;
    }
  });
  ficha?.querySelector('[name="pdf"]')?.addEventListener("change", async () => {
    const arquivo = ficha.querySelector('[name="pdf"]').files[0];
    const nome = document.querySelector("#pdf-edicao-nova");
    if (!arquivo) {
      if (nome) nome.textContent = "";
      return;
    }
    const validacao = validarPdf({
      nome: arquivo.name,
      tipo: arquivo.type,
      tamanho: arquivo.size,
      bytes: await bytesDoArquivo(arquivo, 5),
    });
    if (!validacao.ok) {
      ficha.querySelector('[name="pdf"]').value = "";
      if (nome) nome.textContent = validacao.mensagem;
      return;
    }
    if (nome) nome.textContent = `Novo PDF: ${arquivo.name} · ${formatarTamanho(arquivo.size)}`;
  });
  const fecharFicha = () => {
    if (ficha && fichaSuja(ficha) && !window.confirm("Descartar o que foi alterado?")) return;
    atividadeEmEdicao = null;
    fichaAberta = null;
    mostrarTrabalho("lista");
  };
  document.querySelector("#fechar-edicao")?.addEventListener("click", fecharFicha);
  document.querySelector("#cancelar-ficha")?.addEventListener("click", fecharFicha);
  ficha?.addEventListener("submit", (evento) => salvarEdicao(evento, ficha, loja));

  const capa = formulario.querySelector('[name="capa"]');
  capa.addEventListener("change", async () => {
    if (capaUrl) URL.revokeObjectURL(capaUrl);
    capaUrl = "";
    const arquivo = capa.files[0];
    const mini = document.querySelector("#capa-mini");
    const atual = formulario.dataset.capaAtual || "";
    if (!arquivo) {
      if (atual) {
        mini.src = atual;
        mini.alt = "Capa atual";
        mini.hidden = false;
      } else {
        mini.hidden = true;
        mini.removeAttribute("src");
      }
      return;
    }
    const bytes = await bytesDoArquivo(arquivo, 16);
    const validacao = validarCapa({ tipo: arquivo.type, tamanho: arquivo.size, bytes });
    if (!validacao.ok) {
      capa.value = "";
      aviso(document.querySelector("#nova-status"), validacao.mensagem);
      const nomeCapa = document.querySelector("#nome-capa");
      if (nomeCapa) {
        nomeCapa.textContent = atual
          ? "Capa atual. Escolha outra imagem só se quiser trocar."
          : "Nenhuma capa gravada. Escolha uma imagem só se quiser enviar.";
      }
      if (capaUrl) URL.revokeObjectURL(capaUrl);
      capaUrl = "";
      if (atual) {
        mini.src = atual;
        mini.alt = "Capa atual";
        mini.hidden = false;
      } else {
        mini.hidden = true;
        mini.removeAttribute("src");
      }
      return;
    }
    capaUrl = URL.createObjectURL(arquivo);
    mini.src = capaUrl;
    mini.alt = "Nova capa";
    mini.hidden = false;
  });

  const botao = formulario.querySelector('[type="submit"]');
  const avisoCadastro = document.querySelector("#cadastro-aviso");
  formulario.dataset.ligado = loja?.configurada ? "sim" : "";
  if (loja?.configurada) {
    avisoCadastro.textContent = "O banco está ligado. Ao publicar, a atividade entra na loja.";
    botao.textContent = "Publicar atividade";
  }
  mostrarEtapa(formulario, 1);

  const marcarArquivo = (campo, destino, prefixo, atual) => {
    formulario.querySelector(`[name="${campo}"]`).addEventListener("change", () => {
      const arquivo = formulario.querySelector(`[name="${campo}"]`).files[0];
      const alvo = document.querySelector(destino);
      if (!alvo) return;
      if (arquivo) {
        alvo.textContent = `${prefixo}: ${arquivo.name} · ${formatarTamanho(arquivo.size)}`;
        return;
      }
      const vigente = formulario.dataset[atual] || "";
      alvo.textContent = vigente ? `${prefixo === "Novo PDF" ? "PDF atual" : "Capa atual"}: ${vigente}` : "";
    });
  };
  marcarArquivo("pdf", "#nome-pdf", "Novo PDF", "arquivoAtual");
  marcarArquivo("capa", "#nome-capa", "Nova capa", "capaAtual");

  document.querySelectorAll("[data-passo]").forEach((passo) => {
    passo.addEventListener("click", () => {
      const destino = Number(passo.dataset.passo);
      const estado = document.querySelector("#nova-status");
      if (destino > etapaAtual) {
        for (let numero = etapaAtual; numero < destino; numero += 1) {
          const erro = validarEtapa(formulario, numero);
          if (erro) {
            aviso(estado, erro);
            mostrarEtapa(formulario, numero);
            return;
          }
        }
      }
      estado.textContent = "";
      mostrarEtapa(formulario, destino);
    });
  });
  document.querySelector("#etapa-seguir")?.addEventListener("click", () => {
    const estado = document.querySelector("#nova-status");
    const erro = validarEtapa(formulario, etapaAtual);
    if (erro) {
      aviso(estado, erro);
      return;
    }
    estado.textContent = "";
    mostrarEtapa(formulario, etapaAtual + 1);
  });
  document.querySelector("#voltar-lista")?.addEventListener("click", () => {
    definirTrabalho(false);
  });
  document.querySelector("#etapa-voltar")?.addEventListener("click", () => {
    document.querySelector("#nova-status").textContent = "";
    mostrarEtapa(formulario, etapaAtual - 1);
  });
  document.addEventListener("mostrar-lista-atividades", () => mostrarTrabalho("lista"));
  document.querySelector("#abrir-cadastro")?.addEventListener("click", () => {
    const caixa = document.querySelector("#cadastro-atividade");
    if (!caixa.hidden && temRascunho(formulario) && !window.confirm("Há um cadastro aberto. Descartar o que foi preenchido?")) return;
    limparEdicao(formulario);
    document.querySelector("#nova-status").textContent = "";
    definirTrabalho(true);
    if (location.hash !== "#atividades") location.hash = "atividades";
    caixa.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("#cancelar-edicao").addEventListener("click", () => {
    if (temRascunho(formulario) && !window.confirm("Descartar o que foi preenchido?")) return;
    limparEdicao(formulario);
    document.querySelector("#nova-status").textContent = "";
    if (loja?.configurada) definirTrabalho(false);
  });

  function lerCamposEdicao(formularioEdicao) {
    const campos = new FormData(formularioEdicao);
    const informacoes = {};
    rotulosInformacao().forEach(({ campo, rotulo }) => {
      informacoes[rotulo] = String(campos.get(campo) || "");
    });
    return {
      titulo: campos.get("titulo"),
      resumo: campos.get("resumo"),
      explicacao: campos.get("explicacao"),
      preco: campos.get("preco"),
      area: campos.get("area"),
      tema: campos.get("tema"),
      inclui: campos.get("inclui"),
      habilidades: campos.get("habilidades"),
      destaque: campos.get("destaque") === "sim",
      informacoes,
    };
  }

  function avisarLista(texto) {
    const lista = document.querySelector("#atividades-status");
    if (!lista) return;
    lista.classList.add("aviso-ok");
    lista.textContent = texto;
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const editando = formulario.dataset.editando || "";
    if (!editando && etapaAtual < 4) {
      document.querySelector("#etapa-seguir")?.click();
      return;
    }
    if (!travaSalvar.entrar()) return;
    const botaoEnvio = formulario.querySelector('[type="submit"]');
    botaoEnvio.disabled = true;
    const estado = document.querySelector("#nova-status");
    try {
    if (editando && fichaAberta) {
      const plano = payloadEdicao(lerCamposEdicao(formulario), fichaAberta);
      if (!plano.ok) {
        aviso(estado, plano.mensagem);
        return;
      }
      const capaNova = formulario.querySelector('[name="capa"]').files[0] || null;
      const pdfNovo = formulario.querySelector('[name="pdf"]').files[0] || null;
      if (capaNova) {
        const validacao = validarCapa({
          tipo: capaNova.type,
          tamanho: capaNova.size,
          bytes: await bytesDoArquivo(capaNova, 16),
        });
        if (!validacao.ok) {
          aviso(estado, validacao.mensagem);
          return;
        }
      }
      if (pdfNovo) {
        const validacao = validarPdf({
          nome: pdfNovo.name,
          tipo: pdfNovo.type,
          tamanho: pdfNovo.size,
          bytes: await bytesDoArquivo(pdfNovo, 5),
        });
        if (!validacao.ok) {
          aviso(estado, validacao.mensagem);
          return;
        }
      }
      if (!plano.alterouTexto && !capaNova && !pdfNovo) {
        aviso(estado, "Nada foi alterado.");
        return;
      }
      if (!loja?.configurada) {
        aviso(estado, "Nada foi salvo. A atividade só entra na loja quando o banco de dados estiver ligado.");
        return;
      }
      const jaEraDestaque = formulario.dataset.destaqueAtual === "sim";
      if (plano.atividade.destaque && !jaEraDestaque && document.querySelectorAll("#lista-atividades [data-destaque]:checked").length >= 4) {
        aviso(estado, "A vitrine mostra no máximo 4. Tire uma do destaque antes.");
        return;
      }
      let salva = {};
      if (decisao.acao === "editar_campos") {
        const resultado = await loja.editarAtividade(plano.atividade);
        if (!resultado.ok) {
          aviso(estado, resultado.mensagem);
          return;
        }
        salva = resultado.atividade || {};
      }
      let capaUrlSalva = "";
      if (capaNova) {
        const capaEnviada = await loja.enviarCapa(plano.atividade.id, capaNova);
        if (!capaEnviada.ok) {
          aviso(estado, plano.alterouTexto ? `O texto foi salvo, mas a capa não entrou. ${capaEnviada.mensagem}` : capaEnviada.mensagem);
          return;
        }
        const definida = await loja.definirCapa(plano.atividade.id, capaEnviada.url);
        if (!definida?.ok) {
          aviso(estado, "A imagem foi enviada, mas a atividade ainda mostra a capa anterior.");
          return;
        }
        capaUrlSalva = capaEnviada.url;
      }
      let arquivoSalvo = salva.arquivo || fichaAberta.arquivo || "";
      if (pdfNovo) {
        const envio = await loja.substituirPdf(plano.atividade.id, pdfNovo, arquivoSalvo);
        if (!envio?.ok) {
          aviso(estado, plano.alterouTexto || capaNova ? `O restante foi salvo. ${envio?.mensagem || "O PDF atual foi mantido."}` : (envio?.mensagem || "O PDF atual foi mantido."));
          return;
        }
        arquivoSalvo = envio.arquivo || arquivoSalvo;
        if (atividadeEmEdicao && envio.anterior) atividadeEmEdicao.pdfAnterior = envio.anterior;
      }
      if (atividadeEmEdicao) {
        Object.assign(atividadeEmEdicao, plano.atividade, {
          foraDoBanco: false,
          arquivo: arquivoSalvo,
          capa: capaUrlSalva || atividadeEmEdicao.capa,
        });
        if (pdfNovo) {
          atividadeEmEdicao.pdfInfo = { ok: true, pdf: { nome: arquivoSalvo, atualizado: new Date().toISOString() } };
        }
        document.dispatchEvent(new CustomEvent("atividade-salva", { detail: { ...atividadeEmEdicao } }));
      }
      atualizarCartao(plano.atividade);
      aviso(estado, "Alterações salvas.", true);
      avisarLista("Alterações salvas.");
      limparEdicao(formulario);
      definirTrabalho(false);
      return;
    }
    const leitura = lerCadastro(formulario, existentes, editando);
    if (leitura.erro) {
      aviso(estado, leitura.erro);
      if (/capa/i.test(leitura.erro)) mostrarEtapa(formulario, 3);
      else if (/texto da página|quantidade|formato/i.test(leitura.erro)) mostrarEtapa(formulario, 2);
      else mostrarEtapa(formulario, 1);
      return;
    }
    const atividade = leitura.atividade;
    if (!loja?.configurada) {
      mostrarPrevia(atividade);
      aviso(estado, "Nada foi salvo. A atividade só entra na loja quando o banco de dados estiver ligado.", true);
      return;
    }
    const jaEraDestaque = formulario.dataset.destaqueAtual === "sim";
    if (atividade.destaque && !jaEraDestaque && document.querySelectorAll("#lista-atividades [data-destaque]:checked").length >= 4) {
      aviso(estado, "A vitrine mostra no máximo 4. Tire uma do destaque antes.");
      return;
    }
    if (editando) {
      const gravar = atividadeEmEdicao?.foraDoBanco ? loja.criarAtividade(atividade) : loja.editarAtividade(atividade);
      const resultado = await gravar;
      if (!resultado.ok) {
        aviso(estado, resultado.mensagem);
        return;
      }
      const salva = resultado.atividade || {};
      let capaUrlSalva = "";
      if (atividade.capa) {
        const capaEnviada = await loja.enviarCapa(atividade.id, atividade.capa);
        if (!capaEnviada.ok) {
          aviso(estado, `O texto foi salvo, mas a capa não entrou. ${capaEnviada.mensagem}`);
          return;
        }
        capaUrlSalva = capaEnviada.url;
        await loja.definirCapa(atividade.id, capaEnviada.url);
      }
      if (atividade.pdf) {
        const envio = await loja.substituirPdf(atividade.id, atividade.pdf, salva.arquivo || atividadeEmEdicao?.arquivo || "");
        if (!envio?.ok) {
          aviso(estado, `O texto foi salvo. ${envio?.mensagem || "O PDF atual foi mantido."}`);
          return;
        }
      }
      if (atividadeEmEdicao) {
        Object.assign(atividadeEmEdicao, {
          titulo: atividade.titulo,
          resumo: atividade.resumo,
          explicacao: atividade.explicacao,
          preco: atividade.preco,
          destaque: atividade.destaque,
          area: atividade.area,
          tema: atividade.tema,
          inclui: atividade.inclui,
          habilidades: atividade.habilidades,
          informacoes: atividade.informacoes,
          foraDoBanco: false,
          arquivo: salva.arquivo || atividadeEmEdicao.arquivo,
        });
        if (capaUrlSalva) atividadeEmEdicao.capa = capaUrlSalva;
        if (atividade.pdf) {
          atividadeEmEdicao.pdfInfo = { ok: true, pdf: { nome: atividade.pdf.name, atualizado: new Date().toISOString() } };
        }
        document.dispatchEvent(new CustomEvent("atividade-salva", { detail: { ...atividadeEmEdicao } }));
      }
      atualizarCartao(atividade);
      const link = document.createElement("a");
      link.href = paginaAtividade(atividade.id);
      link.textContent = "Abrir a página exclusiva";
      const status = document.querySelector("#admin-status");
      if (status) {
        status.classList.add("aviso-ok");
        status.replaceChildren("Alterações salvas. ", link);
      }
      limparEdicao(formulario);
      definirTrabalho(false);
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
    const registro = {
      ...criada,
      titulo: atividade.titulo,
      preco: atividade.preco,
      resumo: atividade.resumo,
      explicacao: atividade.explicacao,
      area: atividade.area,
      tema: atividade.tema,
      inclui: atividade.inclui,
      habilidades: atividade.habilidades,
      informacoes: atividade.informacoes,
      destaque: atividade.destaque,
      capa: capaEnviada.url,
      foraDoBanco: false,
    };
    if (aoCriar) aoCriar(registro);
    if (atividade.pdf) {
      const envio = await loja.substituirPdf(atividade.id, atividade.pdf, criada.arquivo || "");
      if (!envio?.ok) {
        aviso(estado, `A atividade foi criada. ${envio?.mensagem || "O PDF atual foi mantido."}`);
        return;
      }
    }
    formulario.reset();
    formulario.querySelector('[name="preco"]').value = "10";
    formulario.querySelector('[name="info_formato"]').value = "PDF para impressão";
    document.querySelector("#capa-mini").hidden = true;
    document.querySelector("#previa-atividade").hidden = true;
    const nomeCapa = document.querySelector("#nome-capa");
    const nomePdf = document.querySelector("#nome-pdf");
    if (nomeCapa) nomeCapa.textContent = "";
    if (nomePdf) nomePdf.textContent = "";
    mostrarEtapa(formulario, 1);
    const link = document.createElement("a");
    link.href = paginaAtividade(atividade.id);
    link.textContent = "Abrir a página exclusiva";
    const status = document.querySelector("#admin-status");
    if (status) {
      status.classList.add("aviso-ok");
      status.replaceChildren("Atividade criada. O card já entra na loja. ", link);
    }
    definirTrabalho(false);
    } finally {
      travaSalvar.sair();
      botaoEnvio.disabled = false;
    }
  });
}
