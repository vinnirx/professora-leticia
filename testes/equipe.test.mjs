import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { administra } from "../js/conta/papeis.js";
import { acoesDoMembro, estadoDoHistorico, membrosDaEquipe, textoDoFinanceiro, textoDoMembro } from "../js/conta/equipe.js";

const dona = { id: "dona", nome: "Letícia", papel: "owner", acesso_financeiro: true };
const gestor = { id: "gestor", nome: "Vinicius", papel: "admin", acesso_financeiro: true };
const apoio = { id: "apoio", nome: "Apoio", papel: "admin", acesso_financeiro: false };
const cliente = { id: "cliente", nome: "Cliente", papel: "cliente", acesso_financeiro: false };
const contas = [cliente, gestor, dona, apoio];

const equipe = membrosDaEquipe(contas);
assert.deepEqual(equipe.map((conta) => conta.papel), ["owner", "admin", "admin"]);
assert.equal(equipe.some((conta) => conta.papel === "cliente"), false);
assert.match(textoDoMembro(dona), /Perfil protegido/);
assert.match(textoDoMembro(gestor), /atividades administrativas/);
assert.match(textoDoFinanceiro(gestor), /Acesso financeiro registrado/);
assert.match(textoDoFinanceiro(apoio), /Sem acesso financeiro/);
assert.deepEqual(acoesDoMembro(dona, dona), []);
assert.deepEqual(acoesDoMembro(gestor, dona), []);
assert.deepEqual(acoesDoMembro(gestor, gestor), []);
assert.deepEqual(acoesDoMembro(cliente, gestor), []);
assert.ok(acoesDoMembro(dona, gestor).includes("financeiro"));
assert.equal(acoesDoMembro(dona, cliente).includes("tornar-admin"), false);
assert.equal(administra("cliente"), false);
assert.equal(administra(undefined), false);

assert.equal(estadoDoHistorico({ ok: false, mensagem: "Confirme o segundo fator para continuar." }).tipo, "protegido");
assert.equal(estadoDoHistorico({ ok: false, mensagem: "Não foi possível agora. Tente de novo." }).tipo, "protegido");
assert.equal(estadoDoHistorico({ ok: true, linhas: [] }).tipo, "vazio");
assert.equal(estadoDoHistorico({ ok: true, linhas: [{ id: "1" }] }).tipo, "lista");
assert.match(estadoDoHistorico({ ok: false, mensagem: "Confirme o segundo fator para continuar." }).texto, /lista da equipe continua visível/);

const fonte = readFileSync(new URL("../js/conta/equipe.js", import.meta.url), "utf8");
const pagina = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
assert.doesNotMatch(fonte, /Letícia|Vinicius|Tornar administrador/);
assert.match(pagina, /Gerencie as pessoas responsáveis pela administração da loja/);
assert.match(fonte, /membrosDaEquipe\(memoria\.contas\)/);
assert.doesNotMatch(fonte, /\.update\(|\.insert\(|\.delete\(/);

console.log("ok equipe");
