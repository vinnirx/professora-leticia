import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparPorCodigo, podeOcultar } from "../js/conta/retomada.js";

const raiz = new URL("..", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");

for (const acao of ["tentativa", "cancelado", "abaixo", "tentar", "vencido"]) {
  assert.equal(podeOcultar(acao), true, acao);
}
for (const acao of ["baixar", "confirmar", "continuar", "recuperar", "analise", "aguardar", "manual"]) {
  assert.equal(podeOcultar(acao), false, acao);
}

const grupos = agruparPorCodigo([
  { txid: "dc0ae9793d", atividade_id: "celulas", titulo: "Células", valor: 4.9, status: "cancelado", oculto_em: "2026-11-18T12:00:00Z" },
  { txid: "9d2daf094d", atividade_id: "celulas", titulo: "Células", valor: 4.9, status: "pago", oculto_em: null },
  { txid: "9d2daf094d", atividade_id: "silabas", titulo: "Sílabas", valor: 4.9, status: "pago", oculto_em: null },
]);
const visiveis = grupos.filter((pedido) => !pedido.oculto);
assert.equal(visiveis.some((pedido) => pedido.txid === "dc0ae9793d"), false);
assert.equal(visiveis.find((pedido) => pedido.txid === "9d2daf094d").valor, 9.8);

const conta = ler("js/conta/minhas.js");
assert.match(conta, /Ocultar pedido/);
assert.match(conta, /Confirmar ocultação/);
assert.match(conta, /continua registrado e não é apagado/);
assert.match(conta, /botaoSecundario\("Cancelar"/);
assert.doesNotMatch(conta, /Excluir pedido|Confirmar exclusão|Mostrar de novo|Ver pedidos ocultos/);
const cancelar = conta.slice(conta.indexOf("function confirmarExclusao"), conta.indexOf("function confirmarCancelamento"));
assert.doesNotMatch(cancelar, /definirVisibilidade\([\s\S]*false/);

const sessao = ler("js/sessao.js");
const painel = sessao.slice(sessao.indexOf("async painel"), sessao.indexOf("async listarConciliacao"));
assert.match(painel, /\.from\("pedidos"\)/);
assert.doesNotMatch(painel, /oculto_em/);
assert.match(sessao, /rpc\("definir_visibilidade_pedido"/);
assert.doesNotMatch(sessao.slice(sessao.indexOf("async definirVisibilidade"), sessao.indexOf("async definirPapel")), /pedirCobranca/);

const sql = ler("supabase/migracao-visibilidade-pedidos.sql");
const funcao = sql.slice(sql.indexOf("create or replace function public.definir_visibilidade_pedido"), sql.indexOf("revoke all on function public.cancelar_tentativa_sem_cobranca"));
assert.match(funcao, /set oculto_em/);
assert.doesNotMatch(funcao, /delete from/i);

const ajuda = ler("ajuda/index.html");
const miolo = ajuda.slice(ajuda.indexOf("<main"), ajuda.indexOf("<footer"));
const rodape = ajuda.slice(ajuda.indexOf("<footer"));
assert.match(miolo, /class="ajuda-acoes"/);
assert.match(miolo, /class="botao" href="\.\.\/minha-conta\/">Ir para Minha conta/);
assert.match(miolo, /mailto:leticiapimenteldemacedo@gmail\.com/);
assert.match(miolo, /href="\.\.\/reembolso\/">Cancelamento e reembolso/);
assert.doesNotMatch(miolo, /termos\/|privacidade\//);
assert.match(rodape, /mailto:leticiapimenteldemacedo@gmail\.com/);
assert.match(rodape, /Cancelamento e reembolso/);
assert.doesNotMatch(rodape, /Responsável|CPF/);
assert.match(ler("css/styles.css"), /\.ajuda-acoes \{[^}]*align-items:\s*flex-start/);

console.log("ok exclusão visual do pedido");
