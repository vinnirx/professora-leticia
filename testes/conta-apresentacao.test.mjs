import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pedidoDeEntrada, resumoAdministrativo } from "../js/conta/apresentacao.js";
import { destinoInterno } from "../js/rotas.js";

const proprietaria = { nome: "Dona Fictícia", papel: "owner", acesso_financeiro: false };
const administrador = { nome: "Gestor Fictício", papel: "admin", acesso_financeiro: true };
const semFinanceiro = { nome: "Apoio Fictício", papel: "admin", acesso_financeiro: false };
const cliente = { nome: "Cliente Fictício", papel: "cliente", acesso_financeiro: false };

assert.equal(pedidoDeEntrada(proprietaria, ""), "gerenciar/");
assert.equal(pedidoDeEntrada(administrador, ""), "gerenciar/");
assert.equal(pedidoDeEntrada(semFinanceiro, ""), "gerenciar/");
assert.equal(pedidoDeEntrada(cliente, ""), "minha-conta/");
assert.equal(pedidoDeEntrada(null, ""), "minha-conta/");
assert.equal(pedidoDeEntrada(proprietaria, "minha-conta/"), "minha-conta/");
assert.equal(pedidoDeEntrada(cliente, "admin.html"), "admin.html");
assert.equal(pedidoDeEntrada(proprietaria, "atividade.html?id=material-ficticio"), "atividade.html?id=material-ficticio");
assert.equal(pedidoDeEntrada(proprietaria, "index.html?carrinho=1"), "index.html?carrinho=1");
assert.equal(destinoInterno(pedidoDeEntrada(proprietaria, ""), "/entrar/"), "../gerenciar/");
assert.equal(destinoInterno(pedidoDeEntrada(cliente, "atividade.html?id=adicao"), "/entrar/"), "../atividade.html?id=adicao");

const atividades = [
  { id: "material-ficticio", arquivo: "material-ficticio.pdf" },
  { id: "sem-arquivo", arquivo: "" },
  { id: "outro-ficticio", arquivo: "outro.pdf" },
];
const pedidos = [
  { txid: "PEDIDO-1", usuario_id: "cliente-a", valor: 9.9, status: "pago" },
  { txid: "PEDIDO-1", usuario_id: "cliente-a", valor: 4.9, status: "pago" },
  { txid: "PEDIDO-2", usuario_id: "cliente-b", valor: 4.9, status: "aguardando" },
];

const dona = resumoAdministrativo({ perfil: proprietaria, atividades, pedidos });
assert.equal(dona.cargo, "Proprietária");
assert.match(dona.texto, /proprietária/);
assert.equal(dona.texto.includes("não tem atividades"), false);
assert.deepEqual(dona.atalhos.map((item) => item.hash), ["atividades", "arquivos", "pedidos", "financeiro"]);
assert.deepEqual(dona.indicadores.map((item) => [item.rotulo, item.valor]), [
  ["Atividades", "3"],
  ["Arquivos PDF", "2"],
  ["Pedidos", "2"],
  ["Receita bruta", 14.8],
]);
assert.equal(dona.semPedidos, false);

const gestor = resumoAdministrativo({ perfil: administrador, atividades, pedidos });
assert.equal(gestor.cargo, "Administrador");
assert.equal(gestor.atalhos.some((item) => item.hash === "financeiro"), true);

const apoio = resumoAdministrativo({ perfil: semFinanceiro, atividades, pedidos });
assert.equal(apoio.atalhos.some((item) => item.hash === "financeiro"), false);
assert.equal(apoio.indicadores.some((item) => item.rotulo === "Receita bruta"), false);

const semVendas = resumoAdministrativo({
  perfil: proprietaria,
  atividades: [{ id: "material-ficticio", arquivo: "material-ficticio.pdf" }],
  pedidos: [],
});
assert.equal(semVendas.semPedidos, true);
assert.equal(semVendas.indicadores[0].valor, "1");
assert.equal(semVendas.indicadores.find((item) => item.dinheiro).valor, 0);

const indisponivel = resumoAdministrativo({ perfil: proprietaria, atividades: null, pedidos: null });
assert.equal(indisponivel.indicadores, null);
assert.equal(indisponivel.atalhos.length, 4);

const clienteResumo = resumoAdministrativo({ perfil: cliente, atividades, pedidos });
assert.equal(clienteResumo.cargo, "Cliente");
assert.equal(clienteResumo.atalhos.some((item) => item.hash === "financeiro"), false);

const tela = readFileSync(new URL("../js/conta/minhas.js", import.meta.url), "utf8");
const entrada = readFileSync(new URL("../js/conta/entrar.js", import.meta.url), "utf8");
assert.equal(tela.includes("Você ainda não tem atividades"), false);
assert.equal(tela.includes("location.href"), false);
assert.equal(tela.includes("location.replace"), false);
assert.match(entrada, /pedidoDeEntrada/);
assert.match(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8"), /cobrancaAutomatica: false/);

console.log("ok apresentação da conta");
