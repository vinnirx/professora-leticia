import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparPedidos, resumirVendas } from "../js/conta/grupos-pedido.js";

const compra = [
  { txid: "PEDIDO-1", usuario_id: "cliente-a", valor: 9.9, status: "pago", atividade_id: "um" },
  { txid: "PEDIDO-1", usuario_id: "cliente-a", valor: 4.9, status: "pago", atividade_id: "dois" },
  { txid: "PEDIDO-2", usuario_id: "cliente-b", valor: 4.9, status: "aguardando", atividade_id: "um" },
  { txid: "PEDIDO-3", usuario_id: "cliente-c", valor: 9.9, status: "cancelado", atividade_id: "dois" },
];
const resumo = resumirVendas(compra);
assert.equal(resumo.pedidosPagos, 1);
assert.equal(resumo.unidadesPagas, 2);
assert.equal(resumo.bruto, 14.8);
assert.equal(resumo.aguardando, 1);
assert.equal(resumo.encerrados, 1);
assert.equal(agruparPedidos(compra).find((grupo) => grupo.txid === "PEDIDO-1").valor, 14.8);

const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
assert.match(painel, /id="lista-trabalho"/);
assert.match(painel, /id="cadastro-atividade" hidden/);
assert.match(painel, /class="filtros-painel"/);
assert.equal(admin.includes('document.querySelector("#abrir-cadastro")?.click()'), false);
assert.match(admin, /mostrar-lista-atividades/);
assert.match(admin, /Voltar à visão geral/);
assert.match(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8"), /cobrancaAutomatica: false/);

const migracao = readFileSync(new URL("../supabase/migracao-atendimento.sql", import.meta.url), "utf8");
assert.match(migracao, /NÃO execute este arquivo sem autorização/);
assert.match(migracao, /public\.sou_admin\(\)/);
assert.doesNotMatch(migracao, /encrypted_password|service_role|raw_user_meta_data/);
assert.match(migracao, /grant execute on function public\.listar_contas/);

console.log("ok revisão do painel");
