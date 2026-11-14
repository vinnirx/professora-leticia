import { caminhoPdf } from "./arquivo-seguro.js";
import { administra } from "./conta/papeis.js";

const destinos = new Set(["minhas.html", "admin.html", "index.html", "index.html#atividades", "atividade.html"]);

function migracaoAusente(erro) {
  const texto = String(erro?.message || erro || "");
  if (/could not find|schema cache|does not exist|não encontr/i.test(texto)) {
    return "A hierarquia ainda não está no banco. Rode a migração de permissões no Supabase.";
  }
  return "";
}

function traduzir(erro) {
  const texto = String(erro?.message || erro || "");
  if (/invalid login/i.test(texto)) return "E-mail ou senha não conferem.";
  if (/already registered|already been registered/i.test(texto)) return "Já existe uma conta com este e-mail.";
  if (/email not confirmed/i.test(texto)) return "Confirme o e-mail antes de entrar. Veja a caixa de entrada.";
  if (/different from the old/i.test(texto)) return "Escolha uma senha diferente da anterior.";
  if (/rate limit|only request this|too many/i.test(texto)) return "Espere um pouco e peça o link de novo.";
  if (/expired|invalid.*token|otp/i.test(texto)) return "Esse link expirou. Peça outro.";
  if (/password/i.test(texto)) return "A senha precisa de 8 caracteres ou mais.";
  if (/Entre na conta|Sem permissão|indisponível|inválido/i.test(texto) || /[áàâãéêíóôõúç]/i.test(texto)) return texto;
  return "Não foi possível agora. Tente de novo.";
}

