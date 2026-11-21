import { administra, rotuloPapel } from "./papeis.js";
import { aviso, quando } from "./avisos.js";

function coroa() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("coroa");
  const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
  caminho.setAttribute("fill", "currentColor");
  caminho.setAttribute("d", "M3 17.5 5.2 8.2 9.2 12.4 12 6.5l2.8 5.9 4-4.2L21 17.5H3Zm1.4 1.5h15.2l-.6 2.2H5l-.6-2.2Z");
  svg.append(caminho);
  return svg;
}

export function membrosDaEquipe(contas) {
  const ordem = { owner: 0, super_admin: 1, admin: 2 };
  return (contas || [])
    .filter((conta) => administra(conta?.papel))
    .sort((a, b) => (ordem[a.papel] ?? 9) - (ordem[b.papel] ?? 9) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

export function textoDoMembro(conta) {
  if (conta?.papel === "owner") {
    return "Responsável principal pela loja. Perfil protegido. Não pode ser excluída, removida ou rebaixada.";
  }
  if (conta?.papel === "super_admin") {
    return "Responsável pela administração da loja. Não altera a proprietária.";
  }
  return "Responsável por atividades administrativas.";
}

export function textoDoFinanceiro(conta) {
  if (!conta || conta.papel === "owner" || conta.papel === "super_admin") return "";
  if (conta.acesso_financeiro === true) return "Acesso financeiro registrado. A consulta financeira permanece protegida nesta versão.";
  if (conta.acesso_financeiro === false) return "Sem acesso financeiro registrado.";
  return "Acesso financeiro não disponível nesta consulta.";
}

export function acoesDoMembro(viewer, conta) {
  if (!viewer || !conta || !administra(conta.papel) || conta.papel === "owner") return [];
  if (viewer.papel !== "owner" && viewer.papel !== "super_admin") return [];
  const dona = viewer.papel === "owner";
  const superAdmin = viewer.papel === "super_admin";
  const acoes = [];
  if ((dona || superAdmin) && conta.papel === "admin") acoes.push("voltar-cliente", "financeiro");
  if (dona && conta.papel === "admin") acoes.push("tornar-super");
  if (dona && conta.papel === "super_admin") acoes.push("revogar-super", "voltar-cliente");
  return acoes;
}

export function acoesVisiveis() {
  return [];
}

export function estadoDoHistorico(resultado) {
  if (!resultado) return { tipo: "oculto", texto: "" };
  if (resultado.ok) {
    return resultado.linhas?.length
      ? { tipo: "lista", texto: "" }
      : { tipo: "vazio", texto: "Nenhuma alteração de permissão registrada." };
  }
  const mensagem = String(resultado.mensagem || "");
  if (/segundo fator/i.test(mensagem) || mensagem === "Não foi possível agora. Tente de novo.") {
    return { tipo: "protegido", texto: "O histórico de permissões permanece protegido nesta versão. A lista da equipe continua visível." };
  }
  if (/Sem permissão/i.test(mensagem)) {
    return { tipo: "restrito", texto: "O histórico de permissões fica restrito à proprietária." };
  }
  if (/não está mais ativa/i.test(mensagem)) return { tipo: "erro", texto: mensagem };
  return { tipo: "erro", texto: "Não consegui ler o histórico de permissões. A lista da equipe continua visível." };
}
function selo(conta) {
  const marca = document.createElement("span");
  marca.className = `selo-papel selo-${conta.papel || "cliente"}`;
  if (conta.papel === "owner") marca.append(coroa());
  marca.append(document.createTextNode(rotuloPapel(conta.papel)));
  return marca;
}

function botao(texto, aoClicar, extra) {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.className = `botao botao-secundario${extra ? ` ${extra}` : ""}`;
  elemento.textContent = texto;
  elemento.addEventListener("click", aoClicar);
  return elemento;
}

export function prepararEquipe(loja, memoria, dados, aoMudar) {
  const avisoEquipe = document.querySelector("#equipe-aviso");
  const reauth = document.querySelector("#reauth-super");
  const texto = document.querySelector("#reauth-texto");
  const senha = document.querySelector("#reauth-senha");
  const confirma = document.querySelector("#reauth-confirma");
  let pendente = null;

  function nomeDe(id) {
    return memoria.contas.find((conta) => conta.id === id)?.nome || "Conta";
  }

  function fecharReauth() {
    pendente = null;
    senha.value = "";
    confirma.checked = false;
    reauth.hidden = true;
  }

  function abrirReauth(conta, novo, explicacao) {
    pendente = { id: conta.id, novo };
    texto.textContent = `${conta.nome} está como ${rotuloPapel(conta.papel)}. ${explicacao}`;
    confirma.checked = false;
    senha.value = "";
    reauth.hidden = false;
    senha.focus();
  }

  async function aplicar(alvo, novo, financeiro) {
    const resultado = financeiro === undefined
      ? await loja.definirPapel(alvo, novo)
      : await loja.definirFinanceiro(alvo, financeiro);
    if (!resultado.ok) {
      aviso(avisoEquipe, resultado.mensagem);
      return;
    }
    const conta = memoria.contas.find((item) => item.id === alvo);
    if (conta && financeiro === undefined) {
      conta.papel = novo;
      conta.acesso_financeiro = novo === "super_admin";
    }
    if (conta && financeiro !== undefined) conta.acesso_financeiro = financeiro;
    aviso(avisoEquipe, "Permissão atualizada.", true);
    fecharReauth();
    pintar();
    if (aoMudar) aoMudar();
  }

  document.querySelector("#reauth-cancelar").addEventListener("click", fecharReauth);
  document.querySelector("#reauth-confirmar").addEventListener("click", async () => {
    if (!pendente) return;
    if (!confirma.checked) {
      aviso(avisoEquipe, "Marque a confirmação antes de continuar.");
      return;
    }
    const valor = senha.value;
    senha.value = "";
    if (valor.length < 8) {
      aviso(avisoEquipe, "Digite a senha da proprietária.");
      return;
    }
    const entrada = await loja.entrar({ email: dados.email, senha: valor });
    if (!entrada.ok) {
      aviso(avisoEquipe, entrada.mensagem);
      return;
    }
    await aplicar(pendente.id, pendente.novo);
  });

  async function pintar() {
    const lista = document.querySelector("#lista-equipe");
    const dona = dados.papel === "owner";
    let registros = null;
    if (dona && loja.historicoPermissoes) registros = await loja.historicoPermissoes();
    const linhas = registros?.ok && Array.isArray(registros.linhas) ? registros.linhas : [];
    const concessoes = new Map();
    linhas.forEach((linha) => {
      if (linha.resultado === "sucesso" && !concessoes.has(linha.afetado)) concessoes.set(linha.afetado, linha);
    });
    const membros = membrosDaEquipe(memoria.contas);
    lista.replaceChildren();
    if (!membros.length) {
      const vazioEquipe = document.createElement("p");
      vazioEquipe.className = "texto-secao";
      vazioEquipe.textContent = "Nenhum membro interno encontrado.";
      lista.append(vazioEquipe);
    }
    membros.forEach((conta) => {
      const artigo = document.createElement("article");
      artigo.className = "item-equipe";
      const topo = document.createElement("div");
      topo.className = "equipe-topo";
      const nome = document.createElement("strong");
      nome.textContent = conta.nome || "Sem nome";
      topo.append(selo(conta), nome);
      const email = document.createElement("p");
      email.textContent = conta.email || "";
      const descricao = document.createElement("p");
      descricao.className = "texto-secao";
      descricao.textContent = textoDoMembro(conta);
      artigo.append(topo, email, descricao);
      const financeiroTexto = textoDoFinanceiro(conta);
      if (financeiroTexto) {
        const financeiro = document.createElement("p");
        financeiro.className = "texto-secao";
        financeiro.textContent = financeiroTexto;
        artigo.append(financeiro);
      }
      const concessao = concessoes.get(conta.id);
      if (dona && concessao && conta.papel !== "owner") {
        const quandoMudou = document.createElement("p");
        quandoMudou.className = "equipe-protegida";
        quandoMudou.textContent = `Alterado por ${nomeDe(concessao.executado_por)} em ${quando.format(new Date(concessao.criado_em))}.`;
        artigo.append(quandoMudou);
      }
      const previstas = acoesVisiveis();
      if (previstas.length) {
        const acoes = document.createElement("div");
        acoes.className = "acoes";
        if (previstas.includes("voltar-cliente") && conta.papel === "admin") {
          acoes.append(botao("Voltar a cliente", () => {
            if (!window.confirm(`Remover o acesso administrativo de ${conta.nome}?`)) return;
            aplicar(conta.id, "cliente");
          }, "botao-perigo"));
        }
        if (previstas.includes("tornar-super")) {
          acoes.append(botao("Tornar Super Admin", () => abrirReauth(
            conta,
            "super_admin",
            "Como Super Admin, essa pessoa cuida da loja e pode tornar alguém administrador comum. Não pode criar outro Super Admin nem alterar a proprietária.",
          )));
        }
        if (previstas.includes("revogar-super")) {
          acoes.append(botao("Revogar Super Admin", () => abrirReauth(
            conta,
            "admin",
            "O Super Admin sai. A pessoa fica como administrador comum, sem o financeiro, até você liberar de novo.",
          ), "botao-perigo"));
        }
        if (previstas.includes("voltar-cliente") && conta.papel === "super_admin") {
          acoes.append(botao("Voltar a cliente", () => abrirReauth(
            conta,
            "cliente",
            "O acesso ao painel sai junto com o Super Admin.",
          ), "botao-perigo"));
        }
        if (previstas.includes("financeiro")) {
          const financeiro = document.createElement("label");
          financeiro.className = "marca-destaque";
          const caixa = document.createElement("input");
          caixa.type = "checkbox";
          caixa.checked = conta.acesso_financeiro === true;
          caixa.addEventListener("change", async () => {
            const ligado = caixa.checked;
            caixa.disabled = true;
            const resultado = await loja.definirFinanceiro(conta.id, ligado);
            caixa.disabled = false;
            if (!resultado.ok) {
              caixa.checked = !ligado;
              aviso(avisoEquipe, resultado.mensagem);
              return;
            }
            conta.acesso_financeiro = ligado;
            aviso(avisoEquipe, ligado ? "Financeiro liberado." : "Financeiro retirado.", true);
            if (aoMudar) aoMudar();
          });
          financeiro.append(caixa, document.createTextNode("Pode ver o financeiro"));
          acoes.append(financeiro);
        }
        artigo.append(acoes);
      } else if (conta.papel === "super_admin" && dados.papel === "super_admin") {
        const nota = document.createElement("p");
        nota.className = "equipe-protegida";
        nota.textContent = "Só a proprietária altera este cargo.";
        artigo.append(nota);
      }
      lista.append(artigo);
    });

    const titulo = document.querySelector("#titulo-auditoria");
    const historico = document.querySelector("#lista-auditoria");
    if (!dona) {
      titulo.hidden = true;
      historico.replaceChildren();
      return;
    }
    titulo.hidden = false;
    const estado = estadoDoHistorico(registros);
    if (estado.tipo !== "lista") {
      historico.replaceChildren();
      const avisoHistorico = document.createElement("p");
      avisoHistorico.className = "texto-secao";
      avisoHistorico.textContent = estado.texto;
      historico.append(avisoHistorico);
      return;
    }
    const tabela = document.createElement("div");
    tabela.className = "tabela-rolagem";
    const grade = document.createElement("table");
    grade.className = "tabela-admin";
    const cabeca = document.createElement("tr");
    ["Quando", "Quem fez", "Quem recebeu", "De", "Para", "Resultado"].forEach((rotulo) => {
      const th = document.createElement("th");
      th.textContent = rotulo;
      cabeca.append(th);
    });
    const corpo = document.createElement("tbody");
    linhas.forEach((linha) => {
      const tr = document.createElement("tr");
      [quando.format(new Date(linha.criado_em)), nomeDe(linha.executado_por), nomeDe(linha.afetado), rotuloPapel(linha.papel_anterior), linha.operacao === "definir_financeiro" ? (linha.detalhe || "Financeiro") : rotuloPapel(linha.papel_novo), linha.resultado === "sucesso" ? "Confirmado" : `Negado. ${linha.detalhe || ""}`.trim()]
        .forEach((valor, indice) => {
          const td = document.createElement("td");
          td.dataset.rotulo = ["Quando", "Quem fez", "Quem recebeu", "De", "Para", "Resultado"][indice];
          td.textContent = valor;
          tr.append(td);
        });
      corpo.append(tr);
    });
    const thead = document.createElement("thead");
    thead.append(cabeca);
    grade.append(thead, corpo);
    tabela.append(grade);
    historico.replaceChildren(tabela);
  }

  return pintar;
}
