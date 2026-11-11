import { abrirEdicao, prepararCadastro } from "./cadastro.js";
import { aviso, moeda, quando } from "./avisos.js";

function blocoConta(conta) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const nome = document.createElement("h3");
  nome.textContent = conta.nome;
  const email = document.createElement("p");
  email.textContent = `${conta.email} · ${conta.papel === "admin" ? "administra a loja" : "cliente"}`;
  artigo.append(nome, email);
  return artigo;
}

function blocoPedido(pedido, loja, status) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  artigo.dataset.txid = pedido.txid;
  const pessoa = pedido.perfis || {};
  const titulo = document.createElement("h3");
  titulo.textContent = pedido.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${pessoa.nome || "Sem nome"} · ${pessoa.email || ""} · ${moeda.format(Number(pedido.valor))} · ${pedido.txid} · ${quando.format(new Date(pedido.criado_em))}`;
  artigo.append(titulo, meta);
  if (pedido.status === "pago") {
    const pago = document.createElement("p");
    pago.textContent = "Pix confirmado. O download já está na conta dela.";
    artigo.append(pago);
  } else {
    const botao = document.createElement("button");
    botao.className = "botao";
    botao.type = "button";
    botao.textContent = "Confirmar Pix";
    botao.addEventListener("click", async () => {
      botao.disabled = true;
      const resultado = await loja.confirmar(pedido.id);
      if (!resultado.ok) {
        aviso(status, resultado.mensagem);
        botao.disabled = false;
        return;
      }
      const avisoPago = () => Object.assign(document.createElement("p"), { textContent: "Pix confirmado. O download já está na conta dela." });
      document.querySelectorAll(`.item-conta[data-txid="${CSS.escape(pedido.txid)}"]`).forEach((bloco) => {
        const acao = bloco.querySelector("button");
        if (acao) acao.replaceWith(avisoPago());
      });
    });
    artigo.append(botao);
  }
  return artigo;
}

function chavePeriodo(data, modo) {
  const fuso = { timeZone: "America/Sao_Paulo" };
  if (modo === "ano") return new Intl.DateTimeFormat("pt-BR", { ...fuso, year: "numeric" }).format(data);
  if (modo === "mes") return new Intl.DateTimeFormat("pt-BR", { ...fuso, month: "long", year: "numeric" }).format(data);
  return new Intl.DateTimeFormat("pt-BR", { ...fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(data);
}

function pintarLucros(pedidos, modo) {
  const total = document.querySelector("#lucro-total");
  const lista = document.querySelector("#lista-lucros");
  const pagos = pedidos.filter((pedido) => pedido.status === "pago");
  const aguardando = pedidos.filter((pedido) => pedido.status !== "pago").length;
  const soma = pagos.reduce((acumulado, pedido) => acumulado + Number(pedido.valor), 0);
  total.textContent = `${moeda.format(soma)} em ${pagos.length} ${pagos.length === 1 ? "venda confirmada" : "vendas confirmadas"}`;
  lista.replaceChildren();
  if (aguardando) {
    const nota = document.createElement("p");
    nota.textContent = aguardando === 1
      ? "Há 1 pedido aguardando a confirmação do Pix. Esse valor ainda não entra no lucro."
      : `Há ${aguardando} pedidos aguardando a confirmação do Pix. Esses valores ainda não entram no lucro.`;
    lista.append(nota);
  }
  if (!pagos.length) {
    const vazio = document.createElement("p");
    vazio.textContent = "Nenhuma venda confirmada ainda.";
    lista.append(vazio);
    return;
  }
  const grupos = new Map();
  pagos.forEach((pedido) => {
    const chave = chavePeriodo(new Date(pedido.criado_em), modo);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(pedido);
  });
  grupos.forEach((itens, chave) => {
    const artigo = document.createElement("article");
    artigo.className = "item-conta";
    const titulo = document.createElement("h3");
    const valor = itens.reduce((acumulado, pedido) => acumulado + Number(pedido.valor), 0);
    titulo.textContent = `${chave} · ${moeda.format(valor)}`;
    artigo.append(titulo);
    const porAtividade = new Map();
    itens.forEach((pedido) => {
      const atual = porAtividade.get(pedido.titulo) || { quantidade: 0, valor: 0 };
      atual.quantidade += 1;
      atual.valor += Number(pedido.valor);
      porAtividade.set(pedido.titulo, atual);
    });
    porAtividade.forEach((info, nome) => {
      const linha = document.createElement("p");
      linha.textContent = `${nome} · ${info.quantidade} ${info.quantidade === 1 ? "venda" : "vendas"} · ${moeda.format(info.valor)}`;
      artigo.append(linha);
    });
    lista.append(artigo);
  });
}

function cartaoAtividadeAdmin(loja, atividade, lista) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  artigo.dataset.atividade = atividade.id;
  const titulo = document.createElement("h3");
  titulo.textContent = atividade.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(atividade.preco))} · ${atividade.resumo || "Sem descrição breve."}`;
  const acoes = document.createElement("div");
  acoes.className = "acoes";
  const ver = document.createElement("a");
  ver.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
  ver.textContent = "Ver a página";
  const editar = document.createElement("button");
  editar.className = "botao botao-secundario";
  editar.type = "button";
  editar.textContent = "Editar";
  editar.addEventListener("click", () => abrirEdicao(atividade));
  const baixar = document.createElement("button");
  baixar.className = "botao botao-secundario";
  baixar.type = "button";
  baixar.textContent = "Baixar";
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.setAttribute("role", "status");
  baixar.addEventListener("click", async () => {
    baixar.disabled = true;
    try {
      await loja.baixar(atividade.id);
      aviso(estado, "O download começou.", true);
    } catch {
      aviso(estado, "O PDF ainda não foi guardado. Envie o arquivo ao criar a atividade, ou de novo por aqui.");
    }
    baixar.disabled = false;
  });
  const arquivo = document.createElement("input");
  arquivo.type = "file";
  arquivo.accept = "application/pdf";
  arquivo.setAttribute("aria-label", "Trocar o PDF");
  arquivo.addEventListener("change", async () => {
    const pdf = arquivo.files?.[0];
    if (!pdf) return;
    const resultado = await loja.enviarPdf(atividade.id, pdf, atividade.arquivo);
    aviso(estado, resultado.ok ? "PDF guardado. Quem administra e quem já pagou conseguem baixar." : resultado.mensagem, resultado.ok);
    arquivo.value = "";
  });
  const destaque = document.createElement("label");
  destaque.className = "marca-destaque";
  const caixa = document.createElement("input");
  caixa.type = "checkbox";
  caixa.dataset.destaque = atividade.id;
  caixa.checked = atividade.destaque !== false && !atividade.foraDoBanco;
  caixa.addEventListener("change", async () => {
    const ligar = caixa.checked;
    const marcadas = lista.querySelectorAll("[data-destaque]:checked").length;
    if (ligar && marcadas > 4) {
      caixa.checked = false;
      aviso(estado, "A vitrine mostra no máximo 4. Tire uma do destaque antes.");
      return;
    }
    if (atividade.foraDoBanco) {
      caixa.checked = !ligar;
      aviso(estado, "Essa atividade ainda não está no banco, então a escolha não fica salva.");
      return;
    }
    caixa.disabled = true;
    const resultado = await loja.definirDestaque(atividade.id, ligar);
    caixa.disabled = false;
    if (!resultado.ok) {
      caixa.checked = !ligar;
      aviso(estado, resultado.mensagem);
      return;
    }
    aviso(estado, ligar ? "Entrou em Materiais em destaque." : "Saiu de Materiais em destaque.", true);
  });
  destaque.append(caixa, document.createTextNode("Em destaque"));
  acoes.append(ver, editar, baixar);
  artigo.append(titulo, meta, acoes, destaque, arquivo, estado);
  lista.prepend(artigo);
}

