import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
const funcoes = process.env.FUNCTIONS_URL || `${url}/functions/v1`;
const mail = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
const webhookToken = readFileSync(new URL("../supabase/.env.homologacao", import.meta.url), "utf8")
  .split("\n")
  .find((linha) => linha.startsWith("ASAAS_WEBHOOK_TOKEN="))
  ?.slice("ASAAS_WEBHOOK_TOKEN=".length)
  .trim();
const senha = randomBytes(18).toString("base64url");
const senhaNova = randomBytes(18).toString("base64url");
const db = "supabase_db_professora-leticia";
const resultados = [];

function marcar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "ok" : "falha"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

function psqlArquivo(caminho) {
  execFileSync(
    "docker",
    ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: readFileSync(caminho), encoding: "utf8" },
  );
}

function modoAsaas(valor) {
  writeFileSync("/tmp/asaas-modo.json", JSON.stringify(valor));
}

function postsCliente() {
  return JSON.parse(readFileSync("/tmp/asaas-contagem.json", "utf8")).postsCliente;
}

async function http(caminho, opcoes = {}) {
  const headers = { apikey: anon, ...(opcoes.headers || {}) };
  const resposta = await fetch(caminho, { ...opcoes, headers });
  const texto = await resposta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  return { status: resposta.status, json, texto };
}

async function criarOuEntrar(email, nome) {
  const criado = await http(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${servico}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }),
  });
  let sessao = await http(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!sessao.json?.access_token) {
    const lista = await http(`${url}/auth/v1/admin/users`, {
      headers: { Authorization: `Bearer ${servico}` },
    });
    const id = criado.json?.id || lista.json?.users?.find((item) => item.email === email)?.id;
    await http(`${url}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${servico}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: senha, email_confirm: true }),
    });
    sessao = await http(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    });
  }
  if (!sessao.json?.access_token) throw new Error(`sem sessão local para ${email}: ${sessao.status}`);
  return { id: sessao.json.user.id, token: sessao.json.access_token };
}

function cpfDeTeste() {
  const base = "390533447";
  const digito = (texto, pesos) => {
    const soma = texto.split("").reduce((total, item, indice) => total + Number(item) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito(`${base}${primeiro}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${primeiro}${segundo}`;
}

async function chamarFuncao(nome, token, corpo, extra = {}) {
  return http(`${funcoes}/${nome}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify(corpo || {}),
  });
}

async function webhook(token, corpo) {
  return http(`${funcoes}/webhook-asaas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "asaas-access-token": token } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

function evento(id, tipo, cobranca, valor, liquido) {
  return { id, event: tipo, payment: { id: cobranca, value: valor, netValue: liquido } };
}

async function baixar(token, atividade) {
  return chamarFuncao("link-download", token, { atividade });
}

async function assinar(token, caminho) {
  return http(`${url}/storage/v1/object/sign/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 120 }),
  });
}

if (!url || !anon || !servico || !webhookToken) {
  console.log("falha ambiente local sem as variáveis da homologação");
  process.exit(1);
}

modoAsaas({ clientes: [], pagamentos: "vazio" });
const documento = cpfDeTeste();
const dona = await criarOuEntrar("leticiapimenteldemacedo@gmail.com", "Proprietária local");
const superUser = await criarOuEntrar("super.teste@example.com", "Super teste");
const admin = await criarOuEntrar("admin.teste@example.com", "Admin teste");
const pago = await criarOuEntrar("cliente.pago@example.com", "Cliente pago");
const pendente = await criarOuEntrar("cliente.pendente@example.com", "Cliente pendente");
const vazio = await criarOuEntrar("cliente.vazio@example.com", "Cliente vazio");
marcar("auth local criou seis usuários fictícios", true);

if (!psql("select coalesce(to_regclass('public.proprietaria')::text, '')")) {
  psqlArquivo(new URL("../supabase/migracao-permissoes.sql", import.meta.url));
}
marcar("migração de permissões no Supabase local", psql("select papel from public.perfis where email = 'leticiapimenteldemacedo@gmail.com'") === "owner");

