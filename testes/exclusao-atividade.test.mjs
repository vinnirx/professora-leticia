import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const corpo = admin.slice(admin.indexOf("async function apagarCadastro"), admin.indexOf("function atividadesFiltradas"));

assert.match(corpo, /travaExclusao\.entrar\(\)/);
assert.match(corpo, /apagarAtividadeSemVenda\(atividade\.id\)/);
assert.match(corpo, /Confirmar exclusão/);
assert.match(corpo, /executarArquivamento\(atividade\)/);
assert.doesNotMatch(corpo, /elegibilidadeAtividade/);
const recusa = corpo.indexOf("if (!resultado.ok)");
const exclusao = corpo.indexOf("apagarAtividadeSemVenda");
const remove = corpo.indexOf("memoria.atividades = memoria.atividades.filter");
assert.ok(exclusao < recusa);
assert.ok(recusa < remove);
assert.match(admin, /botaoAcao\("Excluir"/);
assert.match(admin, /foi arquivada, não excluída/);

console.log("ok exclusao atividade");