function destinoSeguro(valor) {
  if (destinos.has(valor)) return valor;
  if (/^atividade\.html\?id=[a-z0-9-]{1,48}$/.test(valor || "")) return valor;
  if (valor === "index.html?carrinho=1") return valor;
  return "minhas.html";
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

function hashDaUrl() {
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function linkDeSenha() {
  const hash = hashDaUrl();
  return hash.get("type") === "recovery" || hash.get("error_code") === "otp_expired";
}

function levarParaNovaSenha() {
  if (!linkDeSenha() || /entrar\.html$/.test(location.pathname)) return false;
  const destino = new URL("entrar.html", location.href);
  destino.search = "";
  destino.hash = location.hash;
  location.replace(destino.href);
  return true;
}

async function iniciar() {
  const config = await carregarConfig();
  let cliente = null;
  if (config) {
    const createClient = window.supabase?.createClient || null;
    if (createClient) cliente = createClient(config.url, config.chave, {
      auth: {
        persistSession: true,
        storage: window.sessionStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_nome, _espera, executa) => executa(),
      },
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
    let { data, error } = await cliente.from("perfis").select("nome, email, papel, acesso_financeiro").eq("id", atual.user.id).maybeSingle();
    if (error) {
      const basico = await cliente.from("perfis").select("nome, email, papel").eq("id", atual.user.id).maybeSingle();
      data = basico.data ? { ...basico.data, acesso_financeiro: basico.data.papel === "admin" } : null;
    }
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
    async pedirNovaSenha(email) {
      const publicado = location.hostname === "vinnirx.github.io";
      const volta = publicado
        ? new URL("https://vinnirx.github.io/professora-leticia/entrar.html")
        : new URL("entrar.html", location.href);
      volta.search = "";
      volta.hash = "";
      const { error } = await cliente.auth.resetPasswordForEmail(email, { redirectTo: volta.href });
      if (error && !/user not found/i.test(error.message || "")) {
        return { ok: false, mensagem: traduzir(error) };
      }
      return { ok: true };
    },
    async definirNovaSenha(senha) {
      const { error } = await cliente.auth.updateUser({ password: senha });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async sair() {
      const apagar = () => {
        const chaves = [];
        for (let indice = 0; indice < sessionStorage.length; indice += 1) {
          const chave = sessionStorage.key(indice);
          if (chave && chave.startsWith("sb-")) chaves.push(chave);
        }
        chaves.forEach((chave) => sessionStorage.removeItem(chave));
      };
      apagar();
      try {
        if (cliente) {
          await Promise.race([
            cliente.auth.signOut({ scope: "local" }),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        }
      } catch {
        // A sessão local já foi apagada. A página inicial abre mesmo assim.
      }
      apagar();
      location.replace("index.html");
    },
    async registrarPedido(atividadeId, txid) {
      const { error } = await cliente.rpc("criar_pedido", { atividade: atividadeId, txid });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async registrarPedidos(ids, txid) {
      const { error } = await cliente.rpc("criar_pedidos", { atividades: ids, codigo: txid });
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
    async atividades() {
      const { data, error } = await cliente
        .from("atividades")
        .select("id, titulo, preco, arquivo, resumo, explicacao, uso, inclui, habilidades, destaque, area, tema, capa, informacoes")
        .order("titulo");
      if (error) throw error;
      return data || [];
    },
    async atividade(id) {
      const { data, error } = await cliente
        .from("atividades")
        .select("id, titulo, preco, arquivo, resumo, explicacao, uso, inclui, habilidades, destaque, area, tema, capa, informacoes")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async criarAtividade(dados) {
      const { data, error } = await cliente.rpc("criar_atividade", {
        atividade_id: dados.id,
        atividade_titulo: dados.titulo,
        atividade_resumo: dados.resumo,
        atividade_explicacao: dados.explicacao,
        atividade_preco: dados.preco,
        atividade_uso: dados.uso,
        atividade_inclui: dados.inclui,
        atividade_habilidades: dados.habilidades,
        atividade_destaque: dados.destaque !== false,
        atividade_area: dados.area || "",
        atividade_tema: dados.tema || "",
        atividade_informacoes: dados.informacoes || [],
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, atividade: data };
    },
    async editarAtividade(dados) {
      const { data, error } = await cliente.rpc("editar_atividade", {
        atividade_id: dados.id,
        atividade_titulo: dados.titulo,
        atividade_resumo: dados.resumo,
        atividade_explicacao: dados.explicacao,
        atividade_preco: dados.preco,
        atividade_uso: dados.uso,
        atividade_inclui: dados.inclui,
        atividade_habilidades: dados.habilidades,
        atividade_destaque: dados.destaque === true,
        atividade_area: dados.area || "",
        atividade_tema: dados.tema || "",
        atividade_informacoes: dados.informacoes || [],
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, atividade: data };
    },
    async baixar(atividadeId) {
      const arquivo = await api.arquivoDa(atividadeId);
      const caminho = caminhoPdf(atividadeId, arquivo);
      if (!caminho) throw new Error("arquivo");
      const atual = await sessao();
      if (!atual?.access_token || !config) throw new Error("entrar");
      let resposta = null;
      try {
        resposta = await fetch(`${config.url}/functions/v1/link-download`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${atual.access_token}`,
            apikey: config.chave,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ atividade: atividadeId }),
        });
      } catch {
        resposta = null;
      }
      if (!resposta) throw new Error("tentar");
      if (resposta.status === 401) throw new Error("entrar");
      if (resposta.status === 403) throw new Error("negado");
      if (resposta.status >= 500) throw new Error("tentar");
      if (!resposta.ok) throw new Error("arquivo");
      const corpo = await resposta.json().catch(() => ({}));
      if (!corpo.url) throw new Error("arquivo");
      const link = document.createElement("a");
      link.href = corpo.url;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
    },
    async painel() {
      let contasConsulta = await cliente.from("perfis").select("id, nome, email, papel, acesso_financeiro").order("nome");
      if (contasConsulta.error) {
        contasConsulta = await cliente.from("perfis").select("id, nome, email, papel").order("nome");
        if (!contasConsulta.error && contasConsulta.data) {
          contasConsulta.data = contasConsulta.data.map((conta) => ({
            ...conta,
            acesso_financeiro: conta.papel === "admin",
          }));
        }
      }
      const { data: pedidos, error: erroPedidos } = await cliente
        .from("pedidos")
        .select("id, usuario_id, atividade_id, titulo, valor, txid, status, criado_em, perfis(nome, email)")
        .order("criado_em", { ascending: false });
      if (contasConsulta.error) throw contasConsulta.error;
      if (erroPedidos) throw erroPedidos;
      const cobrancasConsulta = await cliente
        .from("cobrancas")
        .select("txid, valor_bruto, taxa, valor_liquido, status, cobranca_externa, atualizado_em");
      return {
        contas: contasConsulta.data || [],
        pedidos: pedidos || [],
        cobrancas: cobrancasConsulta.error ? [] : cobrancasConsulta.data || [],
        cobrancasDisponiveis: !cobrancasConsulta.error,
      };
    },
    async situacaoPedido(txid) {
      const cobranca = await cliente.from("cobrancas").select("status").eq("txid", txid).maybeSingle();
      if (!cobranca.error && cobranca.data?.status) return cobranca.data.status;
      const { data, error } = await cliente.from("pedidos").select("status").eq("txid", txid);
      if (error || !data?.length) return null;
      if (data.every((item) => item.status === "pago")) return "pago";
      if (data.some((item) => item.status === "estornado")) return "estornado";
      if (data.every((item) => item.status === "cancelado")) return "cancelado";
      return "aguardando";
    },
    async listarConciliacao() {
      const { data, error } = await cliente.rpc("listar_conciliacao");
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, pedidos: data || [] };
    },
    async conciliarPedido(codigo, confirmar) {
      const { data, error } = await cliente.rpc("conciliar_pedido", { codigo, confirmar: confirmar === true });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return data || { ok: false, mensagem: "Não foi possível conciliar." };
    },
    async encerrarConciliacao() {
      const { data, error } = await cliente.rpc("encerrar_conciliacao");
      if (error) return { ok: false, mensagem: traduzir(error) };
      return data || { ok: false, mensagem: "Não foi possível encerrar." };
    },
    async criarCobranca(ids, chave, documento) {
      const atual = await sessao();
      const chavePedido = String(chave || "");
      if (!atual || !config) return { ok: false, mensagem: "Entre na conta para comprar." };
      if (chavePedido.length < 8) return { ok: false, mensagem: "Pedido inválido." };
      const resposta = await fetch(`${config.url}/functions/v1/criar-cobranca`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${atual.access_token}`,
          apikey: config.chave,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ atividades: ids, chave: chavePedido, documento: String(documento || "") }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !corpo.ok) {
        return { ok: false, mensagem: corpo.mensagem || "A cobrança automática não está disponível." };
      }
      return {
        ok: true,
        txid: corpo.txid,
        valor: corpo.valor,
        copiaCola: corpo.copiaCola || "",
        imagem: corpo.imagem || "",
        expiraEm: corpo.expiraEm || "",
        status: corpo.status || "pendente",
      };
    },
    async definirPapel(alvo, novoPapel) {
      const { data, error } = await cliente.rpc("definir_papel", { alvo, novo_papel: novoPapel });
      if (error) return { ok: false, mensagem: migracaoAusente(error) || traduzir(error) };
      if (!data?.ok) return { ok: false, mensagem: data?.mensagem || "Sem permissão." };
      return { ok: true };
    },
    async definirFinanceiro(alvo, ligado) {
      const { data, error } = await cliente.rpc("definir_financeiro", { alvo, ligado });
      if (error) return { ok: false, mensagem: migracaoAusente(error) || traduzir(error) };
      if (!data?.ok) return { ok: false, mensagem: data?.mensagem || "Sem permissão." };
      return { ok: true };
    },
    async historicoPermissoes() {
      const { data, error } = await cliente.rpc("historico_permissoes");
      if (error) return { ok: false, mensagem: migracaoAusente(error) || traduzir(error), linhas: [] };
      return { ok: true, linhas: data || [] };
    },
    async confirmar(id) {
      const { error } = await cliente.rpc("confirmar_pix", { pedido: id });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async enviarCapa(atividadeId, arquivo) {
      const extensao = arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
      const nome = `${atividadeId}.${extensao}`;
      const { error } = await cliente.storage.from("capas").upload(nome, arquivo, {
        upsert: true,
        contentType: arquivo.type || "image/jpeg",
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      const { data } = cliente.storage.from("capas").getPublicUrl(nome);
      return { ok: true, url: data.publicUrl };
    },
    async definirDestaque(atividadeId, ligado) {
      const { error } = await cliente.rpc("definir_destaque", { atividade: atividadeId, ligado });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async definirCapa(atividadeId, url) {
      const { error } = await cliente.rpc("definir_capa", { atividade: atividadeId, endereco: url });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async arquivoPdf(atividadeId) {
      const { data, error } = await cliente.storage.from("atividades").list(atividadeId, { limit: 20 });
      if (error) return { ok: false };
      const pdf = (data || []).find((item) => /\.pdf$/i.test(item.name || ""));
      if (!pdf) return { ok: true, pdf: null };
      return { ok: true, pdf: { nome: pdf.name, atualizado: pdf.updated_at || pdf.created_at || "" } };
    },
    async arquivosPdf(ids) {
      const saida = {};
      await Promise.all(ids.map(async (id) => {
        const resultado = await api.arquivoPdf(id);
        saida[id] = resultado.ok ? { ok: true, pdf: resultado.pdf } : { ok: false };
      }));
      return saida;
    },
    async enviarPdf(atividadeId, arquivo, nome) {
      const { error } = await cliente.storage.from("atividades").upload(`${atividadeId}/${nome}`, arquivo, {
        upsert: true,
        contentType: "application/pdf",
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
  };

  const pedidoPeloEmail = hashDaUrl().get("type") === "recovery";
  const linkVencido = hashDaUrl().get("error_code") === "otp_expired";
  let atual = null;
  let admin = false;
  if (cliente) {
    atual = await sessao();
    const dados = atual ? await perfil() : null;
    admin = administra(dados?.papel);
  }
  if (pedidoPeloEmail || linkVencido) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  api.recuperando = Boolean(pedidoPeloEmail && atual);
  api.linkVencido = Boolean(linkVencido || (pedidoPeloEmail && !atual));
  pintarMenu(atual, admin);
  window.contaLoja = api;
  return api;
}

window.contaPronta = levarParaNovaSenha() ? new Promise(() => {}) : iniciar();
