const ofertas = new Map();

export function publicarOferta(item) {
  if (!item?.id) return;
  ofertas.set(item.id, item);
}

export function publicarOfertas(lista) {
  (lista || []).forEach(publicarOferta);
}

export function ofertaDe(id) {
  return ofertas.get(id) || null;
}

export function mesclarOferta(remota, local) {
  if (!local) return remota;
  const precoRemoto = Number(remota.preco);
  return {
    ...remota,
    titulo: remota.titulo || local.titulo,
    preco: Number.isFinite(precoRemoto) && precoRemoto > 0 ? remota.preco : local.preco,
    area: remota.area || local.area,
    temas: remota.temas?.length ? remota.temas : local.temas,
    capa: remota.capa || local.capa,
    capaAlt: remota.capaAlt || local.capaAlt,
    explicacao: remota.explicacao || local.explicacao,
    habilidades: remota.habilidades?.length ? remota.habilidades : local.habilidades,
  };
}
