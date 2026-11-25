import { origemDaImagemPix } from "../imagem-pix.js?v=1";
import { aviso, moeda, quando } from "./avisos.js";
import { protocoloVisivel, rotuloSolicitacao } from "../suporte.js?v=1";
import { acionarSaida } from "./saida.js";
import { leituraAdministrativa, resumoAdministrativo } from "./apresentacao.js?v=6";
import { administra } from "./papeis.js";
import { agruparPorCodigo, apresentacao, intervaloDaTela, podeOcultar, prioridadeDaAcao } from "./retomada.js?v=2";
import { rota } from "../rotas.js";
import { linkAjuda, MENSAGEM_COMPRA_INDISPONIVEL } from "../texto.js";

function contato(pedido, motivo) {
  const link = document.createElement("a");
  link.className = "botao botao-secundario";
  link.textContent = "Falar com a Letícia";
  link.href = linkAjuda({ txid: pedido.txid, motivo });
  return link;
}

function selo(tipo, texto) {
  const marca = document.createElement("p");
  marca.className = `situacao situacao-${tipo}`;
  marca.textContent = texto;
  return marca;
}

function cartaoPedido(pedido, loja) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const titulo = document.createElement("h3");
  titulo.textContent = pedido.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(pedido.valor))} · pedido ${pedido.txid}`;
  artigo.append(titulo, meta);
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.setAttribute("role", "status");
  if (pedido.status === "estornado" || pedido.status === "cancelado") {
    const acao = pedido.status === "estornado" ? "estornado" : "tentativa";
    const visual = apresentacao(acao);
    const motivo = pedido.status === "estornado" ? "Meu pagamento foi estornado." : "Meu pedido foi cancelado.";
    artigo.append(selo(visual.tipo, visual.titulo), estado, contato(pedido, motivo));
    estado.textContent = pedido.status === "estornado"
      ? "Este pagamento foi estornado. O PDF deixa de ficar disponível."
      : "Este pedido foi cancelado. O PDF continua bloqueado.";
    botoesSecundarios(artigo, pedido, loja, { cancelavel: false, ocultavel: podeOcultar(acao) });
    acompanharPedido(artigo, pedido, loja, acao);
    return artigo;
  }
  if (pedido.status !== "pago") {
    artigo.append(
      selo("espera", "Consultando pedido"),
      estado,
      contato(pedido, "Meu Pix ainda não foi confirmado."),
    );
    estado.textContent = "Estamos conferindo se existe um Pix válido. Nenhum pagamento novo foi gerado.";
    acompanharPedido(artigo, pedido, loja, "aguardar");
    return artigo;
  }
  artigo.append(selo("ok", "Pagamento confirmado"), estado, contato(pedido, "Preciso de ajuda com este pedido."));
  estado.textContent = "Pagamento confirmado. O material aparece quando a liberação estiver pronta.";
  acompanharPedido(artigo, pedido, loja, "confirmar");
  return artigo;
}

function materiaisDoPedido(pedido) {
  const ids = Array.isArray(pedido.atividades) && pedido.atividades.length
    ? pedido.atividades
    : [pedido.atividade_id].filter(Boolean);
  const titulos = Array.isArray(pedido.titulos) ? pedido.titulos : [];
  return ids.map((id, indice) => ({
    id,
    titulo: titulos[indice] || "Material",
  }));
}

function botaoDownload(pedido, loja, material) {
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.textContent = "Baixar PDF";
  botao.addEventListener("click", async () => {
    const artigo = botao.closest(".item-conta");
    const estado = artigo?.querySelector(".aviso-conta");
    botao.disabled = true;
    try {
      await loja.baixar(material.id);
      if (estado) aviso(estado, "O download começou.", true);
    } catch (erro) {
      artigo?.querySelector(".situacao")?.replaceWith(selo("problema", "Problema para baixar"));
      const mensagem = erro?.message === "entrar"
        ? "Entre de novo para baixar este material."
        : erro?.message === "negado"
          ? "Este material ainda não está liberado."
          : erro?.message === "tentar"
            ? "O download não respondeu. Tente de novo."
            : "O PDF não saiu. Fale com a Letícia e informe o código do pedido.";
      if (estado) aviso(estado, mensagem);
      if (estado && artigo && !artigo.querySelector("a[href^='mailto:']")) {
        artigo.append(contato(pedido, "O pagamento está confirmado, mas o PDF não baixou."));
      }
    }
    botao.disabled = false;
  });
  return botao;
}

function mostrarDownloads(artigo, pedido, loja, estado) {
  if (artigo.querySelector("[data-downloads]")) return;
  const caixa = document.createElement("div");
  caixa.className = "downloads-pedido";
  caixa.dataset.downloads = "sim";
  materiaisDoPedido(pedido).forEach((material) => {
    const linha = document.createElement("div");
    linha.className = "linha-download";
    const nome = document.createElement("span");
    nome.textContent = material.titulo;
    linha.append(nome, botaoDownload(pedido, loja, material));
    caixa.append(linha);
  });
  artigo.insertBefore(caixa, estado);
}

function botaoDaConta(pedido, acao) {
  const visual = apresentacao(acao);
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.dataset.acao = acao;
  botao.textContent = visual.botao;
  return botao;
}

function mostrarPix(artigo, resultado) {
  let caixa = artigo.querySelector(".pix-retomado");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.className = "pix-retomado";
    artigo.append(caixa);
  }
  caixa.replaceChildren();
  const valor = document.createElement("p");
  const titulos = (resultado.titulos || []).filter(Boolean).join(", ");
  valor.textContent = `Valor ${moeda.format(Number(resultado.valor || 0))}${titulos ? ` · ${titulos}` : ""}`;
  const prazo = document.createElement("p");
  prazo.textContent = resultado.expiraEm
    ? `Vencimento ${new Date(resultado.expiraEm).toLocaleString("pt-BR")}`
    : "Use este mesmo Pix até o vencimento informado pelo banco.";
  const recebedor = document.createElement("p");
  recebedor.textContent = "Confira o recebedor no aplicativo do banco antes de pagar.";
  caixa.append(valor, prazo, recebedor);
  const origem = origemDaImagemPix(resultado.imagem);
  if (origem) {
    const imagem = document.createElement("img");
    imagem.alt = "QR Code Pix da cobrança";
    imagem.width = 180;
    imagem.height = 180;
    imagem.src = origem;
    caixa.append(imagem);
  }
  if (resultado.copiaCola) {
    const codigo = document.createElement("textarea");
    codigo.readOnly = true;
    codigo.rows = 3;
    codigo.value = resultado.copiaCola;
    caixa.append(codigo);
  }
}

function idsDoPedido(pedido) {
  return Array.isArray(pedido.atividades) && pedido.atividades.length
    ? pedido.atividades
    : [pedido.atividade_id];
}

async function agirNoPedido(artigo, pedido, loja) {
  const estado = artigo.querySelector(".aviso-conta");
  const botao = artigo.querySelector("button.botao");
  const acao = botao?.dataset.acao || "continuar";
  if (botao) botao.disabled = true;
  if (acao === "vencido") {
    const consulta = await loja.consultarPedido(pedido.txid);
    if (!consulta.ok || !consulta.renovavel) {
      aviso(estado, consulta.mensagem || "A cobrança anterior ainda não pode ser renovada.");
      if (botao) botao.disabled = false;
      return;
    }
    await gerarNoPedido(artigo, pedido, loja, estado, botao);
    return;
  }
  if (acao === "tentar") {
    const consulta = await loja.consultarPedido(pedido.txid);
    if (!consulta.ok || consulta.acao !== "tentar") {
      if (consulta.ok) aplicarSituacao(artigo, pedido, loja, consulta);
      else aviso(estado, consulta.mensagem || "Não consegui confirmar se esta cobrança já existe. Não gere outro Pix ainda.");
      return;
    }
    await gerarNoPedido(artigo, pedido, loja, estado, botao);
    return;
  }
  const resultado = await loja.retomarPedido(pedido.txid);
  if (!resultado.ok) {
    aviso(estado, resultado.mensagem || "Não consegui consultar este pedido.");
    if (botao) botao.disabled = false;
    return;
  }
  aplicarSituacao(artigo, pedido, loja, resultado);
  const atual = artigo.querySelector("button.botao");
  if (atual) atual.disabled = false;
}

async function gerarNoPedido(artigo, pedido, loja, estado, botao) {
  const gerada = await loja.criarCobranca(idsDoPedido(pedido), crypto.randomUUID(), "");
  const recusada = /não aceitou este valor/i.test(gerada.mensagem || "");
  aviso(estado, gerada.mensagem || (gerada.ok ? "O Pix foi gerado neste mesmo pedido." : "Não foi possível gerar o Pix."));
  if (gerada.ok) mostrarPix(artigo, gerada);
  if (botao) botao.disabled = recusada;
}

function aplicarSituacao(artigo, pedido, loja, resultado) {
  const visual = apresentacao(resultado.acao);
  const marca = artigo.querySelector(".situacao");
  if (marca) {
    marca.className = `situacao situacao-${visual.tipo}`;
    marca.textContent = visual.titulo;
  }
  const estado = artigo.querySelector(".aviso-conta");
  if (estado) {
    estado.hidden = false;
    if (resultado.mensagem) aviso(estado, resultado.mensagem, resultado.liberado === true);
  }
  if (resultado.copiaCola || resultado.imagem) mostrarPix(artigo, resultado);
  const antigo = artigo.querySelector("button.botao");
  if (resultado.liberado) {
    artigo.querySelectorAll("button.botao").forEach((botao) => {
      if (!botao.closest("[data-downloads]") && !botao.closest("[data-secundario]")) botao.remove();
    });
    mostrarDownloads(artigo, pedido, loja, estado);
    return;
  }
  if (!visual.botao) {
    antigo?.remove();
    botoesSecundarios(artigo, pedido, loja, resultado);
    return;
  }
  const botao = antigo || botaoDaConta(pedido, resultado.acao);
  botao.dataset.acao = resultado.acao;
  botao.textContent = visual.botao;
  botao.disabled = false;
  if (!antigo) artigo.insertBefore(botao, estado);
  ligarBotao(artigo, pedido, loja, botao);
  botoesSecundarios(artigo, pedido, loja, resultado);
  artigo.dataset.ordem = String(prioridadeDaAcao(resultado.acao));
  ordenarLista(artigo.parentElement);
}

function ligarBotao(artigo, pedido, loja, botao) {
  if (!botao || botao.dataset.ligado) return;
  botao.dataset.ligado = "sim";
  botao.addEventListener("click", () => agirNoPedido(artigo, pedido, loja));
}

function botaoSecundario(texto, aoClicar) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "botao botao-secundario";
  botao.textContent = texto;
  botao.addEventListener("click", aoClicar);
  return botao;
}

function ordenarLista(lista) {
  if (!lista) return;
  const cartoes = [...lista.querySelectorAll(".item-conta")];
  cartoes.sort((a, b) => Number(a.dataset.ordem || 3) - Number(b.dataset.ordem || 3));
  cartoes.forEach((cartao) => lista.append(cartao));
}

function botoesSecundarios(artigo, pedido, loja, resultado) {
  const ajuda = artigo.querySelector("a.botao") || contato(pedido, "Preciso de ajuda com este pedido.");
  artigo.querySelector("[data-secundario]")?.remove();
  const caixa = document.createElement("div");
  caixa.className = "acoes acoes-alinhadas";
  caixa.dataset.secundario = "sim";
  caixa.append(ajuda);
  if (resultado.cancelavel) caixa.append(botaoSecundario("Cancelar pedido", () => confirmarCancelamento(artigo, pedido, loja)));
  if (resultado.ocultavel && !pedido.oculto) caixa.append(botaoSecundario("Ocultar pedido", () => confirmarExclusao(artigo, pedido, loja, resultado)));
  if (caixa.childElementCount) artigo.append(caixa);
}

function confirmarExclusao(artigo, pedido, loja, resultado) {
  const caixa = artigo.querySelector("[data-secundario]");
  if (!caixa || caixa.dataset.excluindo === "1") return;
  caixa.replaceChildren();
  const texto = document.createElement("p");
  texto.textContent = "O pedido sai da sua lista. Ele continua registrado e não é apagado.";
  const confirmar = botaoSecundario("Confirmar ocultação", async () => {
    if (caixa.dataset.excluindo === "1") return;
    caixa.dataset.excluindo = "1";
    confirmar.disabled = true;
    await alterarVisibilidade(artigo, pedido, loja, true);
    if (!pedido.oculto) {
      delete caixa.dataset.excluindo;
      confirmar.disabled = false;
    }
  });
  caixa.append(
    texto,
    confirmar,
    botaoSecundario("Cancelar", () => botoesSecundarios(artigo, pedido, loja, resultado)),
  );
}

function confirmarCancelamento(artigo, pedido, loja) {
  const caixa = artigo.querySelector("[data-secundario]");
  if (!caixa) return;
  caixa.replaceChildren();
  const texto = document.createElement("p");
  texto.textContent = "Cancelar esta tentativa? Nenhum Pix foi gerado e os registros continuam guardados. Uma cobrança do Asaas não será cancelada por aqui.";
  const confirmar = botaoSecundario("Confirmar cancelamento", async () => {
    confirmar.disabled = true;
    const resultado = await loja.cancelarTentativa(pedido.txid);
    const estado = artigo.querySelector(".aviso-conta");
    if (!resultado?.ok) {
      aviso(estado, resultado?.mensagem || "O pedido não foi cancelado.");
      botoesSecundarios(artigo, pedido, loja, { cancelavel: true, ocultavel: true });
      return;
    }
    pedido.status = "cancelado";
    aplicarSituacao(artigo, pedido, loja, { ...resultado, acao: "tentativa", cancelavel: false, ocultavel: true });
  });
  caixa.append(texto, confirmar, botaoSecundario("Voltar", () => botoesSecundarios(artigo, pedido, loja, { cancelavel: true, ocultavel: true })));
}

async function alterarVisibilidade(artigo, pedido, loja, ocultar) {
  const resultado = await loja.definirVisibilidade(pedido.txid, ocultar);
  const estado = artigo.querySelector(".aviso-conta");
  if (!resultado?.ok) {
    aviso(estado, resultado?.mensagem || "A visualização não mudou.");
    return;
  }
  pedido.oculto = ocultar;
  artigo.dispatchEvent(new CustomEvent("visibilidade-pedido", { bubbles: true }));
  if (ocultar && artigo.parentElement?.dataset.ocultos !== "sim") artigo.remove();
  else botoesSecundarios(artigo, pedido, loja, { cancelavel: false, ocultavel: !ocultar });
}

function acompanharPedido(artigo, pedido, loja, acaoInicial) {
  if (!loja.consultarPedido) return;
  let acao = acaoInicial;
  let timer = 0;
  let encerrado = false;
  const parar = () => {
    encerrado = true;
    if (timer) clearInterval(timer);
    timer = 0;
  };
  const agendar = () => {
    if (timer) clearInterval(timer);
    timer = 0;
    if (encerrado || document.hidden || !intervaloDaTela(acao, false)) return;
    timer = setInterval(consultar, 15000);
  };
  const consultar = async () => {
    if (encerrado || document.hidden) return;
    const resultado = await loja.consultarPedido(pedido.txid);
    if (encerrado) return;
    if (!resultado?.ok) {
      const marca = artigo.querySelector(".situacao");
      const estado = artigo.querySelector(".aviso-conta");
      const semPagamento = /cobrança automática ainda não está configurada|compras ainda não estão abertas/i.test(resultado?.mensagem || "");
      if (semPagamento) {
        if (marca) {
          marca.className = "situacao situacao-problema";
          marca.textContent = "Compras em preparação";
        }
        if (estado) aviso(estado, MENSAGEM_COMPRA_INDISPONIVEL);
        const link = artigo.querySelector("a.botao");
        if (link) {
          link.textContent = "Falar com o suporte";
          link.href = rota("ajuda/");
        }
        return;
      }
      if (marca && acao !== "confirmar") {
        marca.className = "situacao situacao-problema";
        marca.textContent = "Não consegui consultar";
      }
      if (estado) aviso(estado, resultado?.mensagem || "Não consegui consultar este pedido. Nenhum pagamento novo foi gerado.");
      if (acao === "confirmar") mostrarDownloads(artigo, pedido, loja, estado);
      return;
    }
    acao = resultado.acao || acao;
    aplicarSituacao(artigo, pedido, loja, resultado);
    agendar();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer) clearInterval(timer);
      timer = 0;
      return;
    }
    consultar();
  });
  window.addEventListener("pagehide", parar, { once: true });
  consultar();
}

function ligarSaida(loja) {
  document.querySelectorAll("[data-sair-conta]").forEach((botao) => {
    botao.addEventListener("click", () => {
      acionarSaida(botao, () => loja.sair());
    });
  });
}

function abrirMateriaisPedidos() {
  if (location.hash !== "#materiais") return;
  const compras = document.querySelector("#area-compras");
  const titulo = document.querySelector("#materiais");
  const botao = document.querySelector("#mostrar-compras");
  if (compras) compras.hidden = false;
  if (titulo) titulo.hidden = false;
  if (botao) {
    botao.setAttribute("aria-expanded", "true");
    botao.textContent = "Ocultar minhas compras";
  }
  (titulo || compras)?.scrollIntoView({ block: "start" });
}

function linkDaEntrada() {
  if (location.hash !== "#materiais") return rota("entrar/");
  try { sessionStorage.setItem("depois", "minha-conta/#materiais"); } catch { /* o parâmetro da URL preserva o retorno */ }
  return `${rota("entrar/")}?depois=${encodeURIComponent("minha-conta/#materiais")}`;
}

function escrever(elemento, texto, href, rotulo) {
  elemento.replaceChildren(document.createTextNode(texto));
  if (!href) return;
  elemento.append(" ");
  const link = document.createElement("a");
  link.href = href;
  link.textContent = rotulo;
  elemento.append(link);
}

function indicador(item) {
  const artigo = document.createElement("article");
  artigo.className = "indicador";
  const nome = document.createElement("span");
  nome.textContent = item.rotulo;
  const forte = document.createElement("strong");
  forte.textContent = item.dinheiro ? moeda.format(item.valor) : item.valor;
  const nota = document.createElement("small");
  nota.textContent = item.nota;
  artigo.append(nome, forte, nota);
  return artigo;
}

function mostrarAdministracao(dados, resumo) {
  const bloco = document.querySelector("#conta-admin");
  const compras = document.querySelector("#area-compras");
  compras.hidden = true;
  bloco.classList.add("liberado");
  bloco.hidden = false;
  document.querySelector("#topo-cliente").hidden = true;
  document.querySelector("#titulo-compras").hidden = false;
  document.querySelector("#conta-cargo").textContent = resumo.cargo;
  document.querySelector("#saudacao-admin").textContent = dados?.nome ? `Olá, ${dados.nome}` : "Conta administrativa";
  document.querySelector("#conta-admin-texto").textContent = resumo.texto;
  document.querySelector("#abrir-painel").href = rota("gerenciar/");
  document.querySelector("#sair-admin").hidden = false;
  const caixa = document.querySelector("#indicadores-conta");
  const avisoIndicadores = document.querySelector("#indicadores-aviso");
  if (!resumo.indicadores) {
    avisoIndicadores.hidden = false;
    avisoIndicadores.textContent = "Não consegui ler os números da loja agora. O gerenciamento continua disponível.";
  } else {
    caixa.replaceChildren(...resumo.indicadores.map(indicador));
    if (resumo.semPedidos) {
      avisoIndicadores.hidden = false;
      avisoIndicadores.classList.add("aviso-ok");
      avisoIndicadores.textContent = "Ainda não há pedidos. Os materiais cadastrados continuam na loja.";
    }
  }
  const atalhos = document.querySelector("#atalhos-conta");
  resumo.atalhos.forEach((atalho) => {
    const link = document.createElement("a");
    link.className = "atalho-conta";
    link.href = rota(`gerenciar/#${atalho.hash}`);
    link.textContent = atalho.texto;
    atalhos.append(link);
  });
  const botao = document.querySelector("#mostrar-compras");
  botao.addEventListener("click", () => {
    const aberto = compras.hidden;
    compras.hidden = !aberto;
    botao.setAttribute("aria-expanded", String(aberto));
    botao.textContent = aberto ? "Ocultar minhas compras" : "Minhas compras";
  });
}

