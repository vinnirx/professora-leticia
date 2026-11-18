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
  const ultima = partes.pop();
  return `Você está na conta ${lugar}. ${partes.join(", ")} e ${ultima} ficam à mão.`;
}

export function resumoAdministrativo({ perfil, atividades, pedidos }) {
  const atalhos = [
    { texto: "Atividades", hash: "atividades" },
    { texto: "Arquivos PDF", hash: "arquivos" },
    { texto: "Pedidos", hash: "pedidos" },
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

export function leituraAdministrativa(nivel, papel) {
  if (papel !== "owner" && papel !== "super_admin" && papel !== "admin") return "ok";
  if (!nivel) return "ok";
  if (!nivel.ok) return "erro";
  if (nivel.atual !== "aal2") return "permissao";
  return "ok";
}

export function textoDaLista({ area, total, visiveis, leitura }) {
  const financeiro = area === "financeiro";
  if (leitura === "erro") {
    return financeiro
      ? { titulo: "Não consegui consultar o financeiro.", detalhe: "Este aviso não é um total zero. Tente de novo." }
      : { titulo: "Não consegui consultar os pedidos.", detalhe: "Este aviso não é uma lista vazia. Tente de novo." };
  }
  if (leitura === "permissao") {
    return {
      titulo: "A sessão ainda não tem permissão para ver o histórico da loja.",
      detalhe: "Abra Configurações, cadastre o segundo fator e entre de novo com o código. A tela não representa a loja vazia.",
    };
  }
  if (!total) {
    return financeiro
      ? { titulo: "Nenhuma venda cadastrada.", detalhe: "Quando um pagamento for confirmado, a receita aparece aqui." }
      : { titulo: "Nenhum pedido cadastrado.", detalhe: "Quando alguém comprar, o pedido aparece aqui." };
  }
  if (!visiveis) {
    return financeiro
      ? { titulo: "Nenhuma venda no período selecionado.", detalhe: "Amplie as datas para consultar registros anteriores. O zero deste intervalo não apaga o histórico." }
      : { titulo: "Nenhum pedido encontrado no período selecionado.", detalhe: "Limpe a busca, mude a situação ou amplie as datas." };
  }
  return null;
}

export function textoDasContas({ leitura, total, consulta }) {
  if (leitura === "erro" || consulta === "erro") {
    return {
      tipo: "erro",
      titulo: "Não consegui consultar as contas.",
      detalhe: "Este aviso não é uma lista vazia. Tente de novo.",
    };
  }
  if (leitura === "permissao" || consulta === "parcial") {
    return {
      tipo: "parcial",
      titulo: "As outras contas ficam ocultas até o segundo fator.",
      detalhe: "Em Configurações, cadastre o autenticador no celular e entre de novo com o código.",
      destino: "configuracoes",
    };
  }
  if (!total) {
    return {
      tipo: "vazio",
      titulo: "Nenhuma conta cadastrada.",
      detalhe: "Quando alguém criar uma conta, ela aparece aqui.",
    };
  }
  return null;
}
