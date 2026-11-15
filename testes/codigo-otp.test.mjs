import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIPO_OTP_CADASTRO, codigoNumerico, mensagemOtp } from "../js/conta/codigo.js";

assert.equal(TIPO_OTP_CADASTRO, "signup");
assert.equal(codigoNumerico("12a3456"), "123456");
assert.equal(codigoNumerico("1234567"), "123456");

assert.equal(mensagemOtp({ message: "Token has expired or is invalid" }), "Esse código não confere ou expirou. Peça outro se precisar.");
assert.equal(mensagemOtp({ code: "otp_expired", message: "expired" }), "Esse código expirou. Peça outro.");
assert.equal(mensagemOtp({ message: "otp expired" }), "Esse código expirou. Peça outro.");
assert.equal(mensagemOtp({ message: "Token is invalid" }), "Esse código não confere.");
assert.equal(mensagemOtp({ code: "over_request_rate_limit", message: "too many" }), "Muitas tentativas. Espere um pouco e peça outro código.");
assert.equal(mensagemOtp({ message: "Email address already confirmed" }), "Este e-mail já está confirmado. Você já pode entrar.");

const entrar = readFileSync(new URL("../js/conta/entrar.js", import.meta.url), "utf8");
const login = entrar.slice(entrar.indexOf("confirme o e-mail"), entrar.indexOf("destinoDepois(loja);", entrar.indexOf("confirme o e-mail")));
assert.match(login, /closest\("form"\)/);
assert.match(login, /reenvio\.insertAdjacentElement\("afterend", codigo\)/);
assert.match(login, /codigo\.hidden = false/);
assert.match(entrar, /Código de 6 números/);
assert.match(entrar, /maxLength = 6/);

console.log("codigo-otp ok");