function rotuloStatus(status) {
  if (status === "atendimento") return "Em atendimento";
  if (status === "resolvido") return "Resolvido";
  return "Aberto";
}

async function mostrarSolicitacoes(loja) {
  const destino = document.querySelector("#minhas-solicitacoes");
  if (!destino || !loja.listarSolicitacoes) return;
  const resultado = await loja.listarSolicitacoes();
  destino.replaceChildren();
  if (!resultado.ok) {
    if (!resultado.ausente) {
      const avisoLista = document.createElement("p");
      avisoLista.textContent = resultado.mensagem || "Não foi possível ler seus pedidos de ajuda.";
      destino.append(avisoLista);
    }
    return;
  }
  if (!resultado.solicitacoes.length) return;
  const titulo = document.createElement("h3");
  titulo.textContent = "Seus pedidos de ajuda";
  destino.append(titulo);
  for (const item of resultado.solicitacoes) {
    const artigo = document.createElement("article");
    const cabeca = document.createElement("p");
    const protocolo = protocoloVisivel(item);
    cabeca.textContent = `${rotuloSolicitacao(item.status)}${protocolo ? ` · ${protocolo}` : ""}${item.txid ? ` · Pedido ${item.txid}` : ""}`;
    artigo.append(cabeca);
    for (const mensagem of item.mensagens || []) {
      const linha = document.createElement("p");
      const quem = mensagem.autor_id === item.usuario_id ? "Você" : "Equipe";
      const data = mensagem.criado_em ? quando.format(new Date(mensagem.criado_em)) : "";
      linha.textContent = `${quem}${data ? ` · ${data}` : ""}: ${mensagem.texto}`;
      artigo.append(linha);
    }
    const resposta = document.createElement("form");
    const campo = document.createElement("textarea");
    campo.rows = 3;
    campo.required = true;
    campo.placeholder = "Escreva uma nova mensagem";
    const enviar = document.createElement("button");
    enviar.className = "botao botao-secundario";
    enviar.type = "submit";
    enviar.textContent = "Enviar resposta";
    resposta.append(campo, enviar);
    resposta.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      if (resposta.dataset.enviando === "1") return;
      const texto = campo.value.trim();
      if (texto.length < 2 || !loja.responderSolicitacao) return;
      resposta.dataset.enviando = "1";
      enviar.disabled = true;
      const gravado = await loja.responderSolicitacao(item.id, texto);
      delete resposta.dataset.enviando;
      enviar.disabled = false;
      aviso(document.querySelector("#ajuda-aviso"), gravado.ok ? "Resposta enviada." : gravado.mensagem, Boolean(gravado.ok));
      if (gravado.ok) mostrarSolicitacoes(loja);
    });
    artigo.append(resposta);
    destino.append(artigo);
  }
}

