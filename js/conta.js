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
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const dados = new FormData(entrar);
    const resultado = await loja.entrar({
      email: String(dados.get("email") || "").trim(),
      senha: String(dados.get("senha") || ""),
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
    if (senha.length < 6) {
      aviso(status, "A senha precisa de 6 caracteres ou mais.");
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
      botao.replaceWith(Object.assign(document.createElement("p"), { textContent: "Pix confirmado. O download já está na conta dela." }));
    });
    artigo.append(botao);
  }
  return artigo;
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
  try {
    painel = await loja.painel();
  } catch {
    aviso(status, "Não foi possível carregar o painel.");
    return;
  }
  const contas = document.querySelector("#lista-contas");
  const pedidos = document.querySelector("#lista-admin");
  if (!painel.contas.length) contas.append("Nenhuma conta ainda.");
  painel.contas.forEach((conta) => contas.append(blocoConta(conta)));
  if (!painel.pedidos.length) pedidos.append("Nenhum pedido ainda.");
  painel.pedidos.forEach((pedido) => pedidos.append(blocoPedido(pedido, loja, status)));

  document.querySelector("#enviar-pdf").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const arquivo = evento.target.querySelector("input").files[0];
    const estado = document.querySelector("#pdf-status");
    if (!arquivo) return;
    const resultado = await loja.enviarPdf(arquivo);
    aviso(estado, resultado.ok ? "PDF guardado. Quem já pagou consegue baixar." : resultado.mensagem, resultado.ok);
  });
}

const pagina = document.body.dataset.pagina;
preparar().then((loja) => {
  if (pagina === "entrar") iniciarEntrar(loja);
  if (pagina === "minhas") iniciarMinhas(loja);
  if (pagina === "admin") iniciarAdmin(loja);
});
