const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function aviso(elemento, mensagem, ok) {
  elemento.textContent = mensagem;
  elemento.classList.toggle("aviso-ok", Boolean(ok));
}

function faltaBanco(elemento) {
  aviso(elemento, "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.");
}

async function preparar() {
  const loja = await window.contaPronta;
  return loja;
}

function iniciarEntrar(loja) {
  const entrar = document.querySelector("#form-entrar");
  const criar = document.querySelector("#form-criar");
  const painelCriar = document.querySelector("#painel-criar");
  const painelEntrar = document.querySelector("#painel-entrar");

  document.querySelector("#mostrar-criar").addEventListener("click", () => {
    painelEntrar.hidden = true;
    painelCriar.hidden = false;
  });
  document.querySelector("#mostrar-entrar").addEventListener("click", () => {
    painelCriar.hidden = true;
    painelEntrar.hidden = false;
  });

  entrar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const status = entrar.querySelector(".aviso-conta");
    const dados = new FormData(entrar);
    const senha = String(dados.get("senha") || "");
    if (senha.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const resultado = await loja.entrar({
      email: String(dados.get("email") || "").trim(),
      senha,
    });
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      return;
    }
    const depois = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois");
    sessionStorage.removeItem("depois");
    location.href = loja.destinoSeguro(depois);
  });

  criar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const status = criar.querySelector(".aviso-conta");
    const dados = new FormData(criar);
    const nome = String(dados.get("nome") || "").trim();
    const senha = String(dados.get("senha") || "");
    if (nome.length < 2) {
      aviso(status, "Escreva seu nome.");
      return;
    }
    if (senha.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const resultado = await loja.criarConta({
      nome,
      email: String(dados.get("email") || "").trim(),
      senha,
    });
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      return;
    }
    if (resultado.confirmarEmail) {
      aviso(status, "Conta criada. Confirme o e-mail e depois entre.", true);
      return;
    }
    const depois = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois");
    sessionStorage.removeItem("depois");
    location.href = loja.destinoSeguro(depois);
  });
}

function cartaoPedido(pedido, loja) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const titulo = document.createElement("h3");
  titulo.textContent = pedido.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(pedido.valor))} · pedido ${pedido.txid}`;
  artigo.append(titulo, meta);
  if (pedido.status === "pago") {
    const botao = document.createElement("button");
    botao.className = "botao";
    botao.type = "button";
    botao.textContent = "Baixar atividade";
    const estado = document.createElement("p");
    estado.className = "aviso-conta";
    estado.setAttribute("role", "status");
    botao.addEventListener("click", async () => {
      botao.disabled = true;
      try {
        await loja.baixar(pedido.atividade_id);
        aviso(estado, "O download começou.", true);
      } catch {
        aviso(estado, "O PDF ainda não está na área segura. Avisa a Letícia.");
      }
      botao.disabled = false;
    });
    artigo.append(botao, estado);
  } else {
    const espera = document.createElement("p");
    espera.textContent = "Aguardando a Letícia confirmar o Pix. Depois o download aparece aqui.";
    artigo.append(espera);
  }
  return artigo;
}

async function iniciarMinhas(loja) {
  const lista = document.querySelector("#lista-pedidos");
  const vazio = document.querySelector("#conta-vazia");
  const saudacao = document.querySelector("#saudacao");
  const sair = document.querySelector("#sair");
  sair.addEventListener("click", () => loja.sair());

  if (!loja.configurada) {
    vazio.hidden = false;
    vazio.textContent = "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.";
    return;
  }
  const sessao = await loja.sessao();
  if (!sessao) {
    vazio.hidden = false;
    vazio.textContent = "Entre para ver as atividades que você comprou.";
    return;
  }
  const dados = await loja.perfil();
  saudacao.textContent = dados?.nome ? `Olá, ${dados.nome}` : "Minha conta";
  sair.hidden = false;
  if (dados?.papel === "admin") {
    document.querySelectorAll(".so-admin").forEach((link) => link.classList.add("visivel"));
  }
  const pedidos = await loja.meusPedidos();
  if (!pedidos.length) {
    vazio.hidden = false;
    vazio.textContent = "Você ainda não tem atividades. A de adição com apoio visual está na loja.";
    return;
  }
  pedidos.forEach((pedido) => lista.append(cartaoPedido(pedido, loja)));
}

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

function cartaoAtividadeAdmin(loja, atividade, lista) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const titulo = document.createElement("h3");
  titulo.textContent = atividade.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(atividade.preco))} · ${atividade.resumo || "Sem descrição breve."}`;
  const acoes = document.createElement("div");
  acoes.className = "acoes";
  const ver = document.createElement("a");
  ver.href = `atividade.html?id=${encodeURIComponent(atividade.id)}`;
  ver.textContent = "Ver a página";
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
  arquivo.addEventListener("change", async () => {
    const pdf = arquivo.files?.[0];
    if (!pdf) return;
    const resultado = await loja.enviarPdf(atividade.id, pdf, atividade.arquivo);
    aviso(estado, resultado.ok ? "PDF guardado. Quem administra e quem já pagou conseguem baixar." : resultado.mensagem, resultado.ok);
    arquivo.value = "";
  });
  acoes.append(ver, baixar);
  artigo.append(titulo, meta, acoes, arquivo, estado);
  lista.prepend(artigo);
}

