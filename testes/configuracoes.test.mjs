import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const pagina = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const mfa = readFileSync(new URL("../js/conta/mfa.js", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");

assert.match(admin, /"configuracoes"/);
assert.match(admin, /montarSegundoFator\(loja, document\.querySelector\("#segundo-fator"\)\)/);
assert.match(admin, /location\.hash = "configuracoes"/);
assert.match(admin, /mfa\.js\?v=10/);
assert.doesNotMatch(admin, /function pintarConfig|lista-config|Ainda não instalada no banco|Somente leitura|pixChave/);
assert.doesNotMatch(admin, /supabase\/migrations|alter table|create policy/i);

assert.match(pagina, /data-secao="configuracoes"/);
assert.match(pagina, /id="segundo-fator"/);
assert.match(pagina, /id="conciliacao"/);
assert.match(pagina, /id="encerrar-conciliacao"/);
assert.match(pagina, /conta\.js\?v=74/);
assert.doesNotMatch(pagina, /id="lista-config"|Somente leitura|Ainda não instalada|SQL Editor/);

assert.match(mfa, /Cadastrar autenticador/);
assert.match(mfa, /Remover autenticador/);
assert.match(mfa, /Testar código/);
assert.doesNotMatch(mfa.slice(mfa.indexOf("function montarSegundoFator"), mfa.indexOf("function mensagemDeCliente")), /Supabase|Authentication/);
assert.match(conta, /admin\.js\?v=43/);

console.log("ok configuracoes");
