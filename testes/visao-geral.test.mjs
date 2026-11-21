import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chamadosPendentes, indicadoresDaVisao, pedidosRecentes } from "../js/conta/visao.js";

const pedidos = [
  { txid: "pago9d", usuario_id: "a", valor: 4.9, status: "pago", criado_em: "2026-11-01T10:00:00Z", perfis: { nome: "Ana" } },
  { txid: "pago9d", usuario_id: "a", valor: 4.9, status: "pago", criado_em: "2026-11-01T10:00:00Z", perfis: { nome: "Ana" } },
  { txid: "espera", usuario_id: "b", valor: 5, status: "aguardando", criado_em: "2026-11-02T10:00:00Z", perfis: { nome: "Bia" } },
  { txid: "cancela", usuario_id: "c", valor: 9.9, status: "cancelado", criado_em: "2026-11-03T10:00:00Z", perfis: { nome: "Caio" } },
  { txid: "devolve", usuario_id: "d", valor: 5, status: "estornado", criado_em: "2026-11-04T10:00:00Z", perfis: { nome: "Duda" } },
];
const antes = JSON.stringify(pedidos);
const indicadores = indicadoresDaVisao(pedidos);
assert.equal(indicadores.pagos, 1);
assert.equal(indicadores.bruto, 9.8);
assert.equal(indicadores.aguardando, 1);
assert.equal(JSON.stringify(pedidos), antes);

const recentes = pedidosRecentes(pedidos);
assert.deepEqual(recentes.map((grupo) => grupo.txid), ["espera", "pago9d"]);
assert.equal(recentes.find((grupo) => grupo.txid === "pago9d").valor, 9.8);
assert.equal(JSON.stringify(pedidos), antes);

const soEncerrados = pedidosRecentes([pedidos[3], pedidos[4]]);
assert.deepEqual(soEncerrados.map((grupo) => grupo.status), ["estornado", "cancelado"]);

assert.equal(chamadosPendentes(null), null);
assert.equal(chamadosPendentes([]), 0);
assert.equal(chamadosPendentes([
  { status: "aberto" },
  { status: "atendimento" },
  { status: "resolvido" },
]), 2);

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const visao = admin.slice(admin.indexOf("function pintarVisao"), admin.indexOf("let situacaoAtividade"));
assert.match(visao, /Nova atividade/);
assert.match(visao, /Ver pedidos/);
assert.match(visao, /Suporte/);
assert.match(visao, /abrir-cadastro/);
assert.match(visao, /secaoVisivel\("pedidos"\)/);
assert.match(visao, /secaoVisivel\("suporte"\)/);
assert.match(visao, /Pedidos pagos/);
assert.match(visao, /Receita bruta/);
assert.match(visao, /Aguardando pagamento/);
assert.match(visao, /Chamados pendentes/);
assert.match(visao, /indicadoresDaVisao\(memoria\.pedidos\)/);
assert.match(visao, /pedidosRecentes\(memoria\.pedidos\)/);
assert.match(visao, /Valor histórico/);
assert.doesNotMatch(visao, /\.(update|insert|delete|upsert)\(|oculto_em|confirmar_pix|service_role/);
assert.match(admin, /chamadosDaVisao = chamadosPendentes\(suporteItens\)/);
assert.match(admin, /listarSolicitacoes\(\)/);

const pagina = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");
assert.match(pagina, /painel\.css\?v=29/);
assert.match(pagina, /conta\.js\?v=75/);
assert.match(pagina, /id="ver-todos-pedidos"/);
assert.match(conta, /admin\.js\?v=44/);
assert.match(admin, /from "\.\/visao\.js\?v=1"/);

console.log("ok visao geral");
