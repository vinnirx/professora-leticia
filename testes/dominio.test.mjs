import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { enderecoDeRecuperacao } from "../js/endereco-publico.js";
import { destinoInterno, destinoLegado, enderecoDeMidia, rota } from "../js/rotas.js";

const oficial = "https://inclusaonocotidiano.com.br/recuperar-senha/";
const antigo = "https://vinnirx.github.io/professora-leticia/recuperar-senha/";

assert.equal(enderecoDeRecuperacao("https://vinnirx.github.io/professora-leticia/minhas.html?depois=admin.html"), antigo);
assert.equal(enderecoDeRecuperacao("https://inclusaonocotidiano.com.br/entrar/#type=recovery"), oficial);
assert.equal(enderecoDeRecuperacao("https://www.inclusaonocotidiano.com.br/atividade.html?id=adicao"), oficial);
assert.equal(enderecoDeRecuperacao("http://127.0.0.1:4204/entrar.html?depois=admin.html"), "http://127.0.0.1:4204/recuperar-senha/");
assert.equal(enderecoDeRecuperacao("http://127.0.0.1:4204/gerenciar/"), "http://127.0.0.1:4204/recuperar-senha/");

assert.equal(rota("entrar/", "/professora-leticia/"), "entrar/");
assert.equal(rota("minha-conta/", "/professora-leticia/entrar/"), "../minha-conta/");
assert.equal(rota("inicio", "/inclusaonocotidiano/gerenciar/"), "../");
assert.equal(destinoInterno("admin.html", "/entrar/"), "../gerenciar/");
assert.equal(destinoInterno("atividade.html?id=adicao", "/"), "atividade.html?id=adicao");
assert.equal(destinoInterno("atividade.html?id=adicao", "/atividades/"), "../atividade.html?id=adicao");
assert.equal(enderecoDeMidia("img/capa-celulas.jpg?v=1", "/atividades/"), "../img/capa-celulas.jpg?v=1");
assert.equal(enderecoDeMidia("img/capa-celulas.jpg?v=1", "/"), "img/capa-celulas.jpg?v=1");
assert.equal(enderecoDeMidia("img/capa-celulas.jpg?v=1", "/atividade.html"), "img/capa-celulas.jpg?v=1");
assert.equal(enderecoDeMidia("https://exemplo.supabase.co/storage/v1/object/public/capas/a.jpg", "/atividades/"), "https://exemplo.supabase.co/storage/v1/object/public/capas/a.jpg");
assert.equal(destinoInterno("index.html?carrinho=1", "/minha-conta/"), "../?carrinho=1");
assert.equal(destinoLegado("/entrar.html", "entrar/", "#access_token=1&type=recovery", ""), "recuperar-senha/#access_token=1&type=recovery");
assert.equal(destinoLegado("/entrar.html", "entrar/", "#error_code=otp_expired", ""), "recuperar-senha/#error_code=otp_expired");
assert.equal(destinoLegado("/entrar/", "entrar/", "#error_code=otp_expired&type=signup", ""), "entrar/#error_code=otp_expired&type=signup");
assert.equal(destinoLegado("/minhas.html", "minha-conta/", "", "?aba=pedidos"), "minha-conta/?aba=pedidos");

const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
assert.match(sessao, /enderecoDeRecuperacao\(location\.href\)/);
assert.equal(sessao.includes("https://vinnirx.github.io/professora-leticia/entrar.html"), false);

const cors = readFileSync(new URL("../supabase/functions/_shared/cors.ts", import.meta.url), "utf8");
assert.match(cors, /https:\/\/inclusaonocotidiano\.com\.br/);
assert.match(cors, /https:\/\/www\.inclusaonocotidiano\.com\.br/);
assert.match(cors, /https:\/\/vinnirx\.github\.io/);
assert.match(cors, /http:\/\/127\.0\.0\.1:4204/);

assert.match(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8"), /cobrancaAutomatica: false/);
assert.match(sessao, /pixAutomaticoDisponivel/);
const checkout = readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
assert.match(checkout, /pixAutomaticoDisponivel/);
assert.match(checkout, /cobrancaAutomatica === true/);
assert.match(checkout, /Seu Pix está pronto\. Escaneie o QR Code ou utilize o Pix Copia e Cola\./);
assert.match(checkout, /Estamos aguardando a confirmação do pagamento\./);
assert.match(checkout, /Pagamento confirmado! Seus materiais estão disponíveis em Minha Conta\./);
assert.match(checkout, /O prazo do Pix expirou\. Gere uma nova cobrança\./);
assert.match(checkout, /Se você já pagou, aguarde a atualização ou procure o suporte\./);
assert.match(checkout, /Pague \$\{dinheiro\(total\)\}\. O PDF só entra em Minha conta quando este pagamento for confirmado\./);

for (const pagina of ["entrar/index.html", "criar-conta/index.html", "recuperar-senha/index.html", "minha-conta/index.html", "gerenciar/index.html"]) {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.equal(html.includes('href="../#atividades"'), false, pagina);
  assert.match(html, /class="logo" href="\.\.\/"/, pagina);
}
assert.match(readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8"), /id="painel-saudacao"/);
assert.match(readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8"), /painel-saudacao/);

function paginas(diretorio, prefixo = "") {
  const lista = [];
  for (const nome of readdirSync(diretorio)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) lista.push(...paginas(caminho, `${prefixo}${nome}/`));
    else if (nome.endsWith(".html")) lista.push(`${prefixo}${nome}`);
  }
  return lista;
}

const raiz = new URL("..", import.meta.url);
for (const pagina of paginas(raiz.pathname)) {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.equal(html.includes("/professora-leticia/"), false, pagina);
  assert.equal(/<(?:a|img|link|script)\b[^>]+(?:href|src)=["']\//.test(html), false, pagina);
}
const estilos = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
assert.equal(/url\((['"]?)\//.test(estilos), false);

console.log("ok domínio oficial");
