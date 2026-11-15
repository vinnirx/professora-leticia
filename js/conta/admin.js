import { formatarTamanho, validarPdf } from "../pdf-troca.js";
import { criarTrava } from "../trava.js";
import { abrirEdicao, prepararCadastro } from "./cadastro.js?v=6";
import { prepararEquipe } from "./equipe.js";
import { aviso, moeda, quando } from "./avisos.js";
import { administra, podeFinanceiro, rotuloPapel } from "./papeis.js";
import { agruparPedidos, resumirVendas } from "./grupos-pedido.js";
import { fecharCaixa, linhaExportada, origemFinanceira } from "./caixa.js";
import { celulaCsv } from "./csv.js";
import { montarSegundoFator } from "./mfa.js";
import { acionarSaida } from "./saida.js";
import { paginaAtividade, rota } from "../rotas.js";

const travaPdf = criarTrava();

const SECOES = ["visao", "atividades", "arquivos", "pedidos", "financeiro", "clientes", "suporte", "equipe", "configuracoes"];

function rotuloStatus(status) {
  if (status === "pago") return ["Pago", "ok"];
  if (status === "estornado") return ["Estornado", "problema"];
  if (status === "cancelado") return ["Cancelado", "neutro"];
  return ["Aguardando", "espera"];
}

function secaoAtual() {
  const nome = location.hash.replace("#", "");
  return SECOES.includes(nome) ? nome : "visao";
}

function mostrarSecao(nome) {
  document.querySelectorAll("[data-painel]").forEach((secao) => {
    secao.hidden = secao.dataset.painel !== nome;
  });
  document.querySelectorAll("[data-secao]").forEach((botao) => {
    if (botao.dataset.secao === nome) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  });
}

