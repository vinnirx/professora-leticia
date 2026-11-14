export const LIMITE_CAPA = 5 * 1024 * 1024;

const EXTENSOES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function confere(bytes, esperados) {
  if (!bytes || bytes.length < esperados.length) return false;
  return esperados.every((valor, indice) => bytes[indice] === valor);
}

export function assinaturaCapa(tipo, bytes) {
  if (tipo === "image/jpeg") return confere(bytes, [0xff, 0xd8, 0xff]);
  if (tipo === "image/png") return confere(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (tipo === "image/webp") {
    if (!bytes || bytes.length < 12) return false;
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  return false;
}

export function validarCapa({ tipo, tamanho, bytes }) {
  const extensao = EXTENSOES[tipo];
  if (!extensao) return { ok: false, mensagem: "A capa precisa ser JPG, PNG ou WebP." };
  if (!tamanho || tamanho > LIMITE_CAPA) return { ok: false, mensagem: "A imagem precisa ter até 5 MB." };
  if (!assinaturaCapa(tipo, bytes)) return { ok: false, mensagem: "O arquivo não parece a imagem escolhida." };
  return { ok: true, extensao };
}

export function nomeCapa(atividadeId, extensao, instante) {
  const id = String(atividadeId || "");
  const marca = Number.isFinite(Number(instante)) ? Number(instante) : Date.now();
  if (!/^[a-z0-9-]{1,48}$/.test(id)) return "";
  if (!/^(jpg|png|webp)$/.test(extensao || "")) return "";
  return `${id}-${marca}.${extensao}`;
}

export function urlComVersao(url, instante) {
  const base = String(url || "").split("?")[0];
  if (!base) return "";
  const marca = Number.isFinite(Number(instante)) ? Number(instante) : Date.now();
  return `${base}?v=${marca}`;
}
