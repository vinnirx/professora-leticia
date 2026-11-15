export const TIPO_OTP_CADASTRO = "signup";

export function codigoNumerico(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 6);
}

export function mensagemOtp(erro) {
  const codigo = String(erro?.code || erro?.error_code || "");
  const texto = String(erro?.message || erro || "");
  if (/rate limit|too many|over_request/i.test(texto) || codigo === "over_request_rate_limit") {
    return "Muitas tentativas. Espere um pouco e peça outro código.";
  }
  if (/already confirmed|already been confirmed/i.test(texto)) {
    return "Este e-mail já está confirmado. Você já pode entrar.";
  }
  if (codigo === "otp_expired") return "Esse código expirou. Peça outro.";
  if (/expired/i.test(texto) && /invalid/i.test(texto)) {
    return "Esse código não confere ou expirou. Peça outro se precisar.";
  }
  if (/expired/i.test(texto)) return "Esse código expirou. Peça outro.";
  return "Esse código não confere.";
}
