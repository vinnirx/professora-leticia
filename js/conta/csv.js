export function celulaCsv(valor) {
  const texto = String(valor ?? "");
  const protegido = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${protegido.replaceAll('"', '""')}"`;
}
