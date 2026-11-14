function verificador(base, pesos) {
  const soma = base.split("").reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function documentoValido(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digitos)) return false;
  if (digitos.length === 11) {
    const primeiro = verificador(digitos.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = verificador(digitos.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digitos === `${digitos.slice(0, 9)}${primeiro}${segundo}`;
  }
  if (digitos.length === 14) {
    const primeiro = verificador(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = verificador(digitos.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digitos === `${digitos.slice(0, 12)}${primeiro}${segundo}`;
  }
  return false;
}

export function segredosIguais(recebido, esperado) {
  const codificador = new TextEncoder();
  const a = codificador.encode(String(recebido || ""));
  const b = codificador.encode(String(esperado || ""));
  if (a.length !== b.length || a.length === 0) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) diferenca |= a[indice] ^ b[indice];
  return diferenca === 0;
}

export function decidirEvento({ status, tipo, valorEsperado, valorRecebido }) {
  const centavosEsperados = Math.round(Number(valorEsperado) * 100);
  const centavosRecebidos = valorRecebido == null ? null : Math.round(Number(valorRecebido) * 100);
  if (tipo === "PAYMENT_RECEIVED") {
    if (["estornada", "cancelada", "analise"].includes(status)) {
      return { status: "analise", liberar: false, resultado: "analise" };
    }
    if (status === "pago") return { status: "pago", liberar: false, resultado: "repetido" };
    if (centavosRecebidos == null || centavosRecebidos !== centavosEsperados) {
      return { status: "analise", liberar: false, resultado: "analise" };
    }
    return { status: "pago", liberar: true, resultado: "pago", confirmacao: "asaas" };
  }
  if (tipo === "PAYMENT_CONFIRMED") {
    return { status, liberar: false, resultado: "confirmado_sem_liberar" };
  }
  if (tipo === "PAYMENT_OVERDUE" && ["criada", "pendente"].includes(status)) {
    return { status: "expirada", liberar: false, resultado: "expirada" };
  }
  if (tipo === "PAYMENT_DELETED" && ["criada", "pendente", "expirada"].includes(status)) {
    return { status: "cancelada", liberar: false, resultado: "cancelada" };
  }
  if (tipo === "PAYMENT_PARTIALLY_REFUNDED") {
    return { status: "analise", liberar: false, resultado: "analise" };
  }
  if (tipo === "PAYMENT_REFUNDED" && status === "pago") {
    return { status: "estornada", liberar: false, resultado: "estornada" };
  }
  if (["PAYMENT_CREATED", "PAYMENT_UPDATED"].includes(tipo) && status === "criada") {
    return { status: "pendente", liberar: false, resultado: "pendente" };
  }
  return { status, liberar: false, resultado: "ignorado" };
}
