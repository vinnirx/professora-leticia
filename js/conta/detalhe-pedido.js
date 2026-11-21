import { moeda, quando } from "./avisos.js";

const AUSENTE = "Não disponível";

const STATUS_PEDIDO = {
  pago: "Pago",
  estornado: "Estornado",
  cancelado: "Cancelado",
  aguardando: "Aguardando",
};

const STATUS_COBRANCA = {
  criada: "Criada",
  pendente: "Pendente",
  pago: "Paga",
  expirada: "Expirada",
  cancelada: "Cancelada",
  estornada: "Estornada",
  analise: "Em análise",
};

function texto(valor) {
  const limpo = String(valor ?? "").trim();
  return limpo || AUSENTE;
}

function rotulo(mapa, valor) {
  const chave = String(valor ?? "").trim();
  if (!chave) return AUSENTE;
  return mapa[chave] || chave;
}

function dinheiro(valor) {
  if (valor == null || valor === "") return AUSENTE;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return AUSENTE;
  return moeda.format(Math.round(numero * 100) / 100);
}

function dataLegivel(iso) {
  const data = new Date(iso || "");
  if (!iso || Number.isNaN(data.getTime())) return AUSENTE;
  return quando.format(data);
}

function somar(itens) {
  let soma = 0;
  let algum = false;
  itens.forEach((item) => {
    if (item?.valor == null || item.valor === "") return;
    const numero = Number(item.valor);
    if (!Number.isFinite(numero)) return;
    algum = true;
    soma += numero;
  });
  return algum ? Math.round(soma * 100) / 100 : null;
}

function situacaoCobranca(cobrancas) {
  if (!Array.isArray(cobrancas) || !cobrancas.length) return AUSENTE;
  const rotulos = [...new Set(cobrancas.map((item) => rotulo(STATUS_COBRANCA, item?.status)))];
  return rotulos.join(", ");
}

function historicoFinanceiro(cobrancas, financeiro) {
  if (!financeiro) return AUSENTE;
  const conhecidas = (cobrancas || []).filter((item) => item && (item.valor_bruto != null || item.taxa != null || item.valor_liquido != null));
  if (!conhecidas.length) return AUSENTE;
  return conhecidas.map((item) => {
    const partes = [
      `Bruto ${dinheiro(item.valor_bruto)}`,
      `Tarifa ${dinheiro(item.taxa)}`,
      `Líquido ${dinheiro(item.valor_liquido)}`,
    ];
    if (item.atualizado_em) partes.push(`Atualização da cobrança ${dataLegivel(item.atualizado_em)}`);
    return partes.join(". ");
  }).join(" ");
}

function direitosDoPedido(direitos) {
  if (!direitos || direitos.ok !== true || !Array.isArray(direitos.itens)) return AUSENTE;
  if (!direitos.itens.length) return "Nenhum direito vinculado a este pedido.";
  return direitos.itens.map((item) => {
    const nome = texto(item?.titulo || item?.atividade_id);
    const estado = item?.revogado_em ? "Revogado" : "Ativo";
    const quandoConcedido = item?.concedido_em ? dataLegivel(item.concedido_em) : AUSENTE;
    return `${nome} · ${estado} · ${quandoConcedido}`;
  }).join("; ");
}

export function resumoDoPedido(grupo, contexto = {}) {
  const pedido = grupo && typeof grupo === "object" ? grupo : {};
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const cobrancas = Array.isArray(contexto.cobrancas)
    ? contexto.cobrancas.filter((item) => item?.txid === pedido.txid)
    : [];
  const total = somar(itens);
  return {
    codigo: texto(pedido.txid),
    nome: texto(pedido.perfis?.nome),
    email: texto(pedido.perfis?.email),
    criadoEm: dataLegivel(pedido.criado_em),
    situacao: rotulo(STATUS_PEDIDO, pedido.status),
    materiais: itens.map((item) => ({
      titulo: texto(item?.titulo),
      valor: dinheiro(item?.valor),
    })),
    total: total == null ? AUSENTE : dinheiro(total),
    cobranca: situacaoCobranca(cobrancas),
    pagamentoEm: AUSENTE,
    historicoFinanceiro: historicoFinanceiro(cobrancas, contexto.financeiro === true),
    direitos: direitosDoPedido(contexto.direitos),
  };
}

function definicao(rotuloCampo, valor) {
  const dt = document.createElement("dt");
  dt.textContent = rotuloCampo;
  const dd = document.createElement("dd");
  dd.textContent = texto(valor);
  return [dt, dd];
}

function secao(titulo, campos) {
  const bloco = document.createElement("section");
  const nome = document.createElement("h4");
  nome.textContent = titulo;
  const lista = document.createElement("dl");
  campos.forEach(([rotuloCampo, valor]) => lista.append(...definicao(rotuloCampo, valor)));
  bloco.append(nome, lista);
  return bloco;
}

export function abrirDetalhePedido(grupo, contexto = {}) {
  const resumo = resumoDoPedido(grupo, contexto);
  const dialogo = document.createElement("dialog");
  dialogo.className = "dialogo-admin dialogo-pedido";
  dialogo.setAttribute("aria-labelledby", "titulo-pedido-aberto");

  const topo = document.createElement("div");
  topo.className = "dialogo-pedido-topo";
  const titulo = document.createElement("h3");
  titulo.id = "titulo-pedido-aberto";
  titulo.textContent = resumo.codigo === AUSENTE ? "Pedido" : `Pedido ${resumo.codigo}`;
  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "botao botao-secundario";
  fechar.textContent = "Fechar";
  topo.append(titulo, fechar);

  const ficha = document.createElement("div");
  ficha.className = "ficha-pedido";
  ficha.append(
    secao("Cliente", [
      ["Nome", resumo.nome],
      ["E-mail", resumo.email],
    ]),
    secao("Pedido", [
      ["Identificador", resumo.codigo],
      ["Criado em", resumo.criadoEm],
      ["Situação", resumo.situacao],
    ]),
  );

  const materiais = document.createElement("section");
  const tituloMateriais = document.createElement("h4");
  tituloMateriais.textContent = "Materiais";
  const lista = document.createElement("ul");
  lista.className = "materiais-pedido";
  if (!resumo.materiais.length) {
    const vazio = document.createElement("li");
    vazio.textContent = AUSENTE;
    lista.append(vazio);
  } else {
    resumo.materiais.forEach((item) => {
      const linha = document.createElement("li");
      const nome = document.createElement("span");
      nome.textContent = item.titulo;
      const valor = document.createElement("strong");
      valor.textContent = item.valor;
      linha.append(nome, valor);
      lista.append(linha);
    });
  }
  const total = document.createElement("p");
  total.textContent = `Valor total ${resumo.total}`;
  materiais.append(tituloMateriais, lista, total);

  ficha.append(
    materiais,
    secao("Pagamento", [
      ["Situação da cobrança", resumo.cobranca],
      ["Data de pagamento", resumo.pagamentoEm],
      ["Histórico financeiro", resumo.historicoFinanceiro],
      ["Direitos de download", resumo.direitos],
    ]),
  );

  const encerrar = () => {
    if (dialogo.open) dialogo.close();
    dialogo.remove();
  };
  fechar.addEventListener("click", encerrar);
  dialogo.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    encerrar();
  });
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) encerrar();
  });

  dialogo.append(topo, ficha);
  document.body.append(dialogo);
  dialogo.showModal();
  fechar.focus();
  return dialogo;
}
