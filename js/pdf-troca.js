import { caminhoPdf } from "./arquivo-seguro.js";

export const LIMITE_PDF = 20 * 1024 * 1024;

export const PDF_AINDA_NAO_INSTALADO = "A substituição segura do PDF ainda não está instalada. O arquivo atual foi mantido.";

export function formatarTamanho(bytes) {
  const valor = Number(bytes) || 0;
  if (valor >= 1024 * 1024) {
    return `${(valor / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  if (valor >= 1024) return `${Math.ceil(valor / 1024).toLocaleString("pt-BR")} KB`;
  return `${valor.toLocaleString("pt-BR")} bytes`;
}

export function assinaturaPdf(bytes) {
  if (!bytes || bytes.length < 5) return false;
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

export function validarPdf({ nome, tipo, tamanho, bytes }) {
  const arquivo = String(nome || "");
  if (!/\.pdf$/i.test(arquivo)) return { ok: false, mensagem: "Escolha um arquivo com extensão .pdf." };
  const tipoNormal = String(tipo || "").toLowerCase();
  if (tipoNormal && tipoNormal !== "application/pdf" && tipoNormal !== "application/octet-stream") {
    return { ok: false, mensagem: "O arquivo precisa ser um PDF." };
  }
  if (!tamanho || tamanho > LIMITE_PDF) return { ok: false, mensagem: "O PDF precisa ter até 20 MB." };
  if (!assinaturaPdf(bytes)) return { ok: false, mensagem: "O arquivo não parece um PDF." };
  return { ok: true };
}

export function nomeAnterior(arquivoAtual, instante) {
  const base = String(arquivoAtual || "material.pdf")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "material";
  const marca = Number.isFinite(Number(instante)) ? Number(instante) : Date.now();
  const nome = `${base}-anterior-${marca}.pdf`;
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(nome)) return "";
  if (nome === arquivoAtual) return "";
  return nome;
}

export function pdfAnteriorDisponivel(nomes, atual, gravado = "") {
  const lista = (Array.isArray(nomes) ? nomes : [])
    .map((nome) => String(nome || ""))
    .filter((nome) => /\.pdf$/i.test(nome));
  const vigente = String(atual || "");
  const informados = (Array.isArray(gravado) ? gravado : [gravado])
    .map((nome) => String(nome || ""))
    .filter(Boolean);
  if (informados.length) {
    const registrados = informados.filter((nome) => nome !== vigente && lista.includes(nome) && !nome.includes("/"));
    return registrados.at(-1) || "";
  }
  const copia = lista
    .filter((nome) => /-anterior-\d+\.pdf$/i.test(nome))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
  if (copia && copia !== vigente) return copia;
  if (!/^versao-\d+\.pdf$/i.test(vigente)) return "";
  return lista.find((nome) => (
    nome !== vigente
    && !/^versao-\d+\.pdf$/i.test(nome)
    && !/-anterior-\d+\.pdf$/i.test(nome)
  )) || "";
}

export function nomeVersao(instante) {
  const marca = Number.isFinite(Number(instante)) ? Number(instante) : Date.now();
  return `versao-${marca}.pdf`;
}

function caminho(atividadeId, nome) {
  return caminhoPdf(atividadeId, nome);
}

export async function executarSubstituicao({
  storage,
  atividadeId,
  arquivoAtual,
  nome,
  tipo,
  tamanho,
  bytes,
  instante,
  existeAtual,
  definirArquivo,
}) {
  const validacao = validarPdf({ nome, tipo, tamanho, bytes });
  if (!validacao.ok) return { ok: false, mensagem: validacao.mensagem, arquivo: arquivoAtual || "" };
  const vigente = String(arquivoAtual || "");
  if (definirArquivo) {
    const novo = nomeVersao(instante);
    if (!caminho(atividadeId, novo)) {
      return { ok: false, mensagem: "Não foi possível nomear o PDF novo. O atual foi mantido.", arquivo: vigente };
    }
    try {
      await storage.enviar(caminho(atividadeId, novo), bytes, { upsert: false });
    } catch {
      return { ok: false, mensagem: "O PDF atual foi mantido. O envio do arquivo novo não terminou.", arquivo: vigente };
    }
    const referencia = await definirArquivo(novo);
    if (!referencia?.ok) {
      return {
        ok: false,
        mensagem: "O PDF atual foi mantido. O arquivo novo ficou guardado, mas a loja ainda não aponta para ele.",
        arquivo: vigente,
        guardado: novo,
      };
    }
    return {
      ok: true,
      mensagem: "PDF substituído. O arquivo anterior continua guardado.",
      arquivo: novo,
      anterior: vigente,
    };
  }
  const destino = vigente || `${atividadeId}.pdf`;
  if (!caminho(atividadeId, destino)) {
    return { ok: false, mensagem: "O nome do PDF atual não pode ser substituído.", arquivo: vigente };
  }
  let anterior = "";
  if (vigente && existeAtual) {
    anterior = nomeAnterior(vigente, instante);
    if (!caminho(atividadeId, anterior)) {
      return { ok: false, mensagem: "Não foi possível guardar uma cópia do PDF atual. Nada foi substituído.", arquivo: vigente };
    }
    let bytesAtuais;
    try {
      bytesAtuais = await storage.baixar(caminho(atividadeId, vigente));
    } catch {
      return { ok: false, mensagem: "Não foi possível guardar o PDF atual. Nada foi substituído.", arquivo: vigente };
    }
    try {
      await storage.enviar(caminho(atividadeId, anterior), bytesAtuais, { upsert: false });
    } catch {
      return { ok: false, mensagem: "Não foi possível guardar o PDF atual. Nada foi substituído.", arquivo: vigente };
    }
  }
  try {
    await storage.enviar(caminho(atividadeId, destino), bytes, { upsert: true });
  } catch {
    return {
      ok: false,
      mensagem: anterior
        ? "O PDF atual foi mantido. A cópia anterior também ficou guardada."
        : "O PDF não entrou. Nenhum arquivo foi trocado.",
      arquivo: vigente,
      anterior,
    };
  }
  return {
    ok: true,
    mensagem: anterior
      ? "PDF substituído. O arquivo anterior ficou guardado e pode ser restaurado."
      : "PDF guardado.",
    arquivo: destino,
    anterior,
  };
}

export async function executarRestauracao({
  storage,
  atividadeId,
  arquivoAtual,
  nomeAnteriorArquivo,
  definirArquivo,
}) {
  const anterior = String(nomeAnteriorArquivo || "");
  if (!caminho(atividadeId, anterior)) {
    return { ok: false, mensagem: "O PDF anterior não pode ser restaurado." };
  }
  if (definirArquivo) {
    const referencia = await definirArquivo(anterior);
    if (referencia?.ok) {
      return { ok: true, mensagem: "A loja voltou a usar o PDF anterior.", arquivo: anterior };
    }
    return { ok: false, mensagem: "Não foi possível voltar ao PDF anterior. O atual permanece." };
  }
  const destino = String(arquivoAtual || "");
  if (!caminho(atividadeId, destino)) {
    return { ok: false, mensagem: "O PDF atual não pode receber a restauração." };
  }
  let bytes;
  try {
    bytes = await storage.baixar(caminho(atividadeId, anterior));
  } catch {
    return { ok: false, mensagem: "O PDF anterior não foi encontrado. O atual permanece." };
  }
  try {
    await storage.enviar(caminho(atividadeId, destino), bytes, { upsert: true });
  } catch {
    return { ok: false, mensagem: "Não foi possível voltar. O PDF atual permanece." };
  }
  return { ok: true, mensagem: "O PDF anterior voltou ao lugar.", arquivo: destino };
}
