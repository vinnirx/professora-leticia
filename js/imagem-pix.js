export function origemDaImagemPix(valor) {
  const texto = String(valor || "").replace(/\s+/g, "");
  if (!texto) return "";
  const pronta = texto.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (pronta) return `data:image/${pronta[1]};base64,${pronta[2]}`;
  if (!/^[A-Za-z0-9+/=]+$/.test(texto)) return "";
  if (texto.startsWith("iVBORw0KGgo")) return `data:image/png;base64,${texto}`;
  if (texto.startsWith("/9j/")) return `data:image/jpeg;base64,${texto}`;
  return "";
}
