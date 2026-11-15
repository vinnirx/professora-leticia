import { caminhoPdf } from "./arquivo-seguro.js";
import { nomeCapa, urlComVersao, validarCapa } from "./capa-loja.js";
import { administra } from "./conta/papeis.js";
import { mensagemOtp, TIPO_OTP_CADASTRO, codigoNumerico } from "./conta/codigo.js";
import { enderecoDeConfirmacao, enderecoDeRecuperacao } from "./endereco-publico.js";
import { destinoInterno, rota } from "./rotas.js";
import { executarRestauracao, executarSubstituicao, PDF_AINDA_NAO_INSTALADO, pdfAnteriorDisponivel } from "./pdf-troca.js";

function destinoSeguro(valor) {
  return destinoInterno(valor);
}

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
    link.hidden = Boolean(sessao);
    link.textContent = "Entrar";
    link.href = rota("entrar/");
  });
  document.querySelectorAll("[data-menu-conta]").forEach((menu) => {
    menu.hidden = !sessao;
  });
  document.querySelectorAll(".so-admin").forEach((link) => {
    link.classList.toggle("visivel", Boolean(admin));
  });
}

function prepararMenuConta(sair) {
  const bloco = document.querySelector("[data-menu-conta]");
  if (!bloco || bloco.dataset.pronto === "sim") return;
  bloco.dataset.pronto = "sim";
  const botao = bloco.querySelector(".menu-conta-abre");
  const lista = bloco.querySelector(".menu-conta-opcoes");
  if (!botao || !lista) return;
  const fechar = () => {
    lista.hidden = true;
    botao.setAttribute("aria-expanded", "false");
  };
  botao.addEventListener("click", () => {
    const vaiAbrir = lista.hidden;
    lista.hidden = !vaiAbrir;
    botao.setAttribute("aria-expanded", String(vaiAbrir));
  });
  document.addEventListener("click", (evento) => {
    if (!bloco.contains(evento.target)) fechar();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fechar();
  });
  bloco.querySelector("[data-sair]")?.addEventListener("click", () => {
    const botaoSair = bloco.querySelector("[data-sair]");
    if (botaoSair) botaoSair.disabled = true;
    sair();
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
  if (!linkDeSenha() || /\/recuperar-senha\/?$/.test(location.pathname) || /entrar\.html$/.test(location.pathname)) return false;
  const destino = new URL(rota("recuperar-senha/"), location.href);
  destino.search = "";
  destino.hash = location.hash;
  location.replace(destino.href);
  return true;
}

async function iniciar() {
  const hashInicial = hashDaUrl();
  const tipoLink = hashInicial.get("type") || "";
  const erroLink = hashInicial.get("error_code") || "";
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

  const CAMPOS_ATIVIDADE = "id, titulo, preco, arquivo, resumo, explicacao, uso, inclui, habilidades, destaque, area, tema, capa, informacoes";

  async function lerCadastroAtividades(id = "") {
    const pedir = (campos) => {
      let consulta = cliente.from("atividades").select(campos);
      if (id) consulta = consulta.eq("id", id);
      else consulta = consulta.order("titulo");
      return consulta;
    };
    let consulta = await pedir(`${CAMPOS_ATIVIDADE}, arquivo_anterior`);
    if (consulta.error && /arquivo_anterior|schema cache|column/i.test(String(consulta.error.message || ""))) {
      consulta = await pedir(CAMPOS_ATIVIDADE);
    }
    if (consulta.error) throw consulta.error;
    return (consulta.data || []).map((item) => ({ ...item, arquivo_anterior: item.arquivo_anterior || "" }));
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
        options: {
          data: { nome },
          emailRedirectTo: enderecoDeConfirmacao(location.href),
        },
      });
      if (error) return { ok: false, mensagem: traduzir(error) };
      if (!data.session) return { ok: true, confirmarEmail: true };
      return { ok: true, confirmarEmail: false };
    },
    async reenviarConfirmacao(email) {
      const { error } = await cliente.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: enderecoDeConfirmacao(location.href) },
      });
      if (error && !/user not found|already/i.test(error.message || "")) {
        return { ok: false, mensagem: traduzir(error) };
      }
      return { ok: true };
    },
    async confirmarCodigo({ email, codigo }) {
      const token = codigoNumerico(codigo);
      if (!/^\d{6}$/.test(token)) return { ok: false, mensagem: "O código tem 6 números." };
      const { error } = await cliente.auth.verifyOtp({
        email,
        token,
        type: TIPO_OTP_CADASTRO,
      });
      if (error) return { ok: false, mensagem: mensagemOtp(error) };
      return { ok: true };
    },
    async entrar({ email, senha }) {
      const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true };
    },
    async pedirNovaSenha(email) {
      const { error } = await cliente.auth.resetPasswordForEmail(email, { redirectTo: enderecoDeRecuperacao(location.href) });
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
      location.replace(rota("inicio"));
    },
    async registrarPedido(atividadeId, txid) {
      const { data, error } = await cliente.rpc("criar_pedido", { atividade: atividadeId, txid });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, pedidos: Array.isArray(data) ? data : (data ? [data] : []) };
    },
    async registrarPedidos(ids, txid) {
      const { data, error } = await cliente.rpc("criar_pedidos", { atividades: ids, codigo: txid });
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, pedidos: Array.isArray(data) ? data : [] };
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
      return lerCadastroAtividades();
    },
    async atividade(id) {
      const lista = await lerCadastroAtividades(id);
      return lista[0] || null;
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
    async editarCampos(atividadeId, mudancas) {
      const { data, error } = await cliente.rpc("editar_campos", {
        atividade_id: atividadeId,
        campos: mudancas,
      });
      if (error && /could not find the function|schema cache|does not exist/i.test(String(error.message || ""))) {
        return { ok: false, ausente: true };
      }
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
    async listarContas() {
      const { data, error } = await cliente.rpc("listar_contas", { busca: "", limite: 50, pagina: 0 });
      if (error && /could not find|schema cache|does not exist/i.test(String(error.message || ""))) {
        return { ok: false, ausente: true };
      }
      if (error) return { ok: false, mensagem: traduzir(error) };
      return { ok: true, contas: data || [] };
    },
    async abrirSolicitacao({ assunto, txid, texto }) {
      const atual = await sessao();
      if (!atual) return { ok: false, mensagem: "Entre na conta para pedir ajuda." };
      const criada = await cliente.from("solicitacoes").insert({
        usuario_id: atual.user.id,
        txid: String(txid || ""),
        assunto,
      }).select("id").maybeSingle();
      if (criada.error && /schema cache|does not exist|could not find/i.test(String(criada.error.message || ""))) {
        return { ok: false, ausente: true };
      }
      if (criada.error || !criada.data) return { ok: false, mensagem: traduzir(criada.error) };
      const mensagem = await cliente.from("solicitacao_mensagens").insert({
        solicitacao_id: criada.data.id,
        autor_id: atual.user.id,
        texto: String(texto || "").slice(0, 2000),
      });
      if (mensagem.error) return { ok: false, mensagem: traduzir(mensagem.error) };
      return { ok: true };
    },
    async listarSolicitacoes() {
      const { data, error } = await cliente
        .from("solicitacoes")
        .select("id, txid, assunto, status, criado_em, perfis(nome, email)")
        .order("criado_em", { ascending: false });
      if (error && /schema cache|does not exist|could not find/i.test(String(error.message || ""))) {
        return { ok: false, ausente: true };
      }
      if (error) return { ok: false, mensagem: traduzir(error) };
      return {
        ok: true,
        solicitacoes: (data || []).map((item) => ({
          ...item,
          nome: item.perfis?.nome || "",
          email: item.perfis?.email || "",
        })),
      };
    },
    async atualizarSolicitacao(id, status, texto) {
      const atual = await sessao();
      if (!atual) return { ok: false, mensagem: "Entre na conta para responder." };
      const gravado = await cliente.from("solicitacoes").update({
        status,
        atualizado_em: new Date().toISOString(),
      }).eq("id", id);
      if (gravado.error && /schema cache|does not exist|could not find/i.test(String(gravado.error.message || ""))) {
        return { ok: false, ausente: true };
      }
      if (gravado.error) return { ok: false, mensagem: traduzir(gravado.error) };
      if (texto) {
        const mensagem = await cliente.from("solicitacao_mensagens").insert({
          solicitacao_id: id,
          autor_id: atual.user.id,
          texto: String(texto).slice(0, 2000),
        });
        if (mensagem.error) return { ok: false, mensagem: traduzir(mensagem.error) };
      }
      return { ok: true };
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
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const instante = Date.now();
      const validacao = validarCapa({ tipo: arquivo.type, tamanho: arquivo.size, bytes });
      if (!validacao.ok) return { ok: false, mensagem: validacao.mensagem };
      const nome = nomeCapa(atividadeId, validacao.extensao, instante);
      if (!nome) return { ok: false, mensagem: "Não foi possível nomear a capa. A imagem atual foi mantida." };
      const { error } = await cliente.storage.from("capas").upload(nome, bytes, {
        upsert: false,
        contentType: arquivo.type,
      });
      if (error) return { ok: false, mensagem: "A capa atual foi mantida. A imagem nova não entrou." };
      const { data } = cliente.storage.from("capas").getPublicUrl(nome);
      return { ok: true, url: urlComVersao(data.publicUrl, instante) };
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
    async arquivoPdf(atividadeId, nomePreferido = "", anteriorGravado = "") {
      const { data, error } = await cliente.storage.from("atividades").list(atividadeId, { limit: 100 });
      if (error) return { ok: false };
      const pdfs = (data || []).filter((item) => /\.pdf$/i.test(item.name || ""));
      const nomeAnteriorArquivo = pdfAnteriorDisponivel(pdfs.map((item) => item.name), nomePreferido, anteriorGravado);
      const anterior = pdfs.find((item) => item.name === nomeAnteriorArquivo);
      const preferido = pdfs.find((item) => item.name === nomePreferido);
      const pdf = preferido || pdfs.find((item) => !/-anterior-\d+\.pdf$/i.test(item.name || "") && !/^versao-\d+\.pdf$/i.test(item.name || ""));
      return {
        ok: true,
        pdf: pdf ? { nome: pdf.name, atualizado: pdf.updated_at || pdf.created_at || "" } : null,
        anterior: anterior?.name || "",
      };
    },
    async arquivosPdf(ids) {
      const saida = {};
      await Promise.all(ids.map(async (item) => {
        const id = typeof item === "string" ? item : item.id;
        const nome = typeof item === "string" ? "" : item.arquivo || "";
        const anteriorGravado = typeof item === "string" ? "" : item.arquivo_anterior || "";
        const resultado = await api.arquivoPdf(id, nome, anteriorGravado);
        saida[id] = resultado.ok ? { ok: true, pdf: resultado.pdf, anterior: resultado.anterior || "" } : { ok: false };
      }));
      return saida;
    },
    async enviarPdf(atividadeId, arquivo, nome) {
      return api.substituirPdf(atividadeId, arquivo, nome);
    },
    async referenciaPdfDisponivel() {
      const { error } = await cliente.rpc("definir_arquivo", { atividade: "x", nome: "x" });
      if (!error) return false;
      return !/could not find|schema cache|does not exist|não encontr/i.test(String(error.message || ""));
    },
    armazenamentoPdf() {
      return {
        async baixar(caminhoArquivo) {
          const { data, error } = await cliente.storage.from("atividades").download(caminhoArquivo);
          if (error || !data) throw new Error("ausente");
          return new Uint8Array(await data.arrayBuffer());
        },
        async enviar(caminhoArquivo, bytes, opcoes) {
          const { error } = await cliente.storage.from("atividades").upload(caminhoArquivo, bytes, {
            upsert: opcoes?.upsert === true,
            contentType: "application/pdf",
          });
          if (error) throw new Error(error.message || "falha");
        },
      };
    },
    async substituirPdf(atividadeId, arquivo, arquivoAtual) {
      if (api.trocasPdf.has(atividadeId)) {
        return { ok: false, mensagem: "A substituição deste PDF já está em andamento.", arquivo: arquivoAtual || "" };
      }
      const podeApontar = await api.referenciaPdfDisponivel();
      if (!podeApontar) return { ok: false, mensagem: PDF_AINDA_NAO_INSTALADO, arquivo: arquivoAtual || "" };
      api.trocasPdf.add(atividadeId);
      try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        return await executarSubstituicao({
          storage: api.armazenamentoPdf(),
          atividadeId,
          arquivoAtual,
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
          bytes,
          instante: Date.now(),
          existeAtual: false,
          definirArquivo: async (nomeNovo) => {
            const { error } = await cliente.rpc("definir_arquivo", { atividade: atividadeId, nome: nomeNovo });
            if (error) return { ok: false, mensagem: traduzir(error) };
            return { ok: true };
          },
        });
      } finally {
        api.trocasPdf.delete(atividadeId);
      }
    },
    async restaurarPdf(atividadeId, arquivoAtual, nomeAnteriorArquivo) {
      if (api.trocasPdf.has(atividadeId)) {
        return { ok: false, mensagem: "A substituição deste PDF já está em andamento." };
      }
      const podeApontar = await api.referenciaPdfDisponivel();
      if (!podeApontar) return { ok: false, mensagem: PDF_AINDA_NAO_INSTALADO };
      api.trocasPdf.add(atividadeId);
      try {
        return await executarRestauracao({
          storage: api.armazenamentoPdf(),
          atividadeId,
          arquivoAtual,
          nomeAnteriorArquivo,
          definirArquivo: async (nomeNovo) => {
            const { error } = await cliente.rpc("definir_arquivo", { atividade: atividadeId, nome: nomeNovo });
            if (error) return { ok: false, mensagem: traduzir(error) };
            return { ok: true };
          },
        });
      } finally {
        api.trocasPdf.delete(atividadeId);
      }
    },
  };
  api.trocasPdf = new Set();

  const pedidoPeloEmail = tipoLink === "recovery";
  const linkVencido = erroLink === "otp_expired";
  let atual = null;
  let admin = false;
  if (cliente) {
    atual = await sessao();
    const dados = atual ? await perfil() : null;
    admin = administra(dados?.papel);
  }
  if (pedidoPeloEmail || linkVencido || tipoLink === "signup" || tipoLink === "email") {
    history.replaceState(null, "", location.pathname + location.search);
  }
  api.recuperando = Boolean(pedidoPeloEmail && atual);
  api.linkVencido = Boolean(pedidoPeloEmail && (linkVencido || !atual));
  api.contaVerificada = (tipoLink === "signup" || tipoLink === "email") && !erroLink;
  api.confirmacaoVencida = (tipoLink === "signup" || tipoLink === "email") && linkVencido;
  pintarMenu(atual, admin);
  prepararMenuConta(() => api.sair());
  window.contaLoja = api;
  return api;
}

window.contaPronta = levarParaNovaSenha() ? new Promise(() => {}) : iniciar();