async function iniciarAdmin(loja) {
  const bloqueio = document.querySelector("#admin-bloqueio");
  const corpo = document.querySelector("#admin-corpo");
  const status = document.querySelector("#admin-status");
  if (!loja.configurada) {
    bloqueio.hidden = false;
    bloqueio.textContent = "O painel ainda não está ligado ao banco. O próximo passo é criar o projeto no Supabase.";
    return;
  }
  const sessao = await loja.sessao();
  if (!sessao) {
    location.href = "entrar.html?depois=admin.html";
    return;
  }
  const dados = await loja.perfil();
  if (dados?.papel !== "admin") {
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
  const ids = new Set(atividades.map((item) => item.id));
  if (!atividades.length) listaAtividades.textContent = "Nenhuma atividade no site ainda.";
  atividades.forEach((atividade) => cartaoAtividadeAdmin(loja, atividade, listaAtividades));

  document.querySelector("#nova-atividade").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const estado = document.querySelector("#nova-status");
    const campos = new FormData(formulario);
    const titulo = String(campos.get("titulo") || "").trim();
    const resumo = String(campos.get("resumo") || "").trim();
    const explicacao = String(campos.get("explicacao") || "").trim();
    const preco = Number(campos.get("preco"));
    if (titulo.length < 3) {
      aviso(estado, "Diga qual é a atividade.");
      return;
    }
    if (resumo.length < 10) {
      aviso(estado, "Escreva uma descrição breve.");
      return;
    }
    if (explicacao.length < 20) {
      aviso(estado, "Explique o que a pessoa pode esperar.");
      return;
    }
    if (!preco || preco <= 0) {
      aviso(estado, "O valor precisa ser maior que zero.");
      return;
    }
    const id = slugAtividade(titulo, ids);
    const resultado = await loja.criarAtividade({
      id,
      titulo,
      resumo,
      explicacao,
      preco,
      uso: "AEE e sala regular",
      inclui: String(campos.get("inclui") || "").trim(),
      habilidades: String(campos.get("habilidades") || "").trim(),
    });
    if (!resultado.ok) {
      aviso(estado, resultado.mensagem);
      return;
    }
    ids.add(id);
    const criada = resultado.atividade;
    const pdf = formulario.querySelector('[name="pdf"]').files[0];
    if (pdf) {
      const envio = await loja.enviarPdf(id, pdf, criada.arquivo);
      if (!envio.ok) {
        aviso(estado, `A atividade foi criada, mas o PDF não entrou. ${envio.mensagem}`);
        cartaoAtividadeAdmin(loja, criada, listaAtividades);
        return;
      }
    }
    cartaoAtividadeAdmin(loja, criada, listaAtividades);
    formulario.reset();
    formulario.querySelector('[name="preco"]').value = "10";
    const link = document.createElement("a");
    link.href = `atividade.html?id=${encodeURIComponent(id)}`;
    link.textContent = "Abrir a página exclusiva";
    estado.replaceChildren();
    estado.classList.add("aviso-ok");
    estado.append("Atividade criada. O card já entra na loja. ", link);
  });

  const contas = document.querySelector("#lista-contas");
  const pedidos = document.querySelector("#lista-admin");
  if (!painel.contas.length) contas.append("Nenhuma conta ainda.");
  painel.contas.forEach((conta) => contas.append(blocoConta(conta)));
  if (!painel.pedidos.length) pedidos.append("Nenhum pedido ainda.");
  painel.pedidos.forEach((pedido) => pedidos.append(blocoPedido(pedido, loja, status)));
}

const pagina = document.body.dataset.pagina;
preparar().then((loja) => {
  if (pagina === "entrar") iniciarEntrar(loja);
  if (pagina === "minhas") iniciarMinhas(loja);
  if (pagina === "admin") iniciarAdmin(loja);
});
