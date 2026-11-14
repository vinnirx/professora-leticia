import { abrirEdicao, prepararCadastro } from "./cadastro.js";
import { prepararEquipe } from "./equipe.js";
import { aviso, moeda, quando } from "./avisos.js";
import { administra, podeFinanceiro, rotuloPapel } from "./papeis.js";

const SECOES = ["visao", "atividades", "arquivos", "pedidos", "financeiro", "clientes", "equipe", "configuracoes"];

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

function agruparPedidos(pedidos) {
  const mapa = new Map();
  pedidos.forEach((pedido) => {
    const chave = `${pedido.txid}::${pedido.usuario_id || pedido.perfis?.email || ""}`;
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        txid: pedido.txid,
        usuario_id: pedido.usuario_id || "",
        perfis: pedido.perfis || {},
        criado_em: pedido.criado_em,
        itens: [],
        valor: 0,
      };
      mapa.set(chave, grupo);
    }
    grupo.itens.push(pedido);
    grupo.valor += Number(pedido.valor) || 0;
    if (pedido.criado_em < grupo.criado_em) grupo.criado_em = pedido.criado_em;
  });
  return [...mapa.values()].map((grupo) => ({
    ...grupo,
    status: grupo.itens.every((item) => item.status === "pago") ? "pago" : "aguardando",
  }));
}

function celula(rotulo, conteudo, classe) {
  const td = document.createElement("td");
  td.dataset.rotulo = rotulo;
  if (classe) td.className = classe;
  if (conteudo instanceof Node) td.append(conteudo);
  else td.textContent = conteudo ?? "";
  return td;
}

