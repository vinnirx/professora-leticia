import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resumoDoPedido } from "../js/conta/detalhe-pedido.js";
import { administra } from "../js/conta/papeis.js";

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");

const historico = {
  txid: "9d2daf094d",
  criado_em: "2026-11-10T15:00:00.000Z",
  status: "pago",
  perfis: { nome: "Cliente histórico", email: "cliente.historico@example.com" },
  itens: [
    { titulo: "Células", valor: 4.9, status: "pago" },
    { titulo: "Sílabas", valor: 4.9, status: "pago" },
  ],
};
const cobrancaHistorica = {
  txid: "9d2daf094d",
  status: "pago",
  valor_bruto: 9.8,
  taxa: 0.79,
  valor_liquido: 9.01,
  atualizado_em: "2026-11-10T15:05:00.000Z",
};

function copia(valor) {
  return JSON.parse(JSON.stringify(valor));
}

const antes = copia(historico);
const pago = resumoDoPedido(historico, { cobrancas: [cobrancaHistorica], financeiro: true });
assert.deepEqual(historico, antes);
assert.equal(pago.codigo, "9d2daf094d");
assert.equal(pago.nome, "Cliente histórico");
assert.equal(pago.email, "cliente.historico@example.com");
assert.equal(pago.situacao, "Pago");
assert.equal(pago.materiais.length, 2);
assert.equal(pago.materiais[0].valor, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(4.9));
assert.equal(pago.materiais[1].valor, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(4.9));
assert.equal(pago.total, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(9.8));
assert.equal(pago.cobranca, "Paga");
assert.equal(pago.pagamentoEm, "Não disponível");
assert.match(pago.historicoFinanceiro, /0,79/);
assert.match(pago.historicoFinanceiro, /9,01/);
assert.equal(pago.direitos, "Não disponível");

const aguardando = resumoDoPedido({
  txid: "AGUARDA01",
  criado_em: "2026-11-12T12:00:00.000Z",
  status: "aguardando",
  perfis: { nome: "Pessoa", email: "pessoa@example.com" },
  itens: [{ titulo: "Tabuada", valor: 5, status: "aguardando" }],
}, { cobrancas: [{ txid: "AGUARDA01", status: "pendente" }], financeiro: true });
assert.equal(aguardando.situacao, "Aguardando");
assert.equal(aguardando.cobranca, "Pendente");
assert.equal(aguardando.total, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(5));
assert.equal(aguardando.historicoFinanceiro, "Não disponível");

const cancelado = resumoDoPedido({
  txid: "CANCELA01",
  criado_em: "2026-11-11T12:00:00.000Z",
  status: "cancelado",
  perfis: {},
  itens: [{ titulo: "", valor: null, status: "cancelado" }],
}, { cobrancas: null, financeiro: false });
assert.equal(cancelado.situacao, "Cancelado");
assert.equal(cancelado.nome, "Não disponível");
assert.equal(cancelado.email, "Não disponível");
assert.equal(cancelado.materiais[0].titulo, "Não disponível");
assert.equal(cancelado.materiais[0].valor, "Não disponível");
assert.equal(cancelado.cobranca, "Não disponível");
assert.equal(cancelado.historicoFinanceiro, "Não disponível");

const semFinanceiro = resumoDoPedido(historico, { cobrancas: [cobrancaHistorica], financeiro: false });
assert.equal(semFinanceiro.historicoFinanceiro, "Não disponível");
assert.equal(semFinanceiro.cobranca, "Paga");
assert.equal(semFinanceiro.total, pago.total);

const consultaFalhou = resumoDoPedido(historico, {
  cobrancas: null,
  financeiro: true,
  direitos: { ok: false, falhou: true },
});
assert.equal(consultaFalhou.cobranca, "Não disponível");
assert.equal(consultaFalhou.direitos, "Não disponível");
assert.equal(consultaFalhou.historicoFinanceiro, "Não disponível");

const semDireito = resumoDoPedido(historico, { direitos: { ok: true, itens: [] }, financeiro: false });
assert.equal(semDireito.direitos, "Nenhum direito vinculado a este pedido.");

const incompleto = resumoDoPedido(null, {});
assert.equal(incompleto.codigo, "Não disponível");
assert.equal(incompleto.total, "Não disponível");
assert.equal(incompleto.materiais.length, 0);

assert.equal(administra("cliente"), false);
assert.equal(administra(null), false);
assert.equal(administra("admin"), true);

assert.match(admin, /abrirDetalhePedido\(grupo/);
assert.match(admin, /financeiro/);
assert.doesNotMatch(admin.slice(admin.indexOf("function mostrarPedido"), admin.indexOf("function intervalosFinanceiro")), /confirmar_pix|\.update\(|\.insert\(|service_role/);
assert.match(painel, /Consulte os pedidos, acompanhe os pagamentos e verifique a liberação dos materiais após a confirmação automática\./);
assert.doesNotMatch(painel, /Confirmar o Pix libera/);
assert.doesNotMatch(painel, /Confirmar Pix/);
assert.match(painel, /painel\.css\?v=29/);
assert.match(painel, /conta\.js\?v=74/);
assert.match(conta, /admin\.js\?v=43/);
assert.match(admin, /detalhe-pedido\.js\?v=1/);

console.log("ok detalhe do pedido");