const temPagamentos = psql("select to_regclass('public.controle_conciliacao') is not null");
if (temPagamentos !== "true") {
  if (psql("select count(*) from public.pedidos where txid = 'legado001'") === "0") {
    psql(`insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
      values ('${pago.id}', 'adicao', 'Adição', 9.90, 'legado001', 'pago')`);
  }
  psqlArquivo(new URL("../supabase/migracao-pagamentos.sql", import.meta.url));
} else if (psql("select count(*) from public.pedidos where txid = 'legado001'") === "0") {
  psql(`insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, legado)
    values ('${pago.id}', 'adicao', 'Adição', 9.90, 'legado001', 'pago', true)`);
}
marcar("migração de pagamentos no Supabase local", psql("select legado::text from public.pedidos where txid = 'legado001'") === "true");
psql("update public.controle_conciliacao set aberta = true, encerrada_em = null, encerrada_por = null where id = 1");
if (psql("select count(*) from public.pedidos where txid = 'legado002'") === "0") {
  psql(`insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, legado)
    values ('${pago.id}', 'resolver-problemas', 'Situações-problema', 4.90, 'legado002', 'pago', true)`);
}

const arquivos = Object.fromEntries(psql("select id || '|' || arquivo from public.atividades").split("\n").filter(Boolean).map((linha) => linha.split("|")));
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n");
for (const atividade of ["adicao", "silabas", "celulas", "resolver-problemas"]) {
  const envio = await fetch(`${url}/storage/v1/object/atividades/${atividade}/${arquivos[atividade]}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${servico}`,
      apikey: anon,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: pdf,
  });
  marcar(`pdf fictício enviado ${atividade}`, envio.status === 200 || envio.status === 201, String(envio.status));
}

