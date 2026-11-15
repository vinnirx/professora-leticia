const CHAVE = "tentativa-compra";

export function idsDaTentativa(ids) {
  return [...ids].map(String).filter(Boolean).sort();
}

export function cobrancaReutilizavel({ status, expiraEm, agora = Date.now() }) {
  if (!["criada", "pendente"].includes(status)) return false;
  if (!expiraEm) return true;
  const limite = Date.parse(expiraEm);
  return Number.isFinite(limite) && limite > agora;
}

export function lerTentativa(storage, ids) {
  try {
    const bruto = JSON.parse(storage.getItem(CHAVE) || "null");
    const esperados = idsDaTentativa(ids).join(",");
    if (!bruto || bruto.ids !== esperados || typeof bruto.codigo !== "string" || bruto.codigo.length < 8) return null;
    if (bruto.documento || bruto.valor || bruto.cpf) return null;
    return { codigo: bruto.codigo };
  } catch {
    return null;
  }
}

export function gravarTentativa(storage, ids, codigo) {
  storage.setItem(CHAVE, JSON.stringify({
    ids: idsDaTentativa(ids).join(","),
    codigo: String(codigo),
  }));
}

export function limparTentativa(storage) {
  storage.removeItem(CHAVE);
}

export function pedidoRepetido(erro) {
  const codigo = String(erro?.code || "");
  const texto = String(erro?.message || "");
  return codigo === "23505" || /duplicate key|unique constraint/i.test(texto);
}
