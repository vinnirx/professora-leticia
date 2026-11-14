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
