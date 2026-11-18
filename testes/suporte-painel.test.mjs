import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aguardaResposta, protocoloVisivel, rotuloAssunto, rotuloSolicitacao } from "../js/suporte.js";

const cliente = "44444444-4444-4444-8444-444444444444";
const equipe = "22222222-2222-4222-8222-222222222222";
const chamado = {
  id: "1234abcd-0000-4000-8000-000000000001",
  usuario_id: cliente,
  assunto: "download",
  status: "aberto",
  mensagens: [{ autor_id: cliente, texto: "Não baixei.", criado_em: "2026-11-18T12:00:00Z" }],
};

assert.equal(protocoloVisivel(chamado), "AJ-1234ABCD");
assert.equal(protocoloVisivel({ ...chamado, protocolo: "RC-20261118-ABCDEF12" }), "RC-20261118-ABCDEF12");
assert.equal(aguardaResposta(chamado), true);
assert.equal(aguardaResposta({
  ...chamado,
  status: "atendimento",
  mensagens: [...chamado.mensagens, { autor_id: equipe, texto: "Pode tentar de novo.", criado_em: "2026-11-18T12:05:00Z" }],
}), false);
assert.equal(rotuloAssunto("reembolso"), "Cancelamento e reembolso");
assert.equal(rotuloSolicitacao("atendimento"), "Em atendimento");
assert.equal(rotuloSolicitacao("resolvido"), "Resolvido");
assert.equal(rotuloSolicitacao("aberto"), "Aberto");

const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
function metodo(nome) {
  const inicio = sessao.indexOf(`async ${nome}`);
  const resto = sessao.slice(inicio + 1);
  const fim = resto.search(/\n    async /);
  return sessao.slice(inicio, inicio + 1 + fim);
}
const resposta = metodo("responderSolicitacao");
assert.match(resposta, /solicitacao_mensagens/);
assert.doesNotMatch(resposta, /cobrancas|estornar|refund/i);
assert.doesNotMatch(metodo("atualizarSolicitacao"), /cobrancas|estornar|refund/i);

for (const pagina of ["ajuda/index.html", "minha-conta/index.html"]) {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.match(html, /mailto:leticiapimenteldemacedo@gmail\.com/);
}

const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
assert.match(painel, /id="busca-suporte"/);
assert.match(painel, /id="filtro-suporte"/);
assert.match(painel, /id="suporte-resposta"/);
assert.doesNotMatch(painel, /estornar-cobranca/);

console.log("ok suporte no painel");
