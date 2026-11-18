import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leituraAdministrativa, pedidoDeEntrada, resumoAdministrativo, textoDaLista, textoDasContas } from "../js/conta/apresentacao.js";
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
assert.equal(pedidoDeEntrada(cliente, "admin.html"), "minha-conta/");
assert.equal(pedidoDeEntrada(cliente, "gerenciar/"), "minha-conta/");
assert.equal(pedidoDeEntrada(proprietaria, "admin.html"), "admin.html");
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
assert.deepEqual(dona.atalhos.map((item) => item.hash), ["atividades", "arquivos", "pedidos"]);
assert.deepEqual(dona.indicadores.map((item) => [item.rotulo, item.valor]), [
  ["Atividades", "3"],
  ["Arquivos PDF", "2"],
  ["Pedidos", "2"],
  ["Receita bruta", 14.8],
]);
assert.equal(dona.semPedidos, false);

const gestor = resumoAdministrativo({ perfil: administrador, atividades, pedidos });
assert.equal(gestor.cargo, "Administrador");
assert.equal(gestor.atalhos.some((item) => item.hash === "financeiro"), false);

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
assert.equal(indisponivel.atalhos.length, 3);

const clienteResumo = resumoAdministrativo({ perfil: cliente, atividades, pedidos });
assert.equal(clienteResumo.cargo, "Cliente");
assert.equal(clienteResumo.atalhos.some((item) => item.hash === "financeiro"), false);

const tela = readFileSync(new URL("../js/conta/minhas.js", import.meta.url), "utf8");
const entrada = readFileSync(new URL("../js/conta/entrar.js", import.meta.url), "utf8");
assert.equal(leituraAdministrativa({ ok: true, atual: "aal2" }, "owner"), "ok");
assert.equal(leituraAdministrativa({ ok: true, atual: "aal1" }, "owner"), "permissao");
assert.equal(leituraAdministrativa({ ok: false }, "admin"), "erro");
assert.equal(leituraAdministrativa(null, "cliente"), "ok");
assert.match(textoDaLista({ area: "pedidos", total: 0, visiveis: 0, leitura: "ok" }).titulo, /Nenhum pedido cadastrado/);
assert.match(textoDaLista({ area: "pedidos", total: 4, visiveis: 0, leitura: "ok" }).titulo, /período selecionado/);
assert.match(textoDaLista({ area: "pedidos", total: 0, visiveis: 0, leitura: "erro" }).titulo, /Não consegui consultar/);
assert.match(textoDaLista({ area: "financeiro", total: 2, visiveis: 0, leitura: "permissao" }).titulo, /não tem permissão/);
assert.equal(textoDaLista({ area: "pedidos", total: 2, visiveis: 1, leitura: "ok" }), null);
assert.match(textoDaLista({ area: "financeiro", total: 3, visiveis: 0, leitura: "ok" }).detalhe, /Amplie as datas/);
assert.match(textoDaLista({ area: "pedidos", total: 2, visiveis: 0, leitura: "permissao" }).detalhe, /Configurações/);
assert.equal(textoDasContas({ leitura: "permissao", total: 1, consulta: "parcial" }).tipo, "parcial");
assert.equal(textoDasContas({ leitura: "permissao", total: 1, consulta: "parcial" }).destino, "configuracoes");
assert.equal(textoDasContas({ leitura: "erro", total: 0, consulta: "erro" }).tipo, "erro");
assert.equal(textoDasContas({ leitura: "ok", total: 0, consulta: "ok" }).tipo, "vazio");
assert.equal(textoDasContas({ leitura: "ok", total: 5, consulta: "ok" }), null);
assert.match(readFileSync(new URL("../css/conta.css", import.meta.url), "utf8"), /\.downloads-pedido \.linha-download \{[^}]*grid-template-columns: minmax\(0, 1fr\) 9\.5rem/s);
const painelHtml = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
assert.match(painelHtml, /data-secao="financeiro" hidden/);
const visaoHtml = painelHtml.slice(painelHtml.indexOf('data-painel="visao"'), painelHtml.indexOf('data-painel="atividades"'));
assert.equal(visaoHtml.includes("Atividades mais vendidas"), false);
assert.equal(visaoHtml.includes("Saiba mais"), false);
assert.match(painelHtml, /id="tabela-financeiro"/);
const cancelado = tela.slice(tela.indexOf('pedido.status === "estornado" || pedido.status === "cancelado"'), tela.indexOf('pedido.status !== "pago"'));
assert.match(cancelado, /acompanharPedido/);
assert.match(cancelado, /podeOcultar/);
assert.match(tela, /Ocultar do meu histórico/);
const download = tela.slice(tela.indexOf("function botaoDownload"), tela.indexOf("function mostrarDownloads"));
assert.match(download, /Baixar PDF/);
assert.match(download, /loja\.baixar\(material\.id\)/);
assert.match(tela, /data-downloads/);
assert.match(tela, /origemDaImagemPix/);
assert.equal(cancelado.includes("Excluir"), false);
assert.equal(tela.includes("Você ainda não tem atividades"), false);
assert.equal(tela.includes("location.href"), false);
assert.equal(tela.includes("location.replace"), false);
assert.match(entrada, /pedidoDeEntrada/);
const painel = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
assert.ok(painel.indexOf("app?.remove()") < painel.indexOf("loja.painel()"));
assert.match(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8"), /cobrancaAutomatica: false/);

console.log("ok apresentação da conta");
