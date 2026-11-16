import { aviso, moeda } from "./avisos.js";
import { acionarSaida } from "./saida.js";
import { resumoAdministrativo } from "./apresentacao.js?v=2";
import { administra } from "./papeis.js";
import { apresentacao, intervaloDaTela } from "./retomada.js";
import { rota } from "../rotas.js";
import { linkAjuda } from "../texto.js";

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
  if (pedido.status === "estornado") {
    artigo.append(selo("problema", "Pagamento estornado"), estado, contato(pedido, "Meu pagamento foi estornado."));
    estado.textContent = "Este pagamento foi estornado. O PDF deixa de ficar disponível.";
    return artigo;
  }
  if (pedido.status === "cancelado") {
    artigo.append(selo("problema", "Pagamento cancelado"), estado, contato(pedido, "Minha cobrança foi cancelada."));
    estado.textContent = "Esta cobrança foi cancelada. O PDF continua bloqueado.";
    return artigo;
  }
  if (pedido.status !== "pago") {
    artigo.append(
      selo("espera", "Pagamento pendente"),
      estado,
      contato(pedido, "Meu Pix ainda não foi confirmado."),
    );
    estado.textContent = "O pagamento ainda não entrou. O PDF fica bloqueado até a confirmação.";
    artigo.append(botaoDaConta(pedido, "continuar"));
    acompanharPedido(artigo, pedido, loja, "continuar");
    return artigo;
  }
  artigo.append(selo("ok", "Pagamento confirmado"), estado, contato(pedido, "Preciso de ajuda com este pedido."));
  estado.textContent = "Pagamento confirmado. O material aparece quando a liberação estiver pronta.";
  acompanharPedido(artigo, pedido, loja, "confirmar");
  return artigo;
}

function botaoDownload(pedido, loja) {
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.textContent = "Baixar atividade";
  botao.addEventListener("click", async () => {
    const estado = botao.parentElement?.querySelector(".aviso-conta");
    botao.disabled = true;
    try {
      await loja.baixar(pedido.atividade_id);
      if (estado) aviso(estado, "O download começou.", true);
    } catch (erro) {
      botao.parentElement?.querySelector(".situacao")?.replaceWith(selo("problema", "Problema para baixar"));
      const mensagem = erro?.message === "entrar"
        ? "Entre de novo para baixar este material."
        : erro?.message === "negado"
          ? "Este material ainda não está liberado."
          : erro?.message === "tentar"
            ? "O download não respondeu. Tente de novo."
            : "O PDF não saiu. Fale com a Letícia e informe o código do pedido.";
      if (estado) aviso(estado, mensagem);
      if (estado && !botao.parentElement.querySelector("a[href^='mailto:']")) {
        botao.parentElement.append(contato(pedido, "O pagamento está confirmado, mas o PDF não baixou."));
      }
    }
    botao.disabled = false;
  });
  return botao;
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
  if (resultado.imagem) {
    const imagem = document.createElement("img");
    imagem.alt = "QR Code Pix da cobrança";
    imagem.width = 180;
    imagem.height = 180;
    imagem.src = String(resultado.imagem).startsWith("data:")
      ? resultado.imagem
      : `data:image/png;base64,${resultado.imagem}`;
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
    antigo?.remove();
    if (!artigo.querySelector("button.botao")) artigo.insertBefore(botaoDownload(pedido, loja), estado);
    return;
  }
  if (!visual.botao) {
    antigo?.remove();
    return;
  }
  const botao = antigo || botaoDaConta(pedido, resultado.acao);
  botao.dataset.acao = resultado.acao;
  botao.textContent = visual.botao;
  botao.disabled = false;
  if (!antigo) artigo.insertBefore(botao, estado);
  ligarBotao(artigo, pedido, loja, botao);
}

function ligarBotao(artigo, pedido, loja, botao) {
  if (!botao || botao.dataset.ligado) return;
  botao.dataset.ligado = "sim";
  botao.addEventListener("click", () => agirNoPedido(artigo, pedido, loja));
}

function acompanharPedido(artigo, pedido, loja, acaoInicial) {
  if (!loja.consultarPedido) return;
  let acao = acaoInicial;
  let timer = 0;
  let encerrado = false;
  ligarBotao(artigo, pedido, loja, artigo.querySelector("button.botao"));
  const parar = () => {
    encerrado = true;
    if (timer) clearInterval(timer);
    timer = 0;
  };
  const consultar = async () => {
    if (encerrado || document.hidden) return;
    const resultado = await loja.consultarPedido(pedido.txid);
    if (encerrado) return;
    if (!resultado?.ok) {
      if (acao === "confirmar" && !artigo.querySelector("button.botao")) {
        const estado = artigo.querySelector(".aviso-conta");
        artigo.insertBefore(botaoDownload(pedido, loja), estado);
      }
      return;
    }
    acao = resultado.acao || acao;
    aplicarSituacao(artigo, pedido, loja, resultado);
    if (!intervaloDaTela(acao, false)) parar();
  };
  const retomar = () => {
    if (encerrado || timer || !intervaloDaTela(acao, false)) return;
    consultar();
    timer = setInterval(consultar, 15000);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer) clearInterval(timer);
      timer = 0;
      return;
    }
    retomar();
  });
  window.addEventListener("pagehide", parar, { once: true });
  retomar();
}

function ligarSaida(loja) {
  document.querySelectorAll("[data-sair-conta]").forEach((botao) => {
    botao.addEventListener("click", () => {
      acionarSaida(botao, () => loja.sair());
    });
  });
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
    cabeca.textContent = `${rotuloStatus(item.status)}${item.txid ? ` · Pedido ${item.txid}` : ""}`;
    artigo.append(cabeca);
    for (const mensagem of item.mensagens || []) {
      const linha = document.createElement("p");
      linha.textContent = mensagem.texto;
      artigo.append(linha);
    }
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
    escrever(vazio, "Entre para ver os materiais que você comprou.", rota("entrar/"), "Entrar");
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
    if (texto.length < 8) {
      aviso(estado, "Escreva a mensagem com um pouco mais de detalhe.");
      return;
    }
    const relato = pedido ? `Pedido informado: ${pedido}\n${texto}` : texto;
    const resultado = loja.abrirSolicitacao
      ? await loja.abrirSolicitacao({ assunto, txid: pedido, texto: relato })
      : { ok: false, ausente: true };
    if (resultado.ok) {
      aviso(estado, "Pedido de ajuda registrado. A Letícia consegue acompanhá-lo no painel.", true);
      formulario.reset();
      await mostrarSolicitacoes(loja);
      return;
    }
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
  const porCodigo = new Map();
  pedidos.forEach((pedido) => {
    const ids = porCodigo.get(pedido.txid) || [];
    ids.push(pedido.atividade_id);
    porCodigo.set(pedido.txid, ids);
  });
  pedidos.forEach((pedido) => lista.append(cartaoPedido({ ...pedido, atividades: porCodigo.get(pedido.txid) }, loja)));
}