const papel = async (token, alvo, novo) => (await http(`${url}/rest/v1/rpc/definir_papel`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ alvo, novo_papel: novo }),
})).json;
marcar("owner concede super admin", (await papel(dona.token, superUser.id, "super_admin"))?.ok === true);
marcar("owner concede admin", (await papel(dona.token, admin.id, "admin"))?.ok === true);
marcar("super admin não altera a proprietária", (await papel(superUser.token, dona.id, "admin"))?.ok === false);
marcar("super admin não cria outro super admin", (await papel(superUser.token, admin.id, "super_admin"))?.ok === false);
marcar("admin não se promove", (await papel(admin.token, admin.id, "super_admin"))?.ok === false);
marcar("admin não promove cliente", (await papel(admin.token, vazio.id, "admin"))?.ok === false);
marcar("cliente não promove ninguém", (await papel(vazio.token, pendente.id, "admin"))?.ok === false);
const patchCargo = await http(`${url}/rest/v1/perfis?id=eq.${vazio.id}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${vazio.token}`, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ papel: "owner" }),
});
marcar("cliente não altera cargo pela API", psql(`select papel from public.perfis where id = '${vazio.id}'`) === "cliente", String(patchCargo.status));
const patchDona = await http(`${url}/rest/v1/proprietaria?id=eq.${dona.id}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${superUser.token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ id: superUser.id }),
});
marcar("super admin não altera a tabela da proprietária", patchDona.status >= 400 && psql("select usuario_id::text from public.proprietaria where id = 1") === dona.id, String(patchDona.status));
marcar("owner revoga super admin", (await papel(dona.token, superUser.id, "admin"))?.ok === true && psql(`select papel from public.perfis where id = '${superUser.id}'`) === "admin");
marcar("revogação impede novo comando administrativo", (await papel(superUser.token, vazio.id, "admin"))?.ok === false);

const semSessao = await chamarFuncao("criar-cobranca", "", { atividades: ["adicao"], chave: "chave-sem-sessao", documento: "123" });
marcar("criar-cobranca sem sessão", semSessao.status === 401, String(semSessao.status));
const sessaoRuim = await chamarFuncao("criar-cobranca", "token-invalido", { atividades: ["adicao"], chave: "chave-ruim", documento: "123" });
marcar("criar-cobranca com credencial inválida", sessaoRuim.status === 401, String(sessaoRuim.status));
const postsAntes = postsCliente();
const cpfRuim = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["adicao"], chave: "chave-cpf-ruim", documento: "11111111111" });
marcar("criar-cobranca recusa CPF inválido", cpfRuim.status === 400 && postsCliente() === postsAntes, String(cpfRuim.status));
const chaveUma = `chave-uma-${randomBytes(3).toString("hex")}`;
const uma = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["silabas"], chave: chaveUma, documento, valor: 0.01 });
const valorUma = psql(`select valor_bruto::text from public.cobrancas where chave_idempotencia = '${chaveUma}'`);
marcar("uma atividade calcula o preço no servidor", uma.status === 502 && valorUma === "4.90" && !uma.texto.includes(documento), `${uma.status} ${uma.json?.mensagem || ""} valor ${valorUma}`);
const umaDeNovo = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["silabas"], chave: chaveUma, documento });
marcar("chave repetida não duplica o pedido", umaDeNovo.status === 502 && psql(`select count(*) from public.pedidos where txid = (select txid from public.cobrancas where chave_idempotencia = '${chaveUma}')`) === "1", `${umaDeNovo.status} ${umaDeNovo.json?.mensagem || ""}`);
const chaveDuas = `chave-duas-${randomBytes(3).toString("hex")}`;
const duas = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["silabas", "celulas"], chave: chaveDuas, documento, valor: 1 });
marcar("duas atividades somam os preços do banco", duas.status === 502 && psql(`select valor_bruto::text from public.cobrancas where chave_idempotencia = '${chaveDuas}'`) === "9.80", `${duas.status} ${duas.json?.mensagem || ""}`);
modoAsaas({ clientes: [vazio.id], pagamentos: "timeout" });
const chaveTimeout = `chave-tempo-${randomBytes(3).toString("hex")}`;
const inicioTimeout = Date.now();
const tempo = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["adicao"], chave: chaveTimeout, documento });
marcar("timeout do Asaas não apaga a cobrança", tempo.status === 502 && Date.now() - inicioTimeout >= 11000 && psql(`select count(*) from public.cobrancas where chave_idempotencia = '${chaveTimeout}'`) === "1", String(tempo.status));
modoAsaas({ clientes: [vazio.id], pagamentos: "erro" });
const chaveErro = `chave-erro-${randomBytes(3).toString("hex")}`;
const erroAsaas = await chamarFuncao("criar-cobranca", vazio.token, { atividades: ["adicao"], chave: chaveErro, documento });
marcar("falha do Asaas sem timeout desfaz a cobrança sem Pix", erroAsaas.status === 502 && psql(`select count(*) from public.cobrancas where chave_idempotencia = '${chaveErro}'`) === "0", String(erroAsaas.status));

const semToken = await webhook("", evento("evt_sem", "PAYMENT_RECEIVED", "pay_x", 9.8, 7.81));
marcar("webhook sem token", semToken.status === 401, String(semToken.status));
const tokenRuim = await webhook("token-errado", evento("evt_ruim", "PAYMENT_RECEIVED", "pay_x", 9.8, 7.81));
marcar("webhook com token incorreto", tokenRuim.status === 401, String(tokenRuim.status));

function cobranca(id, txid, chave, valor, status = "pendente") {
  psql(`insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto, status)
    values ('${pago.id}', '${txid}', '${chave}', '${id}', ${valor}, '${status}')
    on conflict (usuario_id, chave_idempotencia) do nothing`);
}
cobranca("pay_nova", "novo12345", "chave-nova", 9.8);
psql(`insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${pago.id}', 'silabas', 'Sílabas', 4.90, 'novo12345', 'aguardando'),
         ('${pago.id}', 'celulas', 'Células', 4.90, 'novo12345', 'aguardando')
  on conflict (usuario_id, txid, atividade_id) do nothing`);
cobranca("pay_valor", "valor9999", "chave-valor", 9.9);
cobranca("pay_pendente", "pendente9", "chave-pendente", 4.9, "criada");
cobranca("pay_expira", "expira999", "chave-expira", 4.9);
cobranca("pay_fora", "fora99999", "chave-fora", 4.9);
cobranca("pay_falha", "falha9999", "chave-falha", 4.9);
psql(`insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${pendente.id}', 'adicao', 'Adição', 9.90, 'pendente1', 'aguardando'),
         ('${pago.id}', 'adicao', 'Adição', 4.90, 'falha9999', 'aguardando')
  on conflict (usuario_id, txid, atividade_id) do nothing`);
psql(`delete from public.eventos_pagamento where cobranca_id in (
    select id from public.cobrancas where cobranca_externa in ('pay_nova', 'pay_valor', 'pay_pendente', 'pay_expira', 'pay_fora', 'pay_falha')
  );
  delete from public.direitos_acesso where txid in ('novo12345', 'falha9999');
  update public.pedidos set status = 'aguardando', confirmacao = null where txid in ('novo12345', 'falha9999', 'pendente1');
  update public.cobrancas set status = 'pendente', taxa = null, valor_liquido = null
    where cobranca_externa in ('pay_nova', 'pay_valor', 'pay_expira', 'pay_fora', 'pay_falha');
  update public.cobrancas set status = 'criada', taxa = null, valor_liquido = null where cobranca_externa = 'pay_pendente';`);

const desconhecida = await webhook(webhookToken, evento("evt_ausente", "PAYMENT_RECEIVED", "pay_inexistente", 9.8, 7.81));
marcar("webhook cobrança desconhecida", desconhecida.status === 409, String(desconhecida.status));
marcar("evento desconhecido não foi gravado", psql("select count(*) from public.eventos_pagamento where evento_externo = 'evt_ausente'") === "0");
const confirmado = await webhook(webhookToken, evento("evt_confirmado", "PAYMENT_CONFIRMED", "pay_nova", 9.8, 7.81));
marcar("pagamento confirmado não libera", confirmado.status === 200 && psql("select status from public.pedidos where txid = 'novo12345' limit 1") === "aguardando", confirmado.json?.resultado || "");
const divergente = await webhook(webhookToken, evento("evt_valor", "PAYMENT_RECEIVED", "pay_valor", 1, 0.5));
marcar("valor divergente não libera", divergente.status === 200 && divergente.json?.resultado === "analise", divergente.json?.resultado || "");
const pendenteEvento = await webhook(webhookToken, evento("evt_pendente", "PAYMENT_CREATED", "pay_pendente", 4.9, 4.5));
marcar("pagamento pendente não libera", pendenteEvento.json?.resultado === "pendente" && psql("select count(*) from public.direitos_acesso where txid = 'pendente9'") === "0", pendenteEvento.json?.resultado || "");
const expirada = await webhook(webhookToken, evento("evt_expira", "PAYMENT_OVERDUE", "pay_expira", 4.9, 4.5));
marcar("cobrança expirada não libera", expirada.json?.resultado === "expirada" && psql("select status from public.cobrancas where cobranca_externa = 'pay_expira'") === "expirada", expirada.json?.resultado || "");
const fora = await webhook(webhookToken, evento("evt_fora", "PAYMENT_REFUNDED", "pay_fora", 4.9, 4.5));
marcar("estorno fora de ordem não libera", fora.json?.resultado === "analise" && psql("select count(*) from public.direitos_acesso where txid = 'fora99999'") === "0", fora.json?.resultado || "");
const recebido = await webhook(webhookToken, evento("evt_pago", "PAYMENT_RECEIVED", "pay_nova", 9.8, 7.81));
marcar("pagamento recebido libera as duas atividades", recebido.status === 200 && recebido.json?.resultado === "pago", recebido.json?.resultado || "");
marcar("financeiro gravou taxa e líquido do evento", psql("select taxa::text || '|' || valor_liquido::text from public.cobrancas where cobranca_externa = 'pay_nova'") === "1.99|7.81");
const repetido = await webhook(webhookToken, evento("evt_pago", "PAYMENT_RECEIVED", "pay_nova", 9.8, 7.81));
marcar("evento duplicado não cria outro direito", repetido.status === 200 && psql(`select count(*) from public.direitos_acesso where usuario_id = '${pago.id}' and txid = 'novo12345' and revogado_em is null`) === "2", repetido.json?.resultado || "");

psql("update public.cobrancas set copia_cola = 'pix-local-nao-exibir' where cobranca_externa = 'pay_nova'");
const leitura = await http(`${url}/rest/v1/cobrancas?select=txid,valor_bruto,taxa,valor_liquido,status,cobranca_externa,atualizado_em`, {
  headers: { Authorization: `Bearer ${pago.token}` },
});
const colunaPix = await http(`${url}/rest/v1/cobrancas?select=copia_cola`, {
  headers: { Authorization: `Bearer ${pago.token}` },
});
marcar("consulta do financeiro não traz o Pix copia e cola", leitura.status === 200 && !leitura.texto.includes("pix-local-nao-exibir"), String(leitura.status));
marcar("coluna do Pix copia e cola não é legível", colunaPix.status >= 400, String(colunaPix.status));

const linkSem = await baixar("", "adicao");
marcar("link-download sem sessão", linkSem.status === 401, String(linkSem.status));
const linkRuim = await baixar("token-invalido", "adicao");
marcar("link-download com credencial inválida", linkRuim.status === 401, String(linkRuim.status));
const linkVazio = await baixar(vazio.token, "adicao");
marcar("cliente sem compra não baixa", linkVazio.status === 403, String(linkVazio.status));
const linkPendente = await baixar(pendente.token, "adicao");
marcar("pedido aguardando não baixa", linkPendente.status === 403, String(linkPendente.status));
const linkAntiga = await baixar(pago.token, "adicao");
const linkSeu = await baixar(pago.token, "silabas");
marcar("compra antiga continua baixando durante a exceção", linkAntiga.status === 200, String(linkAntiga.status));
marcar("cliente baixa o material comprado", linkSeu.status === 200 && Boolean(linkSeu.json?.url), String(linkSeu.status));
const linkAdmin = await baixar(admin.token, "celulas");
marcar("administrador autorizado baixa", linkAdmin.status === 200, String(linkAdmin.status));
const emitido = Date.now();
const urlAssinada = linkSeu.json?.url || "";
if (urlAssinada) {
  const agora = await fetch(urlAssinada);
  marcar("signed URL nova abre o PDF", agora.status === 200, String(agora.status));
}

const parcial = await webhook(webhookToken, evento("evt_parcial", "PAYMENT_PARTIALLY_REFUNDED", "pay_nova", 9.8, 7.81));
const depoisParcial = await baixar(pago.token, "silabas");
marcar("estorno parcial não revoga", parcial.json?.resultado === "analise" && depoisParcial.status === 200, parcial.json?.resultado || "");
const total = await webhook(webhookToken, evento("evt_total", "PAYMENT_REFUNDED", "pay_nova", 9.8, 7.81));
const depoisTotal = await baixar(pago.token, "silabas");
marcar("estorno total revoga somente aquele pedido", total.json?.resultado === "estornada" && depoisTotal.status === 403 && (await baixar(pago.token, "adicao")).status === 200, total.json?.resultado || "");

psql(`
  create or replace function public._homologacao_falha()
  returns trigger language plpgsql as $func$
  begin
    if new.resultado = 'pago' and new.evento_externo = 'evt_falha' then
      raise exception 'falha simulada de homologacao';
    end if;
    return new;
  end
  $func$;
  drop trigger if exists _homologacao_falha on public.eventos_pagamento;
  create trigger _homologacao_falha before update on public.eventos_pagamento
  for each row execute function public._homologacao_falha();
