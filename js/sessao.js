const destinos = new Set(["minhas.html", "admin.html", "index.html", "index.html#atividades"]);

function traduzir(erro) {
  const texto = String(erro?.message || erro || "");
  if (/invalid login/i.test(texto)) return "E-mail ou senha não conferem.";
  if (/already registered|already been registered/i.test(texto)) return "Já existe uma conta com este e-mail.";
  if (/email not confirmed/i.test(texto)) return "Confirme o e-mail antes de entrar. Veja a caixa de entrada.";
  if (/password/i.test(texto)) return "A senha precisa de 6 caracteres ou mais.";
  if (/Entre na conta|Sem permissão|indisponível|inválido/i.test(texto)) return texto;
  return "Não foi possível agora. Tente de novo.";
}

function destinoSeguro(valor) {
  return destinos.has(valor) ? valor : "minhas.html";
}

async function carregarConfig() {
  try {
    const modulo = await import("./supabase-config.js");
    const url = String(modulo.url || "").trim();
    const chave = String(modulo.chave || "").trim();
    if (!url || !chave) return null;
    return { url, chave };
  } catch {
    return null;
  }
}

function pintarMenu(sessao, admin) {
  document.querySelectorAll("[data-conta]").forEach((link) => {
    if (sessao) {
      link.textContent = "Minha conta";
      link.href = "minhas.html";
    } else {
      link.textContent = "Entrar";
      link.href = "entrar.html";
    }
  });
  document.querySelectorAll(".so-admin").forEach((link) => {
    link.classList.toggle("visivel", Boolean(admin));
  });
}

async function iniciar() {
  const config = await carregarConfig();
  let cliente = null;
  if (config) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm");
    cliente = createClient(config.url, config.chave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function sessao() {
    if (!cliente) return null;
    const { data } = await cliente.auth.getSession();
    return data.session;
  }

  async function perfil() {
    const atual = await sessao();
    if (!atual) return null;
    const { data } = await cliente.from("perfis").select("nome, email, papel").eq("id", atual.user.id).maybeSingle();
    return data;
  }

  const api = {
    configurada: Boolean(cliente),
    traduzir,
    destinoSeguro,
    sessao,
    perfil,
    async criarConta({ nome, email, senha }) {
      const { data, error } = await cliente.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      if (!data.session) {
        return { ok: true, confirmarEmail: true };
      }
      return { ok: true, confirmarEmail: false };
    },
    async entrar({ email, senha }) {
      const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async sair() {
      if (cliente) await cliente.auth.signOut();
      location.href = "index.html";
    },
    async registrarPedido(atividadeId, txid) {
      const { error } = await cliente.rpc("criar_pedido", { atividade: atividadeId, txid });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async meusPedidos() {
      const { data, error } = await cliente
        .from("pedidos")
        .select("id, atividade_id, titulo, valor, txid, status, criado_em")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async arquivoDa(atividadeId) {
      const { data } = await cliente.from("atividades").select("arquivo").eq("id", atividadeId).maybeSingle();
      return data?.arquivo || "";
    },
    async baixar(atividadeId) {
      const arquivo = await api.arquivoDa(atividadeId);
      if (!arquivo) throw new Error("arquivo");
      const { data, error } = await cliente.storage.from("atividades").createSignedUrl(`${atividadeId}/${arquivo}`, 120);
      if (error || !data?.signedUrl) throw error || new Error("arquivo");
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
    },
    async painel() {
      const [{ data: contas, error: erroContas }, { data: pedidos, error: erroPedidos }] = await Promise.all([
        cliente.from("perfis").select("id, nome, email, papel").order("nome"),
        cliente.from("pedidos").select("id, titulo, valor, txid, status, criado_em, perfis(nome, email)").order("criado_em", { ascending: false }),
      ]);
      if (erroContas) throw erroContas;
      if (erroPedidos) throw erroPedidos;
      return { contas: contas || [], pedidos: pedidos || [] };
    },
    async confirmar(id) {
      const { error } = await cliente.rpc("confirmar_pix", { pedido: id });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async enviarPdf(arquivo) {
      const { error } = await cliente.storage.from("atividades").upload("adicao/situacoes-problema-adicao.pdf", arquivo, {
        upsert: true,
        contentType: "application/pdf",
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
  };

  let atual = null;
  let admin = false;
  if (cliente) {
    atual = await sessao();
    const dados = atual ? await perfil() : null;
    admin = dados?.papel === "admin";
  }
  pintarMenu(atual, admin);
  window.contaLoja = api;
  return api;
}

window.contaPronta = iniciar();