export async function iniciarAdmin(loja) {
  const bloqueio = document.querySelector("#admin-bloqueio");
  const corpo = document.querySelector("#admin-corpo");
  const status = document.querySelector("#admin-status");
  if (!loja?.configurada) {
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
  if (dados?.papel !== "admin") {
    document.querySelector("#cadastro-atividade").hidden = true;
    bloqueio.hidden = false;
    bloqueio.textContent = "Esta área é só de quem administra a loja.";
    return;
  }
  corpo.hidden = false;
  document.querySelector("#sair").hidden = false;
  document.querySelector("#sair").addEventListener("click", () => loja.sair());

  let painel;
  let atividades = [];
  try {
    [painel, atividades] = await Promise.all([loja.painel(), loja.atividades()]);
  } catch {
    aviso(status, "Não foi possível carregar o painel.");
    return;
  }

  let periodo = "dia";
  const pintar = () => pintarLucros(painel.pedidos, periodo);
  document.querySelectorAll("[data-periodo]").forEach((botao) => {
    botao.addEventListener("click", () => {
      periodo = botao.dataset.periodo;
      document.querySelectorAll("[data-periodo]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === botao));
      });
      pintar();
    });
  });
  pintar();

  const listaAtividades = document.querySelector("#lista-atividades");
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
      destaque: local.destaque !== false,
      foraDoBanco: true,
    });
  });
  const todas = [...porId.values()];
  const ids = new Set(todas.map((item) => item.id));
  if (!todas.length) listaAtividades.textContent = "Nenhuma atividade no site ainda.";
  todas.forEach((atividade) => cartaoAtividadeAdmin(loja, atividade, listaAtividades));
  prepararCadastro(loja, ids, (criada) => {
    if (!listaAtividades.querySelector(".item-conta")) listaAtividades.replaceChildren();
    cartaoAtividadeAdmin(loja, criada, listaAtividades);
  });

  const contas = document.querySelector("#lista-contas");
  const pedidos = document.querySelector("#lista-admin");
  if (!painel.contas.length) contas.append("Nenhuma conta ainda.");
  painel.contas.forEach((conta) => contas.append(blocoConta(conta)));
  if (!painel.pedidos.length) pedidos.append("Nenhum pedido ainda.");
  painel.pedidos.forEach((pedido) => pedidos.append(blocoPedido(pedido, loja, status)));
}