`);
const falha = await webhook(webhookToken, evento("evt_falha", "PAYMENT_RECEIVED", "pay_falha", 4.9, 4.5));
const ficouRecebido = psql("select resultado from public.eventos_pagamento where evento_externo = 'evt_falha'");
marcar("falha no processamento responde erro e mantém o evento", falha.status === 500 && ficouRecebido === "recebido", `${falha.status} ${ficouRecebido}`);
psql("drop trigger if exists _homologacao_falha on public.eventos_pagamento; drop function if exists public._homologacao_falha();");
const reenvio = await webhook(webhookToken, evento("evt_falha", "PAYMENT_RECEIVED", "pay_falha", 4.9, 4.5));
marcar("reenvio depois da falha conclui o pagamento", reenvio.status === 200 && reenvio.json?.resultado === "pago", reenvio.json?.resultado || "");

const listaVazio = await http(`${url}/storage/v1/object/list/atividades`, {
  method: "POST",
  headers: { Authorization: `Bearer ${vazio.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "adicao", limit: 100 }),
});
marcar("cliente sem compra não lista o arquivo", !JSON.stringify(listaVazio.json || []).includes(arquivos.adicao), String(listaVazio.status));
const diretoPendente = await assinar(pendente.token, `atividades/adicao/${arquivos.adicao}`);
marcar("pedido pendente não gera signed URL direta", diretoPendente.status !== 200, String(diretoPendente.status));
const diretoOutro = await assinar(vazio.token, `atividades/adicao/${arquivos.adicao}`);
marcar("cliente não assina arquivo de outro comprador", diretoOutro.status !== 200, String(diretoOutro.status));
const diretoSeu = await assinar(pago.token, `atividades/adicao/${arquivos.adicao}`);
marcar("compra antiga gera signed URL direta enquanto a exceção está aberta", diretoSeu.status === 200, String(diretoSeu.status));
const publico = await fetch(`${url}/storage/v1/object/public/atividades/silabas/${arquivos.silabas}`);
marcar("caminho público do PDF não abre", publico.status !== 200, String(publico.status));

