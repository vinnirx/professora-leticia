import { administra, podeFinanceiro, rotuloPapel } from "./papeis.js";

export function destinoAposEntrar(perfil) {
  return administra(perfil?.papel) ? "gerenciar/" : "minha-conta/";
}

export function pedidoDeEntrada(perfil, explicito) {
  const pedido = String(explicito || "").trim();
  const administrativo = /^(admin\.html|gerenciar\/?)$/.test(pedido);
  if (!pedido || (administrativo && !administra(perfil?.papel))) return destinoAposEntrar(perfil);
  return pedido;
}

function agruparPedidos(pedidos) {
  const mapa = new Map();
  pedidos.forEach((pedido) => {
    const chave = `${pedido.txid}::${pedido.usuario_id || pedido.perfis?.email || ""}`;
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { chave, valor: 0, itens: [] };
      mapa.set(chave, grupo);
    }
    grupo.itens.push(pedido);
    grupo.valor += Number(pedido.valor) || 0;
  });
  return [...mapa.values()].map((grupo) => ({
    valor: Math.round(grupo.valor * 100) / 100,
    status: grupo.itens.every((item) => item.status === "pago") ? "pago" : "aguardando",
  }));
}

export function textoAdministrativo(perfil) {
  const papel = perfil?.papel;
  const lugar = papel === "owner"
    ? "da proprietária"
    : papel === "super_admin"
      ? "de superadministração"
      : "de administração";
  const partes = ["As atividades", "os PDFs", "os pedidos"];
  if (podeFinanceiro(perfil)) partes.push("o financeiro");
  const ultima = partes.pop();
  return `Você está na conta ${lugar}. ${partes.join(", ")} e ${ultima} ficam à mão.`;
}

export function resumoAdministrativo({ perfil, atividades, pedidos }) {
  const atalhos = [
    { texto: "Atividades", hash: "atividades" },
    { texto: "Arquivos PDF", hash: "arquivos" },
    { texto: "Pedidos", hash: "pedidos" },
    ...(podeFinanceiro(perfil) ? [{ texto: "Financeiro", hash: "financeiro" }] : []),
  ];
  const base = {
    nome: perfil?.nome || "",
    cargo: rotuloPapel(perfil?.papel),
    texto: textoAdministrativo(perfil),
    atalhos,
    indicadores: null,
  };
  if (!Array.isArray(atividades) || !Array.isArray(pedidos)) return base;
  const grupos = agruparPedidos(pedidos);
  const pagos = grupos.filter((grupo) => grupo.status === "pago");
  const indicadores = [
    { rotulo: "Atividades", valor: String(atividades.length), nota: "Materiais cadastrados na loja" },
    {
      rotulo: "Arquivos PDF",
      valor: String(atividades.filter((item) => String(item.arquivo || "").trim()).length),
      nota: "PDFs apontados no catálogo",
    },
    { rotulo: "Pedidos", valor: String(grupos.length), nota: "Cada código de pedido conta uma vez" },
  ];
  if (podeFinanceiro(perfil)) {
    indicadores.push({
      rotulo: "Receita bruta",
      valor: Math.round(pagos.reduce((soma, grupo) => soma + grupo.valor, 0) * 100) / 100,
      nota: "Soma dos pedidos com pagamento confirmado",
      dinheiro: true,
    });
  }
  return { ...base, indicadores, semPedidos: grupos.length === 0 };
}
