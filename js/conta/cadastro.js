import { aviso } from "./avisos.js";
import { dinheiro, linhas } from "../texto.js";
import { areas, temasPorArea } from "../temas.js";

let capaUrl = "";
let atividadeEmEdicao = null;
let etapaAtual = 1;

function textoLista(valor) {
  return Array.isArray(valor) ? valor.filter(Boolean).join("\n") : String(valor || "");
}

function valorInformacao(atividade, rotulo) {
  const pares = Array.isArray(atividade.informacoes) ? atividade.informacoes : [];
  const achado = pares.find((par) => Array.isArray(par) && par[0] === rotulo);
  return achado ? String(achado[1] || "") : "";
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
    ["Capa", formulario.querySelector('[name="capa"]').files[0]?.name || (formulario.dataset.editando ? "Mantém a capa atual, se já houver" : "Não escolhida")],
    ["PDF", formulario.querySelector('[name="pdf"]').files[0]?.name || "Não escolhido nesta etapa"],
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

function definirTrabalho(aberto) {
  const caixa = document.querySelector("#cadastro-atividade");
  const lista = document.querySelector("#lista-trabalho");
  if (caixa) caixa.hidden = !aberto;
  if (lista) lista.hidden = aberto;
}

function mostrarEtapa(formulario, numero) {
  etapaAtual = numero;
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
  delete formulario.dataset.editando;
  delete formulario.dataset.destaqueAtual;
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
  if (nomeCapa) nomeCapa.textContent = "";
  if (nomePdf) nomePdf.textContent = "";
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

export function abrirEdicao(atividade) {
  const formulario = document.querySelector("#nova-atividade");
  atividadeEmEdicao = atividade;
  formulario.dataset.editando = atividade.id;
  formulario.dataset.destaqueAtual = atividade.destaque !== false && !atividade.foraDoBanco ? "sim" : "";
  formulario.querySelector('[name="titulo"]').value = atividade.titulo || "";
  formulario.querySelector('[name="preco"]').value = Number(atividade.preco) || "";
  formulario.querySelector('[name="destaque"]').checked = atividade.destaque !== false && !atividade.foraDoBanco;
  formulario.querySelector('[name="resumo"]').value = atividade.resumo || "";
  formulario.querySelector('[name="explicacao"]').value = textoLista(atividade.explicacao);
  formulario.querySelector('[name="habilidades"]').value = textoLista(atividade.habilidades);
  formulario.querySelector('[name="inclui"]').value = textoLista(atividade.inclui);
  formulario.querySelector('[name="info_area"]').value = valorInformacao(atividade, "Área do conhecimento");
  formulario.querySelector('[name="info_categoria"]').value = valorInformacao(atividade, "Categoria");
  formulario.querySelector('[name="info_subcategoria"]').value = valorInformacao(atividade, "Subcategoria");
  formulario.querySelector('[name="info_operacao"]').value = valorInformacao(atividade, "Operação");
  formulario.querySelector('[name="info_campo"]').value = valorInformacao(atividade, "Campo numérico");
  formulario.querySelector('[name="info_quantidade"]').value = valorInformacao(atividade, "Quantidade");
  formulario.querySelector('[name="info_recursos"]').value = valorInformacao(atividade, "Recursos");
  formulario.querySelector('[name="info_formato"]').value = valorInformacao(atividade, "Formato") || "PDF para impressão";
  const area = formulario.querySelector('[name="area"]');
  area.value = areas.includes(atividade.area) ? atividade.area : "";
  preencherTemas(area.value, atividade.tema || "");
  document.querySelector("#titulo-nova").textContent = "Editar atividade";
  document.querySelector("#cadastro-aviso").textContent = "Altere o texto, o valor, a capa ou o PDF. Os campos preenchidos continuam aqui até você salvar ou cancelar.";
  formulario.querySelector('[type="submit"]').textContent = "Salvar alterações";
  document.querySelector("#cancelar-edicao").hidden = false;
  document.querySelector("#previa-atividade").hidden = true;
  definirTrabalho(true);
  mostrarEtapa(formulario, 1);
  if (location.hash !== "#atividades") location.hash = "atividades";
  caixa?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (titulo.length < 3) return { erro: "Diga qual é a atividade." };
  if (!idAtual && !capa) return { erro: "Escolha a imagem da capa." };
  if (capa && !/^image\/(jpeg|png|webp)$/.test(capa.type)) return { erro: "A capa precisa ser JPG, PNG ou WebP." };
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
  formulario.dataset.ligado = loja?.configurada ? "sim" : "";
  if (loja?.configurada) {
    avisoCadastro.textContent = "O banco está ligado. Ao publicar, a atividade entra na loja.";
    botao.textContent = "Publicar atividade";
  }
  mostrarEtapa(formulario, 1);

  const marcarArquivo = (campo, destino, prefixo) => {
    formulario.querySelector(`[name="${campo}"]`).addEventListener("change", () => {
      const arquivo = formulario.querySelector(`[name="${campo}"]`).files[0];
      const alvo = document.querySelector(destino);
      if (alvo) alvo.textContent = arquivo ? `${prefixo}: ${arquivo.name}` : "";
    });
  };
  marcarArquivo("pdf", "#nome-pdf", "Arquivo selecionado");
  marcarArquivo("capa", "#nome-capa", "Capa selecionada");

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

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (etapaAtual < 4) {
      document.querySelector("#etapa-seguir")?.click();
      return;
    }
    const estado = document.querySelector("#nova-status");
    const editando = formulario.dataset.editando || "";
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
        const envio = await loja.enviarPdf(atividade.id, atividade.pdf, salva.arquivo || atividadeEmEdicao?.arquivo || `${atividade.id}.pdf`);
        if (!envio.ok) {
          aviso(estado, `O texto foi salvo, mas o PDF não entrou. ${envio.mensagem}`);
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
      link.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
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
      const envio = await loja.enviarPdf(atividade.id, atividade.pdf, criada.arquivo);
      if (!envio.ok) {
        aviso(estado, `A atividade foi criada, mas o PDF não entrou. ${envio.mensagem}`);
        return;
      }
      document.dispatchEvent(new CustomEvent("atividade-salva", {
        detail: {
          id: atividade.id,
          arquivo: criada.arquivo,
          pdfInfo: { ok: true, pdf: { nome: atividade.pdf.name, atualizado: new Date().toISOString() } },
        },
      }));
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
    link.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
    link.textContent = "Abrir a página exclusiva";
    const status = document.querySelector("#admin-status");
    if (status) {
      status.classList.add("aviso-ok");
      status.replaceChildren("Atividade criada. O card já entra na loja. ", link);
    }
    definirTrabalho(false);
  });
}
