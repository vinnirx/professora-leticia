import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leituraAdministrativa } from "../js/conta/apresentacao.js";
import { administra } from "../js/conta/papeis.js";
import { acoesVisiveis, estadoDoHistorico } from "../js/conta/equipe.js";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const admin = ler("../js/conta/admin.js");
const pagina = ler("../gerenciar/index.html");
const sessao = ler("../js/sessao.js");
const catalogo = ler("../supabase/migracao-aal1-catalogo.sql");
const dona = ler("../supabase/migracao-aal2-admin.sql");
const pix = ler("../supabase/proposta-confirmacao-financeira.sql");
const download = ler("../supabase/functions/link-download/index.ts");

assert.equal(leituraAdministrativa({ ok: true, atual: "aal1" }, "owner"), "ok");
assert.equal(leituraAdministrativa({ ok: true, atual: "aal1" }, "admin"), "ok");
assert.equal(leituraAdministrativa({ ok: true, atual: "aal1" }, "owner", "financeiro"), "permissao");
assert.equal(leituraAdministrativa({ ok: true, atual: "aal1" }, "admin", "financeiro"), "permissao");
assert.equal(administra("cliente"), false);
assert.equal(administra("owner"), true);
assert.deepEqual(acoesVisiveis(), []);
assert.doesNotMatch(estadoDoHistorico({ ok: false, mensagem: "Confirme o segundo fator para continuar." }).texto, /segundo fator|autenticador/);

assert.match(admin, /Esta área é só de quem administra a loja/);
assert.doesNotMatch(admin, /segundo fator|Abrir segundo fator|montarSegundoFator|estornarIntegral|Autorizar estorno/);
assert.match(pagina, /data-secao="configuracoes" hidden/);
assert.match(pagina, /data-secao="financeiro" hidden/);
assert.doesNotMatch(pagina, /aplicativo autenticador/);
assert.doesNotMatch(sessao, /service_role|solicitar_reembolso|estornarIntegral/);
assert.match(sessao, /async confirmar\(id\)/);
assert.match(sessao, /confirmar_pix/);

assert.doesNotMatch(catalogo.slice(catalogo.indexOf("function public.sou_admin"), catalogo.indexOf("function public.motivo_dona_atividade")), /aal2/);
assert.doesNotMatch(catalogo.slice(catalogo.indexOf("function public.motivo_dona_atividade")), /aal2/);
assert.match(dona, /function public.motivo_proprietaria/);
assert.match(dona, /aal2/);
assert.match(dona, /function public.definir_papel/);
assert.match(dona, /function public.definir_financeiro/);
assert.match(dona, /function public.pode_ver_financeiro/);
assert.match(pix, /A confirmação manual não está disponível/);
assert.doesNotMatch(pix, /status = 'pago'|direitos_acesso/);
assert.match(download, /pode_baixar/);

console.log("ok sem segundo fator na versão 1.0");