export async function iniciarMinhas(loja) {
  const lista = document.querySelector("#lista-pedidos");
  const vazio = document.querySelector("#conta-vazia");
  const saudacao = document.querySelector("#saudacao");
  ligarSaida(loja);

  if (!loja.configurada) {
    vazio.hidden = false;
    vazio.textContent = "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.";
    return;
  }
  const sessao = await loja.sessao();
  if (!sessao) {
    vazio.hidden = false;
    escrever(vazio, "Entre para ver os materiais que você comprou.", linkDaEntrada(), "Entrar");
    abrirMateriaisPedidos();
    return;
  }
  const ajuda = document.querySelector("#abrir-ajuda");
  const painelAjuda = document.querySelector("#ajuda-conta");
  ajuda.hidden = false;
  ajuda.addEventListener("click", () => {
    painelAjuda.hidden = false;
    ajuda.hidden = true;
    mostrarSolicitacoes(loja);
  });
  document.querySelector("#form-ajuda")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const campos = new FormData(formulario);
    const assunto = String(campos.get("assunto") || "outro");
    const pedido = String(campos.get("pedido") || "").trim();
    const texto = String(campos.get("texto") || "").trim();
    const estado = document.querySelector("#ajuda-aviso");
    const botao = formulario.querySelector("button[type=submit]");
    if (formulario.dataset.enviando === "1") return;
    formulario.dataset.enviando = "1";
    if (botao) botao.disabled = true;
    const liberar = () => {
      delete formulario.dataset.enviando;
      if (botao) botao.disabled = false;
    };
    if (texto.length < 8) {
      liberar();
      aviso(estado, "Escreva a mensagem com um pouco mais de detalhe.");
      return;
    }
    const relato = pedido ? `Pedido informado: ${pedido}\n${texto}` : texto;
    const resultado = loja.abrirSolicitacao
      ? await loja.abrirSolicitacao({ assunto, txid: pedido, texto: relato })
      : { ok: false, ausente: true };
    if (resultado.ok) {
      aviso(estado, `Pedido de ajuda registrado. Protocolo ${protocoloVisivel(resultado)}. A Letícia responde por aqui.`, true);
      formulario.reset();
      liberar();
      await mostrarSolicitacoes(loja);
      return;
    }
    liberar();
    if (resultado.ausente) {
      const link = document.createElement("a");
      link.href = linkAjuda({ txid: pedido, motivo: texto });
      link.textContent = "Abrir e-mail para a Letícia";
      estado.replaceChildren(document.createTextNode("A central ainda não está instalada no banco. "), link);
      return;
    }
    aviso(estado, resultado.mensagem || "Não foi possível registrar agora.");
  });
  const dados = await loja.perfil();
  saudacao.textContent = dados?.nome ? `Olá, ${dados.nome}` : "Minha conta";
  document.querySelector("#sair").hidden = false;
  const gestao = administra(dados?.papel);
  if (gestao) {
    document.querySelectorAll(".so-admin").forEach((link) => link.classList.add("visivel"));
    let resumo = resumoAdministrativo({ perfil: dados, atividades: null, pedidos: null });
    try {
      const [atividades, painel] = await Promise.all([loja.atividades(), loja.painel()]);
      resumo = resumoAdministrativo({ perfil: dados, atividades, pedidos: painel.pedidos });
    } catch {
      resumo = resumoAdministrativo({ perfil: dados, atividades: null, pedidos: null });
    }
    const nivel = loja.nivelAcesso ? await loja.nivelAcesso() : { ok: false };
    const leitura = leituraAdministrativa(nivel, dados?.papel);
    if (leitura !== "ok") resumo = { ...resumo, indicadores: null, bloqueio: leitura };
    mostrarAdministracao(dados, resumo);
  }
  const pedidos = await loja.meusPedidos();
  if (!pedidos.length) {
    vazio.hidden = false;
    if (gestao) {
      vazio.textContent = "Nenhuma compra nesta conta. Os materiais da loja continuam cadastrados.";
    } else {
      escrever(vazio, "Você ainda não comprou materiais. Quando o pagamento for confirmado, o PDF aparece aqui.", rota("atividades/"), "Ver materiais");
    }
    return;
  }
  const grupos = agruparPorCodigo(pedidos).filter((pedido) => !pedido.oculto);
  if (!grupos.length) {
    vazio.hidden = false;
    if (gestao) {
      vazio.textContent = "Nenhuma compra nesta conta. Os materiais da loja continuam cadastrados.";
    } else {
      escrever(vazio, "Você ainda não comprou materiais. Quando o pagamento for confirmado, o PDF aparece aqui.", rota("atividades/"), "Ver materiais");
    }
    return;
  }
  const pintar = () => {
    const visiveis = grupos.filter((pedido) => !pedido.oculto);
    lista.replaceChildren();
    if (!visiveis.length) {
      vazio.hidden = false;
      if (gestao) vazio.textContent = "Nenhuma compra nesta conta. Os materiais da loja continuam cadastrados.";
      else escrever(vazio, "Você ainda não comprou materiais. Quando o pagamento for confirmado, o PDF aparece aqui.", rota("atividades/"), "Ver materiais");
      return;
    }
    vazio.hidden = true;
    visiveis.forEach((pedido) => lista.append(cartaoPedido(pedido, loja)));
  };
  lista.addEventListener("visibilidade-pedido", pintar);
  pintar();
  abrirMateriaisPedidos();
}
