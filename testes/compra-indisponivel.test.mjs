import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const checkout = ler("../js/checkout.js");
const texto = ler("../js/texto.js");
const minhas = ler("../js/conta/minhas.js");
const sessao = ler("../js/sessao.js");
const cobranca = ler("../supabase/functions/criar-cobranca/index.ts");
const mensagem = "Estamos preparando os pagamentos da loja. As compras estarão disponíveis em breve. Não realize pagamentos por QR Codes antigos. Se precisar de ajuda, entre em contato pelo suporte.";

assert.match(texto, new RegExp(mensagem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(checkout, /MENSAGEM_COMPRA_INDISPONIVEL/);
assert.match(checkout, /pixAutomaticoDisponivel\(\)/);
assert.match(checkout, /decidirPixAutomatico/);
assert.doesNotMatch(checkout, /cobrancaAutomatica === true/);
assert.match(checkout, /criarCobranca\(/);
assert.match(checkout, /Seu Pix está pronto\. Escaneie o QR Code ou utilize o Pix Copia e Cola\./);
assert.doesNotMatch(checkout, /montarPix|registrarPedido|registrarPedidos|window\.loja\.pixChave/);
assert.match(minhas, /MENSAGEM_COMPRA_INDISPONIVEL/);
assert.match(minhas, /rota\("ajuda\/"\)/);
assert.doesNotMatch(minhas, /VC97TPVUDR|estornarIntegral/);
assert.match(sessao, /registrarFalhaAuth/);
assert.match(sessao, /Ainda não consigo enviar a mensagem para este e-mail/);
assert.match(sessao, /Não consegui enviar o e-mail agora/);
assert.match(sessao, /JSON\.stringify\(\{ origem: "auth", tipo, codigo \}\)/);
assert.doesNotMatch(sessao.slice(sessao.indexOf("function registrarFalhaAuth"), sessao.indexOf("function traduzir")), /email|senha|password/);
assert.match(cobranca, /preparar_cobranca/);
assert.doesNotMatch(cobranca, /ASAAS_PRODUCAO_LIBERADA\s*=\s*[\"']sim/);

console.log("ok compra indisponível sem interromper a cobrança da conta autorizada");