function montarTabela(colunas, linhas, larguras) {
  const tabela = document.createElement("table");
  tabela.className = "tabela-admin";
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

function celulaCsv(valor) {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

export async function iniciarAdmin(loja) {
  const bloqueio = document.querySelector("#admin-bloqueio");
  const status = document.querySelector("#admin-status");
  const app = document.querySelector("#painel-app");
  document.querySelectorAll("[data-secao]").forEach((botao) => {
    botao.addEventListener("click", () => {
      location.hash = botao.dataset.secao;
    });
  });
  const aplicarSecao = () => mostrarSecao(secaoAtual());
  window.addEventListener("hashchange", aplicarSecao);
  aplicarSecao();

  if (!loja?.configurada) {
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
  if (!sessao) {
    location.href = "entrar.html?depois=admin.html";
    return;
  }
  const dados = await loja.perfil();
  if (!administra(dados?.papel)) {
    bloqueio.hidden = false;
    bloqueio.textContent = "Esta área é só de quem administra a loja.";
    return;
  }

  app.hidden = false;
  const sair = document.querySelector("#sair");
  sair.hidden = false;
  sair.addEventListener("click", () => {
    sair.disabled = true;
    sair.textContent = "Saindo…";
    loja.sair();
  });

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
    if (porId.has(local.id)) return;
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
    atividades: [...porId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
    periodo: "dia",
  };

  const idsBanco = memoria.atividades.filter((item) => !item.foraDoBanco).map((item) => item.id);
  if (loja.arquivosPdf) {
    loja.arquivosPdf(idsBanco).then((mapa) => {
      memoria.atividades.forEach((item) => {
        if (item.foraDoBanco || !Object.hasOwn(mapa, item.id)) return;
        item.pdfInfo = mapa[item.id];
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
    const caixa = document.querySelector("#indicadores-visao");
    const apoioVisao = document.querySelector("#indicadores-visao-apoio");
    if (podeFinanceiro(dados)) {
      caixa.replaceChildren(
        indicador("Receita bruta", moeda.format(pagos.reduce((soma, grupo) => soma + grupo.valor, 0)), "Só pedidos pagos"),
        indicador("Receita líquida", indisponivel(), "A taxa do Asaas ainda não é gravada"),
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
      ["Nova atividade", "atividades", "principal"],
      ["Ver pedidos", "pedidos", ""],
      ...(podeFinanceiro(dados) ? [["Ver financeiro", "financeiro", ""]] : []),
    ].forEach(([texto, secao, estilo]) => {
      atalhos.append(botaoAcao(texto, () => {
        if (secao === "atividades") document.querySelector("#abrir-cadastro")?.click();
        else location.hash = secao;
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
    const tabela = montarTabela(
      ["Capa", "Atividade", "Categoria", "Preço", "Situação", "Destaque", "Ações"],
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
            { texto: "Ver na loja", href: `atividade.html?id=${encodeURIComponent(atividade.id)}` },
            { texto: "Gerenciar PDF", aoClicar: () => {
              location.hash = "arquivos";
              document.querySelector(`#lista-pdfs [data-atividade="${CSS.escape(atividade.id)}"]`)?.scrollIntoView({ block: "center" });
            } },
          ]),
        );
        const situacao = atividade.foraDoBanco
          ? selo("Fora do banco", "neutro")
          : selo("Visível", "ok");
        situacao.title = atividade.foraDoBanco ? "Ainda não está no banco" : "Visível na loja";
        return {
          tr,
          celulas: [
            celula("Capa", capa),
            celula("Atividade", tituloDuas(atividade.titulo, "titulo")),
            celula("Categoria", categoriaDe(atividade) || "—"),
            celula("Preço", preco, "numero"),
            celula("Situação", situacao),
            celula("Destaque", destaque, "celula-centro"),
            celula("Ações", acoes, "celula-acoes"),
          ],
        };
      }),
      ["7%", "31%", "13%", "10%", "11%", "10%", "18%"],
    );
    lista.replaceChildren(tabela);
    if (!visiveis.size) lista.prepend(vazio("Nenhuma atividade com esse filtro."));
  }

  function textoPdf(atividade) {
    if (atividade.foraDoBanco) return { arquivo: "—", quando: "—", situacao: "Ainda não está no banco" };
    if (!Object.hasOwn(atividade, "pdfInfo")) return { arquivo: "Verificando…", quando: "Verificando…", situacao: "Verificando" };
    if (!atividade.pdfInfo?.ok) return { arquivo: indisponivel(), quando: indisponivel(), situacao: "Não foi possível verificar" };
    if (!atividade.pdfInfo.pdf) return { arquivo: "Nenhum", quando: "—", situacao: "Sem PDF" };
    const atualizado = atividade.pdfInfo.pdf.atualizado ? quando.format(new Date(atividade.pdfInfo.pdf.atualizado)) : indisponivel();
    return { arquivo: atividade.pdfInfo.pdf.nome, quando: atualizado, situacao: "PDF no espaço privado" };
  }

  let pdfAlvo = null;

  function abrirPdf(atividade) {
    pdfAlvo = atividade;
    const dialogo = document.querySelector("#pdf-troca");
    const temArquivo = Boolean(atividade.pdfInfo?.pdf);
    document.querySelector("#pdf-troca-titulo").textContent = temArquivo ? "Substituir PDF" : "Enviar PDF";
    document.querySelector("#pdf-troca-atividade").textContent = atividade.titulo;
    document.querySelector("#pdf-troca-atual").textContent = temArquivo
      ? `Arquivo atual: ${atividade.pdfInfo.pdf.nome}`
      : "Esta atividade ainda não tem PDF.";
    document.querySelector("#pdf-troca-aviso").hidden = !temArquivo;
    const entrada = document.querySelector("#pdf-troca-arquivo");
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
            location.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
          }));
          if (atividade.pdfInfo?.pdf) {
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
          acoes.append(botaoAcao(atividade.pdfInfo?.pdf ? "Substituir" : "Enviar", () => abrirPdf(atividade), atividade.pdfInfo?.pdf ? "botao-perigo" : ""));
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
              if (pedido.txid === grupo.txid && (pedido.usuario_id || "") === (grupo.usuario_id || "")) pedido.status = "pago";
            });
            aviso(document.querySelector("#pedidos-status-aviso"), "Pix confirmado. O download já está na conta de quem comprou.", true);
            pintarTudo();
          }));
        }
        return {
          tr: document.createElement("tr"),
          celulas: [
            celula("Data", quando.format(new Date(grupo.criado_em))),
            celula("Pedido", grupo.txid, "sem-quebra"),
            celula("Cliente", pessoa(nomeCliente(grupo), grupo.perfis?.email || "")),
            celula("Materiais", tituloDuas(materiaisDe(grupo))),
            celula("Valor", moeda.format(grupo.valor), "numero"),
            celula("Status", selo(...rotuloStatus(grupo.status))),
            celula("Asaas", selo(indisponivel(), "neutro")),
            celula("Ações", acoes),
          ],
        };
      }),
      ["8.6rem", "7.4rem", "16%", "20%", "6.2rem", "7.2rem", "8rem", "11.2rem"],
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
    const barraFinanceiro = document.querySelector("[data-painel='financeiro'] .barra-ferramentas");
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
    const pagos = noPeriodo.filter((pedido) => pedido.status === "pago");
    const aguardando = noPeriodo.filter((pedido) => pedido.status === "aguardando");
    const gruposPagos = agruparPedidos(pagos);
    const bruto = pagos.reduce((soma, pedido) => soma + (Number(pedido.valor) || 0), 0);
    const ticket = gruposPagos.length ? bruto / gruposPagos.length : null;
    const cobrancaDo = (txid) => memoria.cobrancas.find((item) => item.txid === txid) || null;
    const taxasConhecidas = memoria.cobrancasDisponiveis && gruposPagos.length > 0 && gruposPagos.every((grupo) => {
      const cobranca = cobrancaDo(grupo.txid);
      return cobranca && cobranca.taxa != null && cobranca.valor_liquido != null;
    });
    const taxaTotal = taxasConhecidas
      ? gruposPagos.reduce((soma, grupo) => soma + Number(cobrancaDo(grupo.txid).taxa), 0)
      : null;
    const liquidoTotal = taxasConhecidas
      ? gruposPagos.reduce((soma, grupo) => soma + Number(cobrancaDo(grupo.txid).valor_liquido), 0)
      : null;
    const estornos = memoria.cobrancasDisponiveis
      ? memoria.cobrancas.filter((item) => item.status === "estornada" && dentroDoIntervalo(item.atualizado_em, inicio, fim))
      : null;
    document.querySelector("#indicadores-financeiro").replaceChildren(
      indicador("Receita bruta", moeda.format(bruto), "Soma dos itens com pagamento confirmado."),
      indicador("Receita líquida", liquidoTotal == null ? indisponivel() : moeda.format(liquidoTotal), liquidoTotal == null ? "Sem a taxa registrada, o líquido não é calculado." : "Soma do líquido gravado em cada cobrança."),
      indicador("Taxas Asaas", taxaTotal == null ? indisponivel() : moeda.format(taxaTotal), taxaTotal == null ? "A integração ainda não grava a tarifa de cada cobrança." : "Soma da tarifa gravada pelo Asaas."),
      indicador("Pedidos pagos", String(gruposPagos.length), "Um código de pedido conta uma vez."),
    );
    apoio.replaceChildren(
      indicador("Atividades vendidas", String(pagos.length), "Cada material pago conta uma unidade."),
      indicador("Ticket médio", ticket === null ? "—" : moeda.format(ticket), "Receita bruta dividida pelos pedidos pagos."),
      indicador("Valores pendentes", moeda.format(aguardando.reduce((soma, pedido) => soma + (Number(pedido.valor) || 0), 0)), `${aguardando.length} ${aguardando.length === 1 ? "item aguardando" : "itens aguardando"}.`),
      indicador("Estornos", estornos == null ? indisponivel() : moeda.format(estornos.reduce((soma, item) => soma + (Number(item.valor_bruto) || 0), 0)), estornos == null ? "O banco ainda não registra estorno." : "Soma do bruto das cobranças estornadas neste intervalo."),
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
        gruposPagos.map((grupo) => ({
          tr: document.createElement("tr"),
          celulas: [
            celula("Data", quando.format(new Date(grupo.criado_em))),
            celula("Pedido", grupo.txid),
            celula("Cliente", nomeCliente(grupo)),
            celula("Valor bruto", moeda.format(grupo.valor), "numero"),
            celula("Taxa Asaas", (() => {
              const cobranca = cobrancaDo(grupo.txid);
              return cobranca?.taxa == null ? selo(indisponivel(), "neutro") : moeda.format(Number(cobranca.taxa));
            })()),
            celula("Valor líquido", (() => {
              const cobranca = cobrancaDo(grupo.txid);
              return cobranca?.valor_liquido == null ? selo(indisponivel(), "neutro") : moeda.format(Number(cobranca.valor_liquido));
            })()),
            celula("Status", selo("Pago", "ok")),
          ],
        })),
      ));
    }
  }

  function pintarClientes() {
    const destino = document.querySelector("#lista-clientes");
    const termo = (document.querySelector("#busca-cliente")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const contas = memoria.contas.filter((conta) => {
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
    destino.replaceChildren(montarTabela(
      ["Nome", "E-mail", "Papel", "Pedidos pagos", "Materiais pagos", "Ações"],
      contas.map((conta) => {
        const compras = memoria.pedidos.filter((pedido) => pedido.usuario_id === conta.id && pedido.status === "pago");
        const pedidosPagos = agruparPedidos(compras).length;
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        acoes.append(botaoAcao("Ver compras", () => {
          const aberto = document.querySelector("#cliente-aberto");
          const historico = memoria.pedidos.filter((pedido) => pedido.usuario_id === conta.id);
          aberto.replaceChildren();
          const titulo = document.createElement("h3");
          titulo.textContent = conta.nome;
          aberto.append(titulo);
          if (!historico.length) {
            aberto.append(vazio("Nenhuma compra registrada para esta conta."));
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
  }

  function pintarConfig() {
    const lojaPublica = window.loja || {};
    const admins = memoria.contas
      .filter((conta) => administra(conta.papel))
      .map((conta) => `${conta.email} (${rotuloPapel(conta.papel)})`)
      .join(", ") || "Nenhuma conta administradora encontrada";
    const gruposConfig = [
      ["Dados da loja", "Nome e contato publicados. O texto institucional continua na página inicial.", [
        ["Nome público", "Inclusão no Cotidiano"],
        ["WhatsApp", lojaPublica.whatsapp ? lojaPublica.whatsapp : "Não informado"],
      ]],
      ["Pagamentos", "O Pix da loja continua manual. O Asaas ainda não grava taxa, saldo nem identificador.", [
        ["Chave Pix publicada", lojaPublica.pixChave || indisponivel()],
        ["Asaas", "Não ligado"],
        ["Repasse", "O valor líquido da cobrança não é o saldo do Asaas nem a transferência para o Banco do Brasil. Os dois continuam não disponíveis."],
        ["Confirmação", "A venda manual só conta depois de Confirmar Pix. O navegador não marca pedido como pago."],
        ["Pedidos antigos", "Continuam baixáveis até a proprietária conciliar cada código no painel e encerrar a exceção. Pedido novo não usa essa exceção."],
      ]],
      ["Equipe e permissões", "A hierarquia fica na seção Equipe. Aqui só aparece quem já administra.", [
        ["Quem administra", admins],
      ]],
      ["Segurança", "Cargos do site não limitam quem entra no projeto do Supabase ou no GitHub.", [
        ["Acesso ao projeto", "Deixe essas contas só com quem precisa."],
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
  }

  ["#busca-atividade", "#filtro-area-lista", "#filtro-categoria-lista", "#filtro-destaque-lista"].forEach((seletor) => {
    document.querySelector(seletor).addEventListener("input", pintarAtividades);
    document.querySelector(seletor).addEventListener("change", pintarAtividades);
  });
  document.addEventListener("click", fecharMenus);
  document.querySelector("#busca-cliente")?.addEventListener("input", pintarClientes);
  const entradaPdf = document.querySelector("#pdf-troca-arquivo");
  entradaPdf?.addEventListener("change", () => {
    const arquivo = entradaPdf.files?.[0];
    document.querySelector("#pdf-troca-nome").textContent = arquivo ? arquivo.name : "Nenhum arquivo escolhido.";
    document.querySelector("#pdf-troca-confirmar").disabled = !arquivo;
  });
  document.querySelector("#pdf-troca-cancelar")?.addEventListener("click", () => {
    pdfAlvo = null;
    document.querySelector("#pdf-troca").close();
  });
  document.querySelector("#pdf-troca-confirmar")?.addEventListener("click", async () => {
    const atividade = pdfAlvo;
    const arquivo = entradaPdf.files?.[0];
    if (!atividade || !arquivo) return;
    const confirmar = document.querySelector("#pdf-troca-confirmar");
    confirmar.disabled = true;
    const nome = atividade.arquivo || `${atividade.id}.pdf`;
    const resultado = await loja.enviarPdf(atividade.id, arquivo, nome);
    confirmar.disabled = false;
    if (!resultado.ok) {
      aviso(document.querySelector("#arquivos-status"), resultado.mensagem);
      return;
    }
    const conferido = loja.arquivoPdf ? await loja.arquivoPdf(atividade.id) : { ok: true, pdf: { nome: arquivo.name, atualizado: new Date().toISOString() } };
    atividade.pdfInfo = conferido.ok ? { ok: true, pdf: conferido.pdf } : { ok: false };
    if (!atividade.arquivo) atividade.arquivo = nome;
    pdfAlvo = null;
    document.querySelector("#pdf-troca").close();
    aviso(document.querySelector("#arquivos-status"), "PDF guardado. Quem administra e quem já pagou conseguem baixar.", true);
    pintarArquivos();
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
    const linhas = [["Data", "Pedido", "Cliente", "Valor bruto", "Taxa Asaas", "Valor líquido", "Status"]];
    pagos.forEach((grupo) => {
      linhas.push([
        quando.format(new Date(grupo.criado_em)),
        grupo.txid,
        nomeCliente(grupo),
        moeda.format(grupo.valor),
        indisponivel(),
        indisponivel(),
        "Pago",
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
