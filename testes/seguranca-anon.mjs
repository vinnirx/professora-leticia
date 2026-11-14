import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../js/supabase-config.js", import.meta.url), "utf8");
const url = config.match(/url = "([^"]+)"/)?.[1];
const chave = config.match(/chave = "([^"]+)"/)?.[1];
if (!url || !chave) {
  console.error("Configuração pública do Supabase não encontrada.");
  process.exit(1);
}

const headers = {
  apikey: chave,
  Authorization: `Bearer ${chave}`,
  "Content-Type": "application/json",
};

const provas = [];

async function prova(nome, caminho, opcoes = {}, aceito) {
  const resposta = await fetch(url + caminho, {
    ...opcoes,
    headers: { ...headers, ...(opcoes.headers || {}) },
  });
  const texto = await resposta.text();
  const ok = aceito(resposta.status, texto);
  provas.push({ nome, ok, status: resposta.status });
  console.log(`${ok ? "ok" : "FALHOU"} ${resposta.status} ${nome}`);
}

await prova("perfis anon", "/rest/v1/perfis?select=id,papel", {}, (status) => status === 401);
await prova("proprietaria anon", "/rest/v1/proprietaria?select=id", {}, (status) => status === 401);
await prova("auditoria anon", "/rest/v1/auditoria_permissoes?select=id", {}, (status) => status === 401);
await prova("pedidos anon", "/rest/v1/pedidos?select=id,status", {}, (status) => status === 401);
await prova("definir papel anon", "/rest/v1/rpc/definir_papel", {
  method: "POST",
  body: JSON.stringify({ alvo: "00000000-0000-0000-0000-000000000000", novo_papel: "super_admin" }),
}, (status) => status === 401);
await prova("confirmar pix anon", "/rest/v1/rpc/confirmar_pix", {
  method: "POST",
  body: JSON.stringify({ pedido: "00000000-0000-0000-0000-000000000000" }),
}, (status) => status === 401);
await prova("pdf publico", "/storage/v1/object/public/atividades/adicao/situacoes-problema-adicao.pdf", {}, (status) => status === 400);
await prova("catalogo anon", "/rest/v1/atividades?select=id,preco", {}, (status, texto) => status === 200 && texto.includes("adicao"));

if (provas.some((item) => !item.ok)) process.exit(1);