function diaLocal(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function chavePeriodo(data, modo) {
  const fuso = { timeZone: "America/Sao_Paulo" };
  if (modo === "ano") return new Intl.DateTimeFormat("pt-BR", { ...fuso, year: "numeric" }).format(data);
  if (modo === "mes") return new Intl.DateTimeFormat("pt-BR", { ...fuso, month: "long", year: "numeric" }).format(data);
  return new Intl.DateTimeFormat("pt-BR", { ...fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(data);
}

function dentroDoIntervalo(iso, inicio, fim) {
  const dia = diaLocal(iso);
  if (inicio && dia < inicio) return false;
  if (fim && dia > fim) return false;
  return true;
}

function categoriaDe(atividade) {
  const pares = Array.isArray(atividade.informacoes) ? atividade.informacoes : [];
  const achado = pares.find((par) => Array.isArray(par) && par[0] === "Categoria");
  return achado ? String(achado[1] || "") : "";
}

function celula(rotulo, conteudo, classe) {
  const td = document.createElement("td");
  td.dataset.rotulo = rotulo;
  if (classe) td.className = classe;
  if (conteudo instanceof Node) td.append(conteudo);
  else td.textContent = conteudo ?? "";
  return td;
}

function montarTabela(colunas, linhas, larguras, extraClasse) {
  const tabela = document.createElement("table");
  tabela.className = extraClasse ? `tabela-admin ${extraClasse}` : "tabela-admin";
  if (larguras?.length) {
    const grupo = document.createElement("colgroup");
    larguras.forEach((largura) => {
      const col = document.createElement("col");
      if (largura) col.style.width = largura;
      grupo.append(col);
    });
    tabela.append(grupo);
  }
  const thead = document.createElement("thead");
  const cabecalho = document.createElement("tr");
  colunas.forEach((coluna, indice) => {
    const th = document.createElement("th");
    th.scope = "col";
    const partes = coluna.split(" ");
    if (partes.length > 1) {
      partes.forEach((parte, indiceParte) => {
        if (indiceParte) th.append(document.createElement("br"));
        th.append(parte);
      });
    } else {
      th.textContent = coluna;
    }
    if (["Preço", "Valor", "Valor bruto", "Pedidos pagos", "Materiais pagos", "Unidades", "Receita bruta"].includes(coluna)) th.className = "numero";
    if (coluna === "Destaque") th.className = "centro";
    cabecalho.append(th);
  });
  thead.append(cabecalho);
  const corpo = document.createElement("tbody");
  linhas.forEach((linha) => {
    linha.tr.append(...linha.celulas);
    corpo.append(linha.tr);
  });
  tabela.append(thead, corpo);
  return tabela;
}

function vazio(texto, detalhe) {
  const caixa = document.createElement("div");
  caixa.className = "estado-vazio";
  const titulo = document.createElement("p");
  titulo.className = "estado-vazio-titulo";
  titulo.textContent = texto;
  caixa.append(titulo);
  if (detalhe) {
    const extra = document.createElement("p");
    extra.textContent = detalhe;
    caixa.append(extra);
  }
  return caixa;
}

function selo(texto, tipo) {
  const marca = document.createElement("span");
  marca.className = `etiqueta etiqueta-${tipo}`;
  marca.textContent = texto;
  return marca;
}

function tituloDuas(texto, campo) {
  const nome = document.createElement("strong");
  nome.className = "titulo-duas";
  if (campo) nome.dataset.campo = campo;
  nome.textContent = texto;
  nome.title = texto;
  return nome;
}

function pessoa(nome, email) {
  const caixa = document.createElement("div");
  caixa.className = "pessoa";
  const forte = document.createElement("strong");
  forte.textContent = nome;
  caixa.append(forte);
  if (email) {
    const linha = document.createElement("span");
    linha.className = "email-quebra";
    linha.textContent = email;
    caixa.append(linha);
  }
  return caixa;
}

function fecharMenus() {
  document.querySelectorAll(".menu-acoes-lista").forEach((lista) => {
    lista.hidden = true;
    lista.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

function menuAcoes(itens) {
  const envoltorio = document.createElement("div");
  envoltorio.className = "menu-acoes";
  const gatilho = document.createElement("button");
  gatilho.type = "button";
  gatilho.className = "botao botao-secundario botao-icone";
  gatilho.setAttribute("aria-label", "Mais ações");
  gatilho.setAttribute("aria-expanded", "false");
  gatilho.textContent = "⋯";
  const lista = document.createElement("div");
  lista.className = "menu-acoes-lista";
  lista.hidden = true;
  itens.forEach((item) => {
    const controle = item.href ? document.createElement("a") : document.createElement("button");
    if (item.href) {
      controle.href = item.href;
    } else {
      controle.type = "button";
      controle.addEventListener("click", item.aoClicar);
    }
    controle.textContent = item.texto;
    lista.append(controle);
  });
  gatilho.addEventListener("click", (evento) => {
    evento.stopPropagation();
    const vaiAbrir = lista.hidden;
    fecharMenus();
    lista.hidden = !vaiAbrir;
    gatilho.setAttribute("aria-expanded", String(vaiAbrir));
  });
  envoltorio.append(gatilho, lista);
  return envoltorio;
}

function botaoAcao(texto, aoClicar, extra) {
  const botao = document.createElement("button");
  botao.className = extra === "principal" ? "botao" : `botao botao-secundario${extra ? ` ${extra}` : ""}`;
  botao.type = "button";
  botao.textContent = texto;
  botao.addEventListener("click", aoClicar);
  return botao;
}

function indicador(rotulo, valor, nota) {
  const artigo = document.createElement("article");
  artigo.className = "indicador";
  const nome = document.createElement("span");
  nome.textContent = rotulo;
  const forte = document.createElement("strong");
  forte.textContent = valor;
  if (valor === "Não disponível") forte.classList.add("valor-ausente");
  artigo.append(nome, forte);
  if (nota) {
    const info = document.createElement("span");
    info.className = "indicador-info";
    info.tabIndex = 0;
    info.title = nota;
    info.setAttribute("aria-label", nota);
    info.textContent = "Saiba mais";
    artigo.append(info);
  }
  return artigo;
}

function indisponivel() {
  return "Não disponível";
}

function nomeCliente(grupo) {
  return grupo.perfis?.nome || "Sem nome";
}

function materiaisDe(grupo) {
  return grupo.itens.map((item) => item.titulo).join(", ");
}

function listaMateriais(grupo) {
  const lista = document.createElement("div");
  lista.className = "materiais-lista";
  grupo.itens.forEach((item) => {
    const linha = document.createElement("span");
    linha.textContent = item.titulo || "Atividade";
    lista.append(linha);
  });
  return lista;
}

function leituraFinanceira(grupo, memoria) {
  const encontradas = memoria.cobrancasDisponiveis
    ? memoria.cobrancas.filter((item) => item.txid === grupo.txid)
    : [];
  const cobranca = encontradas.find((item) => item.taxa != null && item.valor_liquido != null) || encontradas[0] || null;
  return origemFinanceira(grupo, cobranca, memoria.cobrancasDisponiveis);
}

function dinheiroOuAviso(valor) {
  return valor == null ? selo(indisponivel(), "neutro") : moeda.format(valor);
}

function filtrarGrupos(grupos, { inicio, fim, status, busca }) {
  const termo = (busca || "").trim().toLocaleLowerCase("pt-BR");
  return grupos.filter((grupo) => {
    if (status && grupo.status !== status) return false;
    if (!dentroDoIntervalo(grupo.criado_em, inicio, fim)) return false;
    if (!termo) return true;
    const texto = `${nomeCliente(grupo)} ${grupo.perfis?.email || ""} ${grupo.txid} ${materiaisDe(grupo)}`.toLocaleLowerCase("pt-BR");
    return texto.includes(termo);
  });
}

export async function iniciarAdmin(loja) {
  const bloqueio = document.querySelector("#admin-bloqueio");
  const status = document.querySelector("#admin-status");
  const app = document.querySelector("#painel-app");

  if (!loja?.configurada) {
    app.classList.add("liberado");
    app.hidden = false;
    document.querySelector("#lista-trabalho").hidden = true;
    document.querySelector("#cadastro-atividade").hidden = false;
    location.hash = "atividades";
    bloqueio.hidden = false;
    bloqueio.textContent = "Você pode preencher o cadastro e ver a prévia. A atividade só é salva na loja quando o banco de dados estiver ligado.";
    prepararCadastro(loja, new Set());
    return;
  }

  const sessao = await loja.sessao();
  if (!sessao?.user?.id) {
    location.href = `${rota("entrar/")}?depois=${encodeURIComponent("admin.html")}`;
    return;
  }
  const confirmada = await loja.usuarioConfirmado();
  if (!confirmada.ok || confirmada.id !== sessao.user.id) {
    app?.remove();
    bloqueio.hidden = false;
    bloqueio.textContent = confirmada.mensagem || "Esta sessão não está mais ativa. Entre de novo.";
    const volta = document.createElement("a");
    volta.className = "botao";
    volta.href = `${rota("entrar/")}?depois=${encodeURIComponent("admin.html")}`;
    volta.textContent = "Entrar de novo";
    bloqueio.insertAdjacentElement("afterend", volta);
    return;
  }
  const dados = await loja.perfil();
  if (!administra(dados?.papel)) {
    app?.remove();
    bloqueio.hidden = false;
    bloqueio.textContent = "Esta área é só de quem administra a loja.";
    const volta = document.createElement("a");
    volta.className = "botao";
    volta.href = rota("minha-conta/");
    volta.textContent = "Voltar à Minha conta";
    bloqueio.insertAdjacentElement("afterend", volta);
    return;
  }

  document.querySelectorAll("[data-secao]").forEach((botao) => {
    botao.addEventListener("click", () => {
      if (botao.dataset.secao === "atividades") document.dispatchEvent(new CustomEvent("mostrar-lista-atividades"));
      if (location.hash === `#${botao.dataset.secao}`) mostrarSecao(botao.dataset.secao);
      else location.hash = botao.dataset.secao;
    });
  });
  document.querySelectorAll("[data-painel]").forEach((secao) => {
    if (secao.dataset.painel === "visao" || secao.querySelector(".voltar-visao")) return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao botao-secundario voltar-visao";
    botao.textContent = "Voltar à visão geral";
    botao.addEventListener("click", () => {
      location.hash = "visao";
    });
    const cabeca = secao.querySelector(".secao-cabeca");
    if (cabeca) cabeca.append(botao);
    else secao.prepend(botao);
  });
  ["#cadastro-atividade .secao-cabeca", "#ficha-edicao .secao-cabeca"].forEach((seletor) => {
    const cabeca = document.querySelector(seletor);
    if (!cabeca || cabeca.querySelector(".voltar-visao")) return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao botao-secundario voltar-visao";
    botao.textContent = "Voltar à visão geral";
    botao.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("mostrar-lista-atividades"));
      location.hash = "visao";
    });
    cabeca.append(botao);
  });
  const aplicarSecao = () => mostrarSecao(secaoAtual());
  window.addEventListener("hashchange", aplicarSecao);
  aplicarSecao();

  app.classList.add("liberado");
  app.hidden = false;
  const cargo = document.querySelector("#painel-cargo");
  const saudacao = document.querySelector("#painel-saudacao");
  if (cargo) cargo.textContent = rotuloPapel(dados?.papel);
  if (saudacao) saudacao.textContent = dados?.nome ? `Olá, ${dados.nome}` : "Painel da loja";
  const sair = document.querySelector("#sair");
  sair.hidden = false;
  sair.addEventListener("click", () => {
    acionarSaida(sair, () => loja.sair());
  });
  montarSegundoFator(loja, document.querySelector("#segundo-fator"));

  let painel;
  let atividades = [];
  try {
    [painel, atividades] = await Promise.all([loja.painel(), loja.atividades()]);
  } catch {
    aviso(status, "Não foi possível carregar o painel.");
    return;
  }

  const porId = new Map(atividades.map((item) => [item.id, item]));
  (window.loja?.atividades || []).forEach((local) => {
    const existente = porId.get(local.id);
    if (existente) {
      if (!existente.capa && local.imagem) existente.capa = local.imagem;
      return;
    }
    porId.set(local.id, {
      id: local.id,
      titulo: local.titulo,
      preco: local.preco,
      resumo: local.resumo,
      explicacao: local.explicacao,
      habilidades: local.habilidades,
      inclui: local.inclui,
      area: local.area,
      tema: (local.temas || [])[0] || "",
      informacoes: local.informacoes,
      arquivo: local.download,
      capa: local.imagem || "",
      destaque: local.destaque !== false,
      foraDoBanco: true,
    });
  });

  const memoria = {
    contas: painel.contas,
    pedidos: painel.pedidos,
    cobrancas: painel.cobrancas || [],
    cobrancasDisponiveis: painel.cobrancasDisponiveis === true,
    paginaClientes: 0,
    atividades: [...porId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
    periodo: "dia",
  };

  const idsBanco = memoria.atividades.filter((item) => !item.foraDoBanco).map((item) => ({
    id: item.id,
    arquivo: item.arquivo || "",
    arquivo_anterior: item.arquivo_anterior || "",
  }));
  if (loja.arquivosPdf) {
    loja.arquivosPdf(idsBanco).then((mapa) => {
      memoria.atividades.forEach((item) => {
        if (item.foraDoBanco || !Object.hasOwn(mapa, item.id)) return;
        item.pdfInfo = mapa[item.id];
        item.pdfAnterior = mapa[item.id].ok ? (mapa[item.id].anterior || "") : (item.arquivo_anterior || "");
      });
      pintarArquivos();
    }).catch(() => {
      aviso(document.querySelector("#arquivos-status"), "Não foi possível verificar os PDFs agora.");
    });
  }

  const areas = [...new Set(memoria.atividades.map((item) => item.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const categorias = [...new Set(memoria.atividades.map(categoriaDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtroArea = document.querySelector("#filtro-area-lista");
  const filtroCategoria = document.querySelector("#filtro-categoria-lista");
  areas.forEach((nome) => {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    filtroArea.append(opcao);
  });
  categorias.forEach((nome) => {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    filtroCategoria.append(opcao);
  });

  function grupos() {
    return agruparPedidos(memoria.pedidos);
  }

  function pintarVisao() {
    const pagos = grupos().filter((grupo) => grupo.status === "pago");
    const unidades = memoria.pedidos.filter((pedido) => pedido.status === "pago").length;
    const caixaVisao = fecharCaixa(pagos, memoria.cobrancas, memoria.cobrancasDisponiveis);
    const caixa = document.querySelector("#indicadores-visao");
    const apoioVisao = document.querySelector("#indicadores-visao-apoio");
    if (podeFinanceiro(dados)) {
      caixa.replaceChildren(
        indicador("Receita bruta", moeda.format(pagos.reduce((soma, grupo) => soma + grupo.valor, 0)), "Só pedidos pagos"),
        indicador("Receita líquida", caixaVisao.liquido == null ? indisponivel() : moeda.format(caixaVisao.liquido), caixaVisao.motivo),
      );
    } else caixa.replaceChildren();
    if (apoioVisao) {
      apoioVisao.replaceChildren(
        indicador("Vendas confirmadas", String(pagos.length), "Um código de pedido conta uma vez"),
        indicador("Atividades vendidas", String(unidades), "Cada material pago conta uma unidade"),
      );
    }
    const atalhos = document.querySelector("#atalhos-visao");
    atalhos.replaceChildren();
    [
      ["Ver atividades", "atividades", "principal"],
      ["Ver pedidos", "pedidos", ""],
      ...(podeFinanceiro(dados) ? [["Ver financeiro", "financeiro", ""]] : []),
    ].forEach(([texto, secao, estilo]) => {
      atalhos.append(botaoAcao(texto, () => {
        if (secao === "atividades") document.dispatchEvent(new CustomEvent("mostrar-lista-atividades"));
        location.hash = secao;
      }, estilo));
    });
    const recentes = document.querySelector("#vendas-recentes");
    const lista = grupos().slice(0, 5);
    if (!lista.length) {
      recentes.replaceChildren(vazio("Nenhuma venda registrada."));
    } else {
      const colunasRecentes = podeFinanceiro(dados)
        ? ["Data", "Pedido", "Cliente", "Valor", "Status"]
        : ["Data", "Pedido", "Cliente", "Status"];
      recentes.replaceChildren(montarTabela(
        colunasRecentes,
        lista.map((grupo) => ({
          tr: document.createElement("tr"),
          celulas: [
            celula("Data", quando.format(new Date(grupo.criado_em))),
            celula("Pedido", grupo.txid),
            celula("Cliente", nomeCliente(grupo)),
            ...(podeFinanceiro(dados) ? [celula("Valor", moeda.format(grupo.valor), "numero")] : []),
            celula("Status", selo(...rotuloStatus(grupo.status))),
          ],
        })),
      ));
    }
    const ranking = new Map();
    memoria.pedidos.filter((pedido) => pedido.status === "pago").forEach((pedido) => {
      const atual = ranking.get(pedido.titulo) || { quantidade: 0, valor: 0 };
      atual.quantidade += 1;
      atual.valor += Number(pedido.valor) || 0;
      ranking.set(pedido.titulo, atual);
    });
    const mais = [...ranking.entries()].sort((a, b) => b[1].quantidade - a[1].quantidade).slice(0, 5);
    const destino = document.querySelector("#mais-vendidas");
    if (!mais.length) destino.replaceChildren(vazio("Nenhuma atividade vendida com pagamento confirmado."));
    else {
      const colunasRanking = podeFinanceiro(dados)
        ? ["Atividade", "Unidades", "Receita bruta"]
        : ["Atividade", "Unidades"];
      destino.replaceChildren(montarTabela(
        colunasRanking,
        mais.map(([nome, info]) => ({
          tr: document.createElement("tr"),
          celulas: [
            celula("Atividade", nome),
            celula("Unidades", String(info.quantidade)),
            ...(podeFinanceiro(dados) ? [celula("Receita bruta", moeda.format(info.valor))] : []),
          ],
        })),
      ));
    }
  }

  function atividadesFiltradas() {
    const termo = document.querySelector("#busca-atividade").value.trim().toLocaleLowerCase("pt-BR");
    const area = filtroArea.value;
    const categoria = filtroCategoria.value;
    const destaque = document.querySelector("#filtro-destaque-lista").value;
    return memoria.atividades.filter((item) => {
      if (termo && !item.titulo.toLocaleLowerCase("pt-BR").includes(termo)) return false;
      if (area && item.area !== area) return false;
      if (categoria && categoriaDe(item) !== categoria) return false;
      const emDestaque = item.destaque !== false && !item.foraDoBanco;
      if (destaque === "sim" && !emDestaque) return false;
      if (destaque === "nao" && emDestaque) return false;
      return true;
    });
  }

  function pintarAtividades() {
    const lista = document.querySelector("#lista-atividades");
    const visiveis = new Set(atividadesFiltradas().map((item) => item.id));
    if (!memoria.atividades.length) {
      lista.replaceChildren(vazio("Nenhuma atividade no site ainda."));
      return;
    }
    const resumoLista = document.querySelector("#atividades-resumo");
    if (resumoLista) {
      const cadastradas = memoria.atividades.filter((item) => !item.foraDoBanco).length;
      resumoLista.textContent = cadastradas
        ? `${cadastradas} ${cadastradas === 1 ? "material cadastrado" : "materiais cadastrados"}. Editar abre a ficha do material. Nova atividade abre o cadastro completo.`
        : "Nenhum material cadastrado ainda. Nova atividade abre o cadastro completo.";
    }
    const tabela = montarTabela(
      ["Capa", "Atividade", "Categoria", "Preço", "PDF", "Destaque", "Ações"],
      memoria.atividades.map((atividade) => {
        const tr = document.createElement("tr");
        tr.dataset.atividade = atividade.id;
        tr.hidden = !visiveis.has(atividade.id);
        const capa = document.createElement("span");
        capa.className = "capa-admin";
        if (atividade.capa) {
          const img = document.createElement("img");
          img.src = atividade.capa;
          img.alt = "";
          capa.append(img);
        } else capa.textContent = "Sem capa";
        const preco = document.createElement("span");
        preco.dataset.campo = "preco";
        preco.textContent = moeda.format(Number(atividade.preco) || 0);
        const destaque = document.createElement("label");
        destaque.className = "interruptor";
        const caixa = document.createElement("input");
        caixa.type = "checkbox";
        caixa.dataset.destaque = atividade.id;
        caixa.checked = atividade.destaque !== false && !atividade.foraDoBanco;
        caixa.setAttribute("aria-label", `Destaque de ${atividade.titulo}`);
        caixa.addEventListener("change", async () => {
          const ligar = caixa.checked;
          const marcadas = document.querySelectorAll("#lista-atividades [data-destaque]:checked").length;
          if (ligar && marcadas > 4) {
            caixa.checked = false;
            aviso(status, "A vitrine mostra no máximo 4. Tire uma do destaque antes.");
            return;
          }
          if (atividade.foraDoBanco) {
            caixa.checked = !ligar;
            aviso(status, "Essa atividade ainda não está no banco, então a escolha não fica salva.");
            return;
          }
          caixa.disabled = true;
          const resultado = await loja.definirDestaque(atividade.id, ligar);
          caixa.disabled = false;
          if (!resultado.ok) {
            caixa.checked = !ligar;
            aviso(status, resultado.mensagem);
            return;
          }
          atividade.destaque = ligar;
          aviso(status, ligar ? "Entrou em Materiais em destaque." : "Saiu de Materiais em destaque.", true);
        });
        const trilho = document.createElement("span");
        trilho.className = "interruptor-trilho";
        const leitor = document.createElement("span");
        leitor.className = "so-leitor";
        leitor.textContent = "Em destaque";
        destaque.append(caixa, trilho, leitor);
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        acoes.append(
          botaoAcao("Editar", () => abrirEdicao(atividade)),
          menuAcoes([
            { texto: "Ver na loja", href: paginaAtividade(atividade.id) },
            { texto: "Gerenciar PDF", aoClicar: () => {
              location.hash = "arquivos";
              document.querySelector(`#lista-pdfs [data-atividade="${CSS.escape(atividade.id)}"]`)?.scrollIntoView({ block: "center" });
            } },
          ]),
        );
        return {
          tr,
          celulas: [
            celula("Capa", capa),
            celula("Atividade", tituloDuas(atividade.titulo, "titulo")),
            celula("Categoria", categoriaDe(atividade) || "—"),
            celula("Preço", preco, "numero"),
            celula("PDF", atividade.arquivo || "Sem PDF"),
            celula("Destaque", destaque, "celula-centro"),
            celula("Ações", acoes, "celula-acoes"),
          ],
        };
      }),
      ["4.5rem", "24%", "12%", "6.5rem", "18%", "8rem", "16%"],
    );
    lista.replaceChildren(tabela);
    if (!visiveis.size) lista.prepend(vazio("Nenhuma atividade com esse filtro."));
  }

  function textoPdf(atividade) {
    if (atividade.foraDoBanco) return { arquivo: "—", quando: "—", situacao: "Ainda não está no banco" };
    if (!Object.hasOwn(atividade, "pdfInfo")) return { arquivo: "Verificando…", quando: "Verificando…", situacao: "Verificando" };
    if (!atividade.pdfInfo?.ok) return { arquivo: indisponivel(), quando: indisponivel(), situacao: "Não foi possível verificar" };
    if (!atividade.pdfInfo.pdf && !atividade.arquivo) return { arquivo: "Nenhum", quando: "—", situacao: "Sem PDF" };
    const atualizado = atividade.pdfInfo.pdf?.atualizado ? quando.format(new Date(atividade.pdfInfo.pdf.atualizado)) : indisponivel();
    return { arquivo: atividade.arquivo || atividade.pdfInfo.pdf?.nome || "Nenhum", quando: atualizado, situacao: "PDF no espaço privado" };
  }

  let pdfAlvo = null;

  function abrirPdf(atividade) {
    pdfAlvo = atividade;
    const dialogo = document.querySelector("#pdf-troca");
    const nomeAtual = atividade.arquivo || atividade.pdfInfo?.pdf?.nome || "";
    const temArquivo = Boolean(nomeAtual);
    document.querySelector("#pdf-troca-titulo").textContent = temArquivo ? "Substituir PDF" : "Enviar PDF";
    document.querySelector("#pdf-troca-atividade").textContent = atividade.titulo;
    document.querySelector("#pdf-troca-atual").textContent = nomeAtual
      ? `Arquivo atual: ${nomeAtual}`
      : "Esta atividade ainda não tem PDF.";
    const avisoTroca = document.querySelector("#pdf-troca-aviso");
    if (avisoTroca) {
      avisoTroca.hidden = !temArquivo;
      avisoTroca.textContent = "O PDF atual permanece guardado. Quem já pagou passa a baixar o arquivo novo somente depois da confirmação.";
    }
    const entrada = document.querySelector("#pdf-troca-arquivo");
    entrada.disabled = false;
    entrada.value = "";
    document.querySelector("#pdf-troca-nome").textContent = "Nenhum arquivo escolhido.";
    const confirmar = document.querySelector("#pdf-troca-confirmar");
    confirmar.disabled = true;
    confirmar.textContent = temArquivo ? "Substituir" : "Enviar";
    confirmar.className = temArquivo ? "botao botao-perigo" : "botao";
    dialogo.showModal();
  }

  function pintarArquivos() {
    const lista = document.querySelector("#lista-pdfs");
    if (!memoria.atividades.length) {
      lista.replaceChildren(vazio("Nenhuma atividade cadastrada."));
      return;
    }
    lista.replaceChildren(montarTabela(
      ["Atividade", "Arquivo", "Atualizado", "Situação", "Ações"],
      memoria.atividades.map((atividade) => {
        const info = textoPdf(atividade);
        const tr = document.createElement("tr");
        tr.dataset.atividade = atividade.id;
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        if (!atividade.foraDoBanco) {
          acoes.append(botaoAcao("Visualizar", () => {
            location.href = paginaAtividade(atividade.id);
          }));
          if (atividade.pdfInfo?.pdf || atividade.arquivo) {
            acoes.append(botaoAcao("Baixar", async () => {
              try {
                await loja.baixar(atividade.id);
              } catch (erro) {
                const mensagem = erro?.message === "entrar"
                  ? "Entre de novo para baixar este material."
                  : erro?.message === "negado"
                    ? "Este material ainda não está liberado."
                    : erro?.message === "tentar"
                      ? "O download não respondeu. Tente de novo."
                      : "Esse PDF ainda não está no espaço privado.";
                aviso(document.querySelector("#arquivos-status"), mensagem);
              }
            }));
          }
          acoes.append(botaoAcao(atividade.pdfInfo?.pdf || atividade.arquivo ? "Substituir PDF" : "Enviar PDF", () => abrirPdf(atividade), atividade.pdfInfo?.pdf || atividade.arquivo ? "botao-perigo" : ""));
          if (atividade.pdfAnterior && atividade.arquivo && atividade.pdfAnterior !== atividade.arquivo) {
            acoes.append(botaoAcao("Restaurar anterior", () => restaurarPdf(atividade)));
          }
        }
        acoes.classList.add("acoes-pdf");
        const situacaoPdf = selo(info.situacao === "PDF no espaço privado" ? "Privado" : info.situacao, info.situacao === "PDF no espaço privado" ? "ok" : "neutro");
        situacaoPdf.title = info.situacao;
        const arquivo = document.createElement("span");
        arquivo.className = "titulo-duas";
        arquivo.textContent = info.arquivo;
        arquivo.title = info.arquivo;
        return {
          tr,
          celulas: [
            celula("Atividade", tituloDuas(atividade.titulo)),
            celula("Arquivo", arquivo),
            celula("Atualizado", info.quando),
            celula("Situação", situacaoPdf),
            celula("Ações", acoes, "celula-acoes"),
          ],
        };
      }),
      ["22%", "20%", "14%", "14%", "30%"],
    ));
  }

  function pintarPedidos() {
    const inicio = document.querySelector("#pedidos-inicio").value;
    const fim = document.querySelector("#pedidos-fim").value;
    const situacao = document.querySelector("#pedidos-status").value;
    const busca = document.querySelector("#busca-pedido").value;
    const lista = filtrarGrupos(grupos(), { inicio, fim, status: situacao, busca });
    const destino = document.querySelector("#lista-pedidos");
    if (!lista.length) {
      const temPedidos = grupos().length > 0;
      destino.replaceChildren(vazio(
        temPedidos ? "Nenhum pedido com esse filtro." : "Nenhum pedido ainda.",
        temPedidos ? "Limpe a busca ou amplie o período." : "Quando alguém comprar, o pedido aparece aqui.",
      ));
      return;
    }
    destino.replaceChildren(montarTabela(
      ["Data", "Pedido", "Cliente", "Materiais", "Valor", "Status", "Asaas", "Ações"],
      lista.map((grupo) => {
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        acoes.append(botaoAcao("Ver", () => mostrarPedido(grupo)));
        if (grupo.status !== "pago") {
          acoes.append(botaoAcao("Confirmar Pix", async (evento) => {
            const botao = evento.currentTarget;
            botao.disabled = true;
            const resultado = await loja.confirmar(grupo.itens[0].id);
            botao.disabled = false;
            if (!resultado.ok) {
              aviso(document.querySelector("#pedidos-status-aviso"), resultado.mensagem);
              return;
            }
            memoria.pedidos.forEach((pedido) => {
              if (pedido.txid === grupo.txid && (pedido.usuario_id || "") === (grupo.usuario_id || "")) {
                pedido.status = "pago";
                pedido.confirmacao = "admin";
              }
            });
            aviso(document.querySelector("#pedidos-status-aviso"), "Pix confirmado. O download já está na conta de quem comprou.", true);
            pintarTudo();
          }));
        }
        const leitura = leituraFinanceira(grupo, memoria);
        return {
          tr: document.createElement("tr"),
          celulas: [
            celula("Data", quando.format(new Date(grupo.criado_em))),
            celula("Pedido", grupo.txid, "sem-quebra"),
            celula("Cliente", pessoa(nomeCliente(grupo), grupo.perfis?.email || "")),
            celula("Materiais", listaMateriais(grupo)),
            celula("Valor", moeda.format(grupo.valor), "numero"),
            celula("Status", selo(...rotuloStatus(grupo.status))),
            celula("Asaas", leitura.asaas === "Pix manual" || leitura.asaas === "Não disponível" ? selo(leitura.asaas, "neutro") : Object.assign(document.createElement("span"), { className: "texto-quebra", textContent: leitura.asaas })),
            celula("Ações", acoes, "celula-acoes"),
          ],
        };
      }),
      ["7.2rem", "9.4rem", "13rem", "14rem", "7.4rem", "6.6rem", "7.4rem", "10.5rem"],
      "tabela-larga",
    ));
  }

  function mostrarPedido(grupo) {
    const destino = document.querySelector("#pedido-aberto");
    destino.replaceChildren();
    const titulo = document.createElement("h3");
    titulo.textContent = `Pedido ${grupo.txid}`;
    destino.append(titulo, vazio(`${nomeCliente(grupo)} · ${grupo.perfis?.email || "sem e-mail"} · ${quando.format(new Date(grupo.criado_em))}`));
    destino.append(montarTabela(
      ["Material", "Valor", "Status"],
      grupo.itens.map((item) => ({
        tr: document.createElement("tr"),
        celulas: [
          celula("Material", item.titulo),
          celula("Valor", moeda.format(Number(item.valor) || 0), "numero"),
          celula("Status", selo(...rotuloStatus(item.status))),
        ],
      })),
    ));
    destino.append(vazio("Identificador da cobrança no Asaas: não disponível. A loja ainda não grava esse código."));
  }

  function intervalosFinanceiro() {
    return {
      inicio: document.querySelector("#financeiro-inicio").value,
      fim: document.querySelector("#financeiro-fim").value,
    };
  }

  function pintarFinanceiro() {
    const apoio = document.querySelector("#indicadores-financeiro-apoio");
    const barraFinanceiro = document.querySelector("[data-painel='financeiro'] .filtros-painel");
    if (barraFinanceiro) barraFinanceiro.hidden = !podeFinanceiro(dados);
    if (!podeFinanceiro(dados)) {
      document.querySelector("#indicadores-financeiro").replaceChildren(vazio("O financeiro desta conta não está liberado."));
      if (apoio) apoio.replaceChildren();
      document.querySelector("#grafico-bruto").replaceChildren();
      document.querySelector("#lista-periodos").replaceChildren();
      document.querySelector("#ranking-vendas")?.replaceChildren();
      document.querySelector("#tabela-financeiro").replaceChildren();
      return;
    }
    const { inicio, fim } = intervalosFinanceiro();
    const noPeriodo = memoria.pedidos.filter((pedido) => dentroDoIntervalo(pedido.criado_em, inicio, fim));
    const resumo = resumirVendas(noPeriodo);
    const pagos = noPeriodo.filter((pedido) => pedido.status === "pago");
    const gruposPagos = agruparPedidos(pagos);
    const caixaPeriodo = fecharCaixa(gruposPagos, memoria.cobrancas, memoria.cobrancasDisponiveis);
    const estornos = memoria.cobrancasDisponiveis
      ? memoria.cobrancas.filter((item) => item.status === "estornada" && dentroDoIntervalo(item.atualizado_em, inicio, fim))
      : null;
    document.querySelector("#indicadores-financeiro").replaceChildren(
      indicador("Receita bruta", moeda.format(resumo.bruto), "Soma dos pedidos em que todos os materiais estão pagos. Pendente não entra."),
      indicador("Receita líquida", caixaPeriodo.liquido == null ? indisponivel() : moeda.format(caixaPeriodo.liquido), caixaPeriodo.motivo),
      indicador("Vendas confirmadas", String(resumo.pedidosPagos), "Um código com várias atividades conta uma venda. O valor soma todos os materiais pagos."),
      indicador("Aguardando pagamento", String(resumo.aguardando), "Pedidos ainda não confirmados. Não entram na receita."),
    );
    apoio.replaceChildren(
      indicador("Atividades vendidas", String(resumo.unidadesPagas), "Cada material pago conta uma unidade."),
      indicador("Cancelados ou estornados", String(resumo.encerrados), "Não entram na receita bruta."),
      indicador("Taxas Asaas", caixaPeriodo.taxa == null ? indisponivel() : moeda.format(caixaPeriodo.taxa), caixaPeriodo.taxa == null ? "Há venda sem tarifa gravada. Nenhuma taxa é presumida." : "Pix manual entra com taxa zero. Cobrança Asaas soma a tarifa gravada."),
      indicador("Estornos", estornos == null ? indisponivel() : moeda.format(estornos.reduce((soma, item) => soma + (Number(item.valor_bruto) || 0), 0)), estornos == null ? "O valor do estorno só aparece quando o Asaas gravar a cobrança." : "Soma do bruto das cobranças estornadas neste intervalo. Esses pedidos não entram na receita."),
    );
    const ranking = new Map();
    pagos.forEach((pedido) => {
      const atual = ranking.get(pedido.atividade_id) || { titulo: pedido.titulo, quantidade: 0, bruto: 0 };
      atual.quantidade += 1;
      atual.bruto += Number(pedido.valor) || 0;
      ranking.set(pedido.atividade_id, atual);
    });
    const destinoRanking = document.querySelector("#ranking-vendas");
    const linhasRanking = [...ranking.values()].sort((a, b) => b.quantidade - a.quantidade || b.bruto - a.bruto);
    if (destinoRanking) {
      destinoRanking.replaceChildren(linhasRanking.length
        ? montarTabela(
          ["Atividade", "Unidades", "Receita bruta"],
          linhasRanking.map((item) => ({
            tr: document.createElement("tr"),
            celulas: [
              celula("Atividade", tituloDuas(item.titulo)),
              celula("Unidades", String(item.quantidade), "numero"),
              celula("Receita bruta", moeda.format(item.bruto), "numero"),
            ],
          })),
          ["58%", "18%", "24%"],
        )
        : vazio("Nenhuma atividade vendida nesse intervalo."));
    }
    const mapa = new Map();
    pagos.forEach((pedido) => {
      const chave = chavePeriodo(new Date(pedido.criado_em), memoria.periodo);
      mapa.set(chave, (mapa.get(chave) || 0) + (Number(pedido.valor) || 0));
    });
    const grafico = document.querySelector("#grafico-bruto");
      const periodos = document.querySelector("#lista-periodos");
      if (!mapa.size) {
        grafico.replaceChildren(vazio("Nenhuma venda confirmada nesse intervalo."));
        periodos.replaceChildren();
      } else {
        const maior = Math.max(...mapa.values());
        grafico.replaceChildren();
        periodos.replaceChildren();
        [...mapa.entries()].reverse().forEach(([chave, valor]) => {
        const linha = document.createElement("div");
        linha.className = "barra-linha";
        const nome = document.createElement("span");
        nome.textContent = chave;
        const trilho = document.createElement("div");
        trilho.className = "barra";
        const preenchimento = document.createElement("span");
        preenchimento.style.width = `${maior ? (valor / maior) * 100 : 0}%`;
        trilho.append(preenchimento);
        const valorTexto = document.createElement("strong");
        valorTexto.textContent = moeda.format(valor);
        linha.append(nome, trilho, valorTexto);
        grafico.append(linha);
      });
      periodos.replaceChildren();
    }
    const tabela = document.querySelector("#tabela-financeiro");
    if (!gruposPagos.length) tabela.replaceChildren(vazio("Nenhuma venda paga nesse intervalo."));
    else {
      tabela.replaceChildren(montarTabela(
        ["Data", "Pedido", "Cliente", "Valor bruto", "Taxa Asaas", "Valor líquido", "Status"],
        gruposPagos.map((grupo) => {
          const leitura = caixaPeriodo.linhas.find((linha) => linha.grupo === grupo);
          return {
            tr: document.createElement("tr"),
            celulas: [
              celula("Data", quando.format(new Date(grupo.criado_em))),
              celula("Pedido", grupo.txid, "sem-quebra"),
              celula("Cliente", pessoa(nomeCliente(grupo), grupo.perfis?.email || "")),
              celula("Valor bruto", moeda.format(grupo.valor), "numero"),
              celula("Taxa Asaas", dinheiroOuAviso(leitura?.taxa), leitura?.taxa == null ? "" : "numero"),
              celula("Valor líquido", dinheiroOuAviso(leitura?.liquido), leitura?.liquido == null ? "" : "numero"),
              celula("Status", selo("Pago", "ok")),
            ],
          };
        }),
        ["7.2rem", "9.4rem", "14rem", "7rem", "7rem", "7.4rem", "6.4rem"],
        "tabela-larga",
      ));
    }
  }

  function comprasDaConta(conta) {
    return memoria.pedidos.filter((pedido) => pedido.usuario_id === conta.id);
  }

  function pintarClientes() {
    const destino = document.querySelector("#lista-clientes");
    const termo = (document.querySelector("#busca-cliente")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const filtro = document.querySelector("#filtro-cliente")?.value || "";
    const contas = memoria.contas.filter((conta) => {
      const compras = comprasDaConta(conta);
      if (filtro === "compra" && !compras.some((pedido) => pedido.status === "pago")) return false;
      if (filtro === "sem" && compras.length) return false;
      if (!termo) return true;
      return `${conta.nome} ${conta.email}`.toLocaleLowerCase("pt-BR").includes(termo);
    });
    if (!memoria.contas.length) {
      destino.replaceChildren(vazio("Nenhuma conta ainda.", "As pessoas aparecem aqui depois de criar uma conta."));
      return;
    }
    if (!contas.length) {
      destino.replaceChildren(vazio("Nenhuma conta com essa busca.", "Tente o nome ou o e-mail."));
      return;
    }
    const tamanho = 20;
    const paginas = Math.max(1, Math.ceil(contas.length / tamanho));
    memoria.paginaClientes = Math.min(memoria.paginaClientes, paginas - 1);
    const pagina = contas.slice(memoria.paginaClientes * tamanho, memoria.paginaClientes * tamanho + tamanho);
    const nota = document.createElement("p");
    nota.className = "texto-secao";
    nota.textContent = memoria.contasExtra
      ? `${contas.length} contas. A confirmação do e-mail e o último acesso vêm do cadastro protegido.`
      : `${contas.length} contas no cadastro da loja, inclusive quem ainda não comprou. A data de cadastro, a confirmação do e-mail e o último acesso dependem da migração de atendimento, que ainda não foi aplicada.`;
    destino.replaceChildren(nota);
    destino.append(montarTabela(
      ["Nome", "E-mail", "Papel", "Pedidos pagos", "Materiais pagos", "Ações"],
      pagina.map((conta) => {
        const historico = comprasDaConta(conta);
        const compras = historico.filter((pedido) => pedido.status === "pago");
        const pedidosPagos = agruparPedidos(compras).length;
        const extra = memoria.contasExtra?.get(conta.id);
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        acoes.append(botaoAcao("Ver detalhes", () => {
          const aberto = document.querySelector("#cliente-aberto");
          aberto.replaceChildren();
          const titulo = document.createElement("h3");
          titulo.textContent = conta.nome;
          const ficha = document.createElement("p");
          ficha.className = "texto-secao";
          const confirmacao = extra ? (extra.email_confirmado ? "E-mail confirmado." : "E-mail ainda não confirmado.") : "Confirmação do e-mail indisponível até a migração autorizada.";
          const acesso = extra?.ultimo_acesso ? `Último acesso em ${quando.format(new Date(extra.ultimo_acesso))}.` : "Último acesso indisponível nesta consulta.";
          ficha.textContent = `${conta.email} · ${rotuloPapel(conta.papel)}. ${confirmacao} ${acesso}`;
          aberto.append(titulo, ficha);
          if (!historico.length) {
            aberto.append(vazio("Nenhuma compra registrada para esta conta.", "A pessoa está cadastrada mesmo sem pedido."));
            return;
          }
          aberto.append(montarTabela(
            ["Data", "Pedido", "Material", "Valor", "Status"],
            historico.map((pedido) => ({
              tr: document.createElement("tr"),
              celulas: [
                celula("Data", quando.format(new Date(pedido.criado_em))),
                celula("Pedido", pedido.txid),
                celula("Material", pedido.titulo),
                celula("Valor", moeda.format(Number(pedido.valor) || 0), "numero"),
                celula("Status", selo(...rotuloStatus(pedido.status))),
              ],
            })),
          ));
        }));
        return {
          tr: document.createElement("tr"),
          celulas: [
            celula("Nome", tituloDuas(conta.nome || "Sem nome")),
            celula("E-mail", (() => {
              const email = document.createElement("span");
              email.className = "email-quebra";
              email.textContent = conta.email || "";
              email.title = conta.email || "";
              return email;
            })()),
            celula("Papel", selo(rotuloPapel(conta.papel), conta.papel || "cliente")),
            celula("Pedidos pagos", String(pedidosPagos), "numero"),
            celula("Materiais pagos", String(compras.length), "numero"),
            celula("Ações", acoes, "celula-acoes"),
          ],
        };
      }),
      ["18%", "28%", "14%", "14%", "14%", "12%"],
    ));
    if (paginas > 1) {
      const navegacao = document.createElement("div");
      navegacao.className = "atalhos-painel";
      const anterior = botaoAcao("Página anterior", () => {
        memoria.paginaClientes -= 1;
        pintarClientes();
      });
      const proxima = botaoAcao("Próxima página", () => {
        memoria.paginaClientes += 1;
        pintarClientes();
      });
      anterior.disabled = memoria.paginaClientes === 0;
      proxima.disabled = memoria.paginaClientes >= paginas - 1;
      const posicao = document.createElement("p");
      posicao.className = "texto-secao";
      posicao.textContent = `Página ${memoria.paginaClientes + 1} de ${paginas}`;
      navegacao.append(anterior, proxima, posicao);
      destino.append(navegacao);
    }
  }

  function pintarConfig() {
    const lojaPublica = window.loja || {};
    const admins = memoria.contas
      .filter((conta) => administra(conta.papel))
      .map((conta) => `${conta.email} (${rotuloPapel(conta.papel)})`)
      .join(", ") || "Nenhuma conta administradora encontrada";
    const gruposConfig = [
      ["Informações da loja", "Somente leitura. O texto institucional continua na página inicial.", [
        ["Nome público", "Inclusão no Cotidiano"],
        ["Domínio", "inclusaonocotidiano.com.br"],
        ["Responsável", "Professora Letícia Pimentel de Macedo"],
      ]],
      ["Contato e atendimento", "Nenhum canal novo foi inventado. O atendimento gravado no painel depende da migração de ajuda.", [
        ["E-mail já publicado", lojaPublica.pixChave || "Não informado"],
        ["WhatsApp", lojaPublica.whatsapp ? lojaPublica.whatsapp : "Não informado"],
        ["Central de ajuda", "Preparada localmente. Ainda não instalada no banco."],
      ]],
      ["Pagamentos", "O Pix continua manual. Nenhuma chave de API pode ser editada aqui.", [
        ["Cobrança automática", "Desligada"],
        ["Asaas", "Não ligado. Taxa, saldo e repasse continuam indisponíveis."],
        ["Confirmação", "A venda manual só conta depois de Confirmar Pix."],
      ]],
      ["Downloads e arquivos", "O PDF permanece no espaço privado.", [
        ["Download", "Somente pela função protegida, com sessão e permissão."],
        ["Troca de PDF", "A versão nova só passa a valer depois da confirmação. A anterior fica guardada."],
      ]],
      ["Segurança e permissões", "A hierarquia real fica na seção Equipe. Este painel não altera cargos sozinho.", [
        ["Quem administra", admins],
        ["Proprietária", "Protegida no servidor. Não pode ser rebaixada pelo painel."],
        ["Cliente", "Não vê contas, pedidos ou arquivos de outras pessoas."],
      ]],
      ["Políticas da loja", "Os textos estão no site e ainda precisam de revisão jurídica antes de serem tratados como versão definitiva.", [
        ["Termos, reembolso, privacidade e ajuda", "Links no rodapé da loja e na finalização da compra."],
      ]],
      ["Informações legais", "Faltam dados que só a proprietária pode fornecer. Nada disso é editável no navegador.", [
        ["Pendente", "CPF ou CNPJ, endereço comercial e telefone de atendimento."],
      ]],
    ];
    const lista = document.querySelector("#lista-config");
    lista.replaceChildren();
    gruposConfig.forEach(([titulo, descricao, itens]) => {
      const secao = document.createElement("section");
      secao.className = "grupo-config";
      const h = document.createElement("h3");
      h.textContent = titulo;
      const p = document.createElement("p");
      p.className = "texto-secao";
      p.textContent = descricao;
      const listaItens = document.createElement("div");
      listaItens.className = "config-lista";
      itens.forEach(([rotulo, valor]) => {
        const linha = document.createElement("div");
        linha.className = "config-linha";
        const topo = document.createElement("div");
        topo.className = "config-topo";
        const nome = document.createElement("strong");
        nome.textContent = rotulo;
        const marca = document.createElement("span");
        marca.className = "leitura";
        marca.textContent = "Somente leitura";
        topo.append(nome, marca);
        const valorTexto = document.createElement("p");
        valorTexto.textContent = valor;
        linha.append(topo, valorTexto);
        listaItens.append(linha);
      });
      secao.append(h, p, listaItens);
      lista.append(secao);
    });
  }

  const pintarEquipe = prepararEquipe(loja, memoria, dados, () => {
    pintarVisao();
    pintarFinanceiro();
    pintarClientes();
    pintarConfig();
  });
  const botaoFinanceiro = document.querySelector("[data-secao='financeiro']");
  if (botaoFinanceiro) botaoFinanceiro.hidden = !podeFinanceiro(dados);

  async function pintarConciliacao() {
    const bloco = document.querySelector("#conciliacao");
    const lista = document.querySelector("#lista-conciliacao");
    const status = document.querySelector("#conciliacao-aviso");
    if (!bloco || !lista || dados.papel !== "owner" || !loja.listarConciliacao) return;
    const resultado = await loja.listarConciliacao();
    if (!resultado.ok) {
      bloco.hidden = true;
      return;
    }
    bloco.hidden = false;
    lista.replaceChildren();
    if (!resultado.pedidos.length) {
      const vazio = document.createElement("p");
      vazio.textContent = "Não há compra antiga esperando conciliação.";
      lista.append(vazio);
      return;
    }
    resultado.pedidos.forEach((pedido) => {
      const linha = document.createElement("article");
      linha.className = "config-linha";
      const texto = document.createElement("p");
      texto.textContent = `${pedido.titulo} · ${pedido.email} · ${pedido.txid}`;
      const confirma = document.createElement("label");
      confirma.className = "marca-destaque";
      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      confirma.append(caixa, document.createTextNode("Confirmo que esta compra antiga foi paga"));
      const botao = document.createElement("button");
      botao.className = "botao";
      botao.type = "button";
      botao.textContent = "Conciliar";
      botao.addEventListener("click", async () => {
        botao.disabled = true;
        const gravado = await loja.conciliarPedido(pedido.txid, caixa.checked);
        botao.disabled = false;
        aviso(status, gravado.mensagem || (gravado.ok ? "Compra antiga conciliada." : "Não foi possível conciliar."), Boolean(gravado.ok));
        if (gravado.ok) pintarConciliacao();
      });
      linha.append(texto, confirma, botao);
      lista.append(linha);
    });
  }

  document.querySelector("#encerrar-conciliacao")?.addEventListener("click", async () => {
    if (dados.papel !== "owner" || !loja.encerrarConciliacao) return;
    const status = document.querySelector("#conciliacao-aviso");
    const gravado = await loja.encerrarConciliacao();
    aviso(status, gravado.mensagem || (gravado.ok ? "Exceção encerrada." : "Não foi possível encerrar."), Boolean(gravado.ok));
  });

  function pintarTudo() {
    pintarVisao();
    pintarAtividades();
    pintarArquivos();
    pintarPedidos();
    pintarFinanceiro();
    pintarClientes();
    pintarEquipe();
    pintarConfig();
    pintarConciliacao();
    pintarSuporte();
    completarContas();
  }

  ["#busca-atividade", "#filtro-area-lista", "#filtro-categoria-lista", "#filtro-destaque-lista"].forEach((seletor) => {
    document.querySelector(seletor).addEventListener("input", pintarAtividades);
    document.querySelector(seletor).addEventListener("change", pintarAtividades);
  });
  document.addEventListener("click", fecharMenus);
  document.querySelector("#busca-cliente")?.addEventListener("input", () => {
    memoria.paginaClientes = 0;
    pintarClientes();
  });
  document.querySelector("#filtro-cliente")?.addEventListener("change", () => {
    memoria.paginaClientes = 0;
    pintarClientes();
  });
  async function completarContas() {
    if (!loja.listarContas) return;
    const resultado = await loja.listarContas();
    if (!resultado.ok) return;
    memoria.contasExtra = new Map(resultado.contas.map((conta) => [conta.id, conta]));
    pintarClientes();
  }
  async function pintarSuporte() {
    const destino = document.querySelector("#lista-suporte");
    if (!destino) return;
    if (!loja.listarSolicitacoes) {
      destino.replaceChildren(vazio("A central de ajuda ainda não está ligada.", "A migração precisa ser autorizada antes de gravar solicitações."));
      return;
    }
    const resultado = await loja.listarSolicitacoes();
    if (!resultado.ok) {
      destino.replaceChildren(vazio(
        resultado.ausente ? "A central de ajuda ainda não está instalada no banco." : "Não foi possível ler as solicitações.",
        resultado.ausente ? "Nenhuma mensagem foi gravada. O envio pelo painel começa depois da migração autorizada." : resultado.mensagem,
      ));
      return;
    }
    if (!resultado.solicitacoes.length) {
      destino.replaceChildren(vazio("Nenhuma solicitação aberta.", "Quando um cliente pedir ajuda, ela aparece aqui."));
      return;
    }
    destino.replaceChildren(montarTabela(
      ["Data", "Cliente", "Assunto", "Pedido", "Status", "Ações"],
      resultado.solicitacoes.map((item) => {
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        if (item.status !== "resolvido") {
          acoes.append(botaoAcao("Registrar solução", async () => {
            const texto = window.prompt("Escreva a solução registrada para o cliente.");
            if (!texto) return;
            const gravado = await loja.atualizarSolicitacao(item.id, "resolvido", texto);
            aviso(document.querySelector("#suporte-aviso"), gravado.ok ? "Solicitação resolvida." : gravado.mensagem, Boolean(gravado.ok));
            if (gravado.ok) pintarSuporte();
          }));
        }
        return {
          tr: document.createElement("tr"),
          celulas: [
            celula("Data", quando.format(new Date(item.criado_em))),
            celula("Cliente", item.nome || item.email || "Conta"),
            celula("Assunto", item.assunto),
            celula("Pedido", item.txid || "—"),
            celula("Status", item.status === "atendimento" ? "Em atendimento" : item.status === "resolvido" ? "Resolvido" : "Aberto"),
            celula("Ações", acoes),
          ],
        };
      }),
    ));
  }
  async function restaurarPdf(atividade) {
    if (!loja.restaurarPdf || !atividade.pdfAnterior || atividade.pdfAnterior === atividade.arquivo) return;
    if (!window.confirm("Voltar ao PDF anterior? O arquivo novo permanece guardado, mas os downloads passam a usar o anterior.")) return;
    if (!travaPdf.entrar()) return;
    const status = document.querySelector("#arquivos-status");
    try {
      const resultado = await loja.restaurarPdf(atividade.id, atividade.arquivo, atividade.pdfAnterior);
      aviso(status, resultado.mensagem, Boolean(resultado.ok));
      if (!resultado.ok) return;
      const deixado = atividade.arquivo;
      atividade.arquivo = resultado.arquivo || atividade.pdfAnterior;
      atividade.arquivo_anterior = deixado;
      atividade.pdfAnterior = deixado;
      pintarArquivos();
    } finally {
      travaPdf.sair();
    }
  }

  const entradaPdf = document.querySelector("#pdf-troca-arquivo");
  entradaPdf?.addEventListener("change", async () => {
    const arquivo = entradaPdf.files?.[0];
    const nome = document.querySelector("#pdf-troca-nome");
    const confirmar = document.querySelector("#pdf-troca-confirmar");
    if (!arquivo) {
      nome.textContent = "Nenhum arquivo escolhido.";
      confirmar.disabled = true;
      return;
    }
    const bytes = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
    const validacao = validarPdf({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, bytes });
    nome.textContent = validacao.ok
      ? `${arquivo.name} · ${formatarTamanho(arquivo.size)}`
      : validacao.mensagem;
    confirmar.disabled = !validacao.ok;
  });
  document.querySelector("#pdf-troca-cancelar")?.addEventListener("click", () => {
    pdfAlvo = null;
    document.querySelector("#pdf-troca").close();
  });
  document.querySelector("#pdf-troca-confirmar")?.addEventListener("click", async () => {
    const atividade = pdfAlvo;
    const arquivo = entradaPdf.files?.[0];
    if (!atividade || !arquivo || !loja.substituirPdf) return;
    if (!travaPdf.entrar()) return;
    const confirmar = document.querySelector("#pdf-troca-confirmar");
    confirmar.disabled = true;
    const nome = atividade.arquivo || "";
    try {
      const bytes = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
      const validacao = validarPdf({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, bytes });
      if (!validacao.ok) {
        aviso(document.querySelector("#arquivos-status"), validacao.mensagem);
        confirmar.disabled = false;
        return;
      }
      const resultado = await loja.substituirPdf(atividade.id, arquivo, nome);
      if (!resultado.ok) {
        aviso(document.querySelector("#arquivos-status"), resultado.mensagem);
        confirmar.disabled = false;
        return;
      }
      if (resultado.anterior) {
        atividade.arquivo_anterior = resultado.anterior;
        atividade.pdfAnterior = resultado.anterior;
      }
      atividade.arquivo = resultado.arquivo || nome;
      atividade.pdfInfo = { ok: true, pdf: { nome: atividade.arquivo, atualizado: new Date().toISOString() } };
      pdfAlvo = null;
      document.querySelector("#pdf-troca").close();
      aviso(document.querySelector("#arquivos-status"), resultado.mensagem || "PDF substituído. O arquivo anterior continua guardado.", true);
      pintarArquivos();
    } finally {
      travaPdf.sair();
    }
  });
  ["#busca-pedido", "#pedidos-status", "#pedidos-inicio", "#pedidos-fim"].forEach((seletor) => {
    document.querySelector(seletor).addEventListener("input", pintarPedidos);
    document.querySelector(seletor).addEventListener("change", pintarPedidos);
  });
  ["#financeiro-inicio", "#financeiro-fim"].forEach((seletor) => {
    document.querySelector(seletor).addEventListener("input", pintarFinanceiro);
    document.querySelector(seletor).addEventListener("change", pintarFinanceiro);
  });
  document.querySelectorAll("[data-periodo]").forEach((botao) => {
    botao.addEventListener("click", () => {
      memoria.periodo = botao.dataset.periodo;
      document.querySelectorAll("[data-periodo]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === botao));
      });
      pintarFinanceiro();
    });
  });
  document.querySelector("#exportar-csv").addEventListener("click", () => {
    if (!podeFinanceiro(dados)) return;
    const { inicio, fim } = intervalosFinanceiro();
    const pagos = agruparPedidos(memoria.pedidos.filter((pedido) => pedido.status === "pago" && dentroDoIntervalo(pedido.criado_em, inicio, fim)));
    const caixaExportada = fecharCaixa(pagos, memoria.cobrancas, memoria.cobrancasDisponiveis);
    const linhas = [["Data", "Pedido", "Cliente", "E-mail", "Valor bruto", "Taxa Asaas", "Valor líquido", "Status", "Asaas"]];
    caixaExportada.linhas.forEach((linha) => {
      const [taxa, liquido] = linhaExportada(linha, (valor) => moeda.format(valor));
      linhas.push([
        quando.format(new Date(linha.grupo.criado_em)),
        linha.grupo.txid,
        nomeCliente(linha.grupo),
        linha.grupo.perfis?.email || "",
        moeda.format(linha.grupo.valor),
        taxa,
        liquido,
        "Pago",
        linha.asaas,
      ]);
    });
    const texto = linhas.map((colunas) => colunas.map(celulaCsv).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${texto}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "financeiro-inclusao.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  document.addEventListener("atividade-salva", (evento) => {
    const salva = evento.detail;
    if (!salva?.id) {
      pintarAtividades();
      return;
    }
    const atual = porId.get(salva.id) || {};
    const junta = { ...atual, ...salva, foraDoBanco: false };
    porId.set(salva.id, junta);
    const indice = memoria.atividades.findIndex((item) => item.id === salva.id);
    if (indice >= 0) memoria.atividades[indice] = junta;
    else memoria.atividades.push(junta);
    memoria.atividades.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    pintarAtividades();
    pintarArquivos();
  });

  prepararCadastro(loja, new Set(memoria.atividades.map((item) => item.id)), (criada) => {
    document.dispatchEvent(new CustomEvent("atividade-salva", { detail: criada }));
  });
  pintarTudo();
}
