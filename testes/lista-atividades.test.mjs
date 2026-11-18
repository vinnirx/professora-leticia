import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/painel.css", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");
const lista = admin.slice(admin.indexOf("function explicacaoExclusao"), admin.indexOf("function atividadesFiltradas"));
const cartoes = admin.slice(admin.indexOf("function pintarAtividades"), admin.indexOf("function textoPdf"));

assert.match(html, /data-situacao="publicadas"/);
assert.match(html, /data-situacao="rascunhos"/);
assert.match(html, /data-situacao="arquivadas"/);
assert.match(html, /id="busca-atividade"/);
assert.match(html, /id="abrir-cadastro"/);
assert.doesNotMatch(html, /filtro-destaque-lista/);
assert.match(html, /conta\.js\?v=60/);
assert.match(html, /painel\.css\?v=21/);
assert.match(conta, /admin\.js\?v=29/);
assert.match(cartoes, /lista-atividades-simples/);
assert.match(cartoes, /botaoAcao\("Editar"/);
assert.match(cartoes, /botaoAcao\("Arquivar"/);
assert.match(cartoes, /botaoAcao\("Excluir"/);
assert.doesNotMatch(cartoes, /menuAcoes/);
assert.match(lista, /apagarAtividadeSemVenda/);
assert.match(lista, /Confirmar exclusão/);
assert.match(lista, /Esta atividade não pode ser excluída/);
assert.match(lista, /executarArquivamento\(atividade\)/);
assert.doesNotMatch(lista, /elegibilidadeAtividade/);
assert.match(admin, /foi arquivada, não excluída/);
assert.match(css, /\.lista-atividades-simples/);
assert.match(css, /\.acoes-atividade/);

console.log("ok lista de atividades");