psql(`update public.pedidos set confirmacao = null where txid in ('legado001', 'legado002');
delete from public.auditoria_conciliacao where txid in ('legado001', 'legado002');
delete from public.direitos_acesso where txid in ('legado001', 'legado002');`);
let editorBloqueado = false;
try {
  psql("select public.conciliar_pedido('legado001', true)");
} catch (erro) {
  editorBloqueado = /Sem permissão/.test(String(erro.stderr || erro.message || erro));
}
marcar("SQL Editor sem sessão não concilia", editorBloqueado);
const lista = await http(`${url}/rest/v1/rpc/listar_conciliacao`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: "{}",
});
marcar("owner lista as compras antigas", Array.isArray(lista.json) && lista.json.some((item) => item.txid === "legado001"), String(lista.status));
const semConfirmar = await http(`${url}/rest/v1/rpc/conciliar_pedido`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ codigo: "legado001", confirmar: false }),
});
marcar("conciliação sem confirmação não libera", semConfirmar.json?.ok === false && psql("select count(*) from public.auditoria_conciliacao where txid = 'legado001'") === "0");
const clienteConcilia = await http(`${url}/rest/v1/rpc/conciliar_pedido`, {
  method: "POST",
  headers: { Authorization: `Bearer ${pago.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ codigo: "legado001", confirmar: true }),
});
marcar("cliente não concilia", clienteConcilia.status >= 400, String(clienteConcilia.status));
const concilia = await http(`${url}/rest/v1/rpc/conciliar_pedido`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ codigo: "legado001", confirmar: true }),
});
marcar("owner concilia e a auditoria grava o autor", concilia.json?.ok === true && psql("select conciliado_por::text from public.auditoria_conciliacao where txid = 'legado001'") === dona.id);
const cedo = await http(`${url}/rest/v1/rpc/encerrar_conciliacao`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: "{}",
});
marcar("exceção não fecha com compra pendente", cedo.json?.ok === false, cedo.json?.mensagem || String(cedo.status));
const codigos = [...new Set((Array.isArray(lista.json) ? lista.json : []).map((item) => item.txid))].filter((codigo) => codigo !== "legado001");
let restantesOk = true;
for (const codigo of codigos) {
  const item = await http(`${url}/rest/v1/rpc/conciliar_pedido`, {
    method: "POST",
    headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, confirmar: true }),
  });
  if (item.json?.ok !== true) restantesOk = false;
}
marcar("as demais compras antigas também são conciliadas", restantesOk, codigos.join(","));
const resumo = await http(`${url}/rest/v1/rpc/resumo_conciliacao`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: "{}",
});
marcar("resumo mostra pendência zero e vínculo inteiro", resumo.json?.pendentes === 0 && resumo.json?.conciliados_sem_direito === 0, JSON.stringify(resumo.json));
const adminEncerra = await http(`${url}/rest/v1/rpc/encerrar_conciliacao`, {
  method: "POST",
  headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
  body: "{}",
});
marcar("admin não encerra a exceção", adminEncerra.status >= 400, String(adminEncerra.status));
const encerra = await http(`${url}/rest/v1/rpc/encerrar_conciliacao`, {
  method: "POST",
  headers: { Authorization: `Bearer ${dona.token}`, "Content-Type": "application/json" },
  body: "{}",
});
marcar("owner encerra a exceção sem pendência", encerra.json?.ok === true, encerra.json?.mensagem || "");
psqlArquivo(new URL("../supabase/migracao-downloads-finais.sql", import.meta.url));
const diretoDepois = await assinar(pago.token, `atividades/adicao/${arquivos.adicao}`);
marcar("depois da migração final o cliente não assina direto", diretoDepois.status !== 200, String(diretoDepois.status));
const linkDepois = await baixar(pago.token, "adicao");
marcar("link-download continua liberando quem tem direito", linkDepois.status === 200, String(linkDepois.status));
const adminDireto = await assinar(admin.token, `atividades/adicao/${arquivos.adicao}`);
marcar("administrador ainda acessa o Storage", adminDireto.status === 200, String(adminDireto.status));
const listaAdmin = await http(`${url}/storage/v1/object/list/atividades`, {
  method: "POST",
  headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "adicao", limit: 100 }),
});
marcar("administrador lista o arquivo autorizado", JSON.stringify(listaAdmin.json || []).includes(arquivos.adicao), String(listaAdmin.status));

if (urlAssinada) {
  const restante = 125000 - (Date.now() - emitido);
  if (restante > 0) await new Promise((resolve) => setTimeout(resolve, restante));
  const depois = await fetch(urlAssinada);
  marcar("signed URL expira após 120 segundos", depois.status !== 200, String(depois.status));
}

const recuperacao = await http(`${url}/auth/v1/recover`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "cliente.vazio@example.com", redirect_to: "http://127.0.0.1:4204/entrar.html" }),
});
marcar("solicitação de recuperação aceita", recuperacao.status === 200, String(recuperacao.status));
let mensagem = null;
for (let tentativa = 0; tentativa < 10 && !mensagem; tentativa += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const caixa = await fetch(`${mail}/api/v1/messages`).then((item) => item.json()).catch(() => []);
  const cartas = Array.isArray(caixa) ? caixa : caixa.messages || [];
  mensagem = cartas.find((item) => /cliente\.vazio@example\.com/i.test(JSON.stringify(item)));
}
let link = "";
if (mensagem?.ID || mensagem?.id) {
  const carta = await fetch(`${mail}/api/v1/message/${mensagem.ID || mensagem.id}`).then((item) => item.json());
  const texto = `${carta.Text || ""}\n${carta.HTML || ""}`;
  link = texto.match(/https?:\/\/[^\s"'<>]+/)?.[0]?.replace(/&amp;/g, "&") || "";
}
marcar("e-mail local de recuperação chegou", Boolean(link), link ? "link local recebido" : "caixa vazia");
if (link) {
  const seguido = await fetch(link, { redirect: "manual" });
  const localizacao = seguido.headers.get("location") || "";
  const raiz = decodeURIComponent(localizacao.split("#")[0]);
  const tipo = new URLSearchParams((localizacao.split("#")[1] || "")).get("type");
  const noSite = raiz === "http://127.0.0.1:4204" || raiz === "http://127.0.0.1:4204/";
  marcar("link de recuperação chega ao site", raiz.includes("127.0.0.1:4204/entrar.html") || (noSite && tipo === "recovery"), raiz);
  const destino = new URL(localizacao.includes("://") ? localizacao : `http://127.0.0.1:4204/${localizacao}`);
  const params = new URLSearchParams(destino.hash.replace(/^#/, ""));
  const acesso = params.get("access_token") || "";
  const troca = acesso
    ? await http(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: senhaNova }),
    })
    : { status: seguido.status };
  marcar("senha local redefinida", troca.status === 200, String(troca.status));
  const novoLogin = await http(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cliente.vazio@example.com", password: senhaNova }),
  });
  marcar("login com a senha nova", Boolean(novoLogin.json?.access_token), String(novoLogin.status));
}
const invalido = await fetch(`${url}/auth/v1/verify?token=token-invalido&type=recovery&redirect_to=http://127.0.0.1:4204/entrar.html`, { redirect: "manual" });
const destinoInvalido = invalido.headers.get("location") || "";
marcar("link de recuperação inválido é recusado", invalido.status >= 400 || /error|invalid|expired/i.test(destinoInvalido), `${invalido.status} ${destinoInvalido.split("#")[0]}`);

const falhas = resultados.filter((item) => !item.ok);
console.log(`resumo ${resultados.length - falhas.length}/${resultados.length}`);
if (falhas.length) process.exit(1);
