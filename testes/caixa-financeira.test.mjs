import assert from "node:assert/strict";
import { agruparPedidos, resumirVendas } from "../js/conta/grupos-pedido.js";
import { fecharCaixa, linhaExportada } from "../js/conta/caixa.js";

function pedido(parcial) {
  return {
    usuario_id: "cliente-ficticio",
    atividade_id: "atividade-ficticia",
    titulo: "Atividade fictícia",
    valor: 4.9,
    status: "pago",
    confirmacao: "admin",
    ...parcial,
  };
}

const manual = agruparPedidos([pedido({ txid: "MANUAL-TESTE", titulo: "Células fictícias" })])[0];
const caixaManual = fecharCaixa([manual], [], true);
assert.equal(caixaManual.conhecido, true);
assert.equal(caixaManual.taxa, 0);
assert.equal(caixaManual.liquido, 4.9);
assert.equal(caixaManual.linhas[0].asaas, "Pix manual");
assert.deepEqual(linhaExportada(caixaManual.linhas[0], (valor) => `R$ ${valor.toFixed(2)}`), ["R$ 0.00", "R$ 4.90"]);

const longo = "Atividade com título extenso para a tabela de pedidos ".repeat(3);
const varios = agruparPedidos([
  pedido({ txid: "VARIOS-TESTE", titulo: longo, valor: 10, atividade_id: "um" }),
  pedido({
    txid: "VARIOS-TESTE",
    titulo: "Segundo material com nome comprido o bastante para quebrar a linha",
    valor: 5.5,
    atividade_id: "dois",
    perfis: { nome: "Cliente Fictício Com Nome Muito Comprido", email: "cliente.ficticio.com.nome.muito.comprido@example.com" },
  }),
]);
assert.equal(varios[0].itens.length, 2);
assert.equal(varios[0].itens[0].titulo, longo);
assert.equal(fecharCaixa(varios, [], true).liquido, 15.5);
assert.equal(fecharCaixa(varios, [], true).taxa, 0);

const asaas = agruparPedidos([pedido({ txid: "ASAAS-TESTE", valor: 10, confirmacao: "asaas", titulo: longo })])[0];
const caixaAsaas = fecharCaixa([asaas], [{
  txid: "ASAAS-TESTE",
  taxa: 1.99,
  valor_liquido: 8.01,
  status: "paga",
  cobranca_externa: "pay_ficticio",
}], true);
assert.equal(caixaAsaas.taxa, 1.99);
assert.equal(caixaAsaas.liquido, 8.01);
assert.equal(caixaAsaas.linhas[0].asaas, "pay_ficticio");
assert.notEqual(caixaAsaas.taxa, 0);

const ajustado = fecharCaixa([asaas], [{ txid: "ASAAS-TESTE", taxa: 0.5, valor_liquido: 3.5, status: "paga" }], true);
assert.equal(ajustado.liquido, 3.5);

const incompleto = fecharCaixa([asaas], [{ txid: "ASAAS-TESTE", taxa: null, valor_liquido: null, status: "criada" }], true);
assert.equal(incompleto.liquido, null);
assert.equal(incompleto.taxa, null);
assert.equal(incompleto.linhas[0].conhecido, false);
assert.deepEqual(linhaExportada(incompleto.linhas[0], (valor) => String(valor)), ["Não disponível", "Não disponível"]);

const misto = fecharCaixa(
  [manual, asaas],
  [{ txid: "ASAAS-TESTE", taxa: null, valor_liquido: null, status: "criada" }],
  true,
);
assert.equal(misto.liquido, null);
assert.equal(misto.linhas.find((linha) => linha.grupo.txid === "MANUAL-TESTE").taxa, 0);
assert.equal(misto.linhas.find((linha) => linha.grupo.txid === "ASAAS-TESTE").conhecido, false);

assert.equal(fecharCaixa([manual], [], false).liquido, null);
assert.equal(fecharCaixa([agruparPedidos([pedido({ txid: "SEM-ORIGEM", confirmacao: null })])[0]], [], true).liquido, null);

const aguardando = pedido({ txid: "PENDENTE-TESTE", status: "aguardando", confirmacao: null });
const estornado = pedido({ txid: "ESTORNO-TESTE", status: "estornado", confirmacao: "asaas", valor: 9 });
const resumo = resumirVendas([pedido({ txid: "MANUAL-TESTE" }), aguardando, estornado]);
assert.equal(resumo.pedidosPagos, 1);
assert.equal(resumo.bruto, 4.9);
assert.equal(resumo.aguardando, 1);
assert.equal(resumo.encerrados, 1);
const soPagos = agruparPedidos([pedido({ txid: "MANUAL-TESTE" }), aguardando, estornado]).filter((grupo) => grupo.status === "pago");
assert.equal(fecharCaixa(soPagos, [], true).liquido, 4.9);
assert.equal(fecharCaixa([], [], true).liquido, 0);

console.log("ok caixa financeira");
