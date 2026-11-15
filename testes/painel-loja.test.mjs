import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validarNovaAtividade } from "../js/cadastro-regras.js";

import { caminhoPdf } from "../js/arquivo-seguro.js";
import { LIMITE_CAPA, nomeCapa, urlComVersao, validarCapa } from "../js/capa-loja.js";
import { administra } from "../js/conta/papeis.js";
import { avisoCatalogo, camposDoCatalogo, decidirGravacao, fichaInicial, mensagemFuncaoAusente, payloadEdicao } from "../js/edicao-atividade.js";
import { opcoesConta } from "../js/menu-conta.js";
import {
  executarRestauracao,
  executarSubstituicao,
  LIMITE_PDF,
  nomeAnterior,
  nomeVersao,
  pdfAnteriorDisponivel,
  PDF_AINDA_NAO_INSTALADO,
  validarPdf,
} from "../js/pdf-troca.js";
import { criarTrava } from "../js/trava.js";

const banco = {
  id: "material-ficticio",
  titulo: "Atividade fictícia de teste",
  resumo: "Descrição já gravada no banco de dados.",
  explicacao: "Texto da página já gravado no banco, com mais de vinte letras.",
  preco: 4.9,
  uso: "AEE e sala regular",
  inclui: "Item gravado",
  habilidades: "Habilidade gravada",
  destaque: false,
  area: "",
  tema: "",
  capa: "",
  arquivo: "material-ficticio.pdf",
  informacoes: [],
};

const catalogo = {
  id: "material-ficticio",
  titulo: "Título só do catálogo",
  area: "Matemática",
  temas: ["Situações-Problema"],
  resumo: "Descrição que existe apenas no catálogo do site.",
  explicacao: "Texto longo que existe apenas no catálogo e não deve ser gravado sozinho.",
  preco: 9.9,
  inclui: ["Item do catálogo"],
  habilidades: ["Habilidade do catálogo"],
  capa: "img/capa-ficticia.png",
  download: "material-ficticio.pdf",
  informacoes: [
    ["Categoria", "Matemática"],
    ["Quantidade", "12 páginas"],
    ["Formato", "PDF para impressão"],
  ],
};

function formularioDe(ficha, mudancas = {}) {
  return {
    titulo: ficha.campos.titulo,
    resumo: ficha.campos.resumo,
    explicacao: ficha.campos.explicacao,
    preco: ficha.campos.preco,
    area: ficha.campos.area,
    tema: ficha.campos.tema,
    inclui: ficha.campos.inclui,
    habilidades: ficha.campos.habilidades,
    destaque: ficha.destaque,
    informacoes: { ...ficha.campos.informacoes },
    ...mudancas,
  };
}

const ficha = fichaInicial(banco, catalogo);
assert.equal(ficha.campos.titulo, banco.titulo);
assert.equal(ficha.campos.area, "Matemática");
assert.equal(ficha.origem.area, "catalogo");
assert.equal(ficha.campos.informacoes.Quantidade, "12 páginas");
assert.equal(ficha.capa, "img/capa-ficticia.png");
assert.equal(ficha.arquivo, "material-ficticio.pdf");
assert.ok(camposDoCatalogo(ficha).includes("área"));
assert.ok(camposDoCatalogo(ficha).includes("quantidade"));

const soTitulo = payloadEdicao(formularioDe(ficha, { titulo: "Título novo da atividade" }), ficha);
assert.equal(soTitulo.ok, true);
assert.equal(soTitulo.alterouTexto, true);
assert.equal(soTitulo.atividade.titulo, "Título novo da atividade");
assert.equal(soTitulo.atividade.resumo, banco.resumo);
assert.equal(soTitulo.atividade.explicacao, banco.explicacao);
assert.deepEqual(soTitulo.mudancas, { titulo: "Título novo da atividade" });
assert.equal(soTitulo.compativel, true);
assert.equal(soTitulo.atividade.preco, 4.9);
assert.equal(soTitulo.atividade.area, "");
assert.equal(soTitulo.atividade.tema, "");
assert.equal(soTitulo.atividade.uso, "AEE e sala regular");
assert.deepEqual(soTitulo.atividade.informacoes, []);
assert.equal(JSON.stringify(soTitulo.atividade).includes("12 páginas"), false);

const soPreco = payloadEdicao(formularioDe(ficha, { preco: "12.5" }), ficha);
assert.equal(soPreco.ok, true);
assert.equal(soPreco.atividade.preco, 12.5);
assert.equal(soPreco.atividade.titulo, banco.titulo);
assert.equal(soPreco.atividade.area, "");
assert.deepEqual(soPreco.mudancas, { preco: 12.5 });

const soResumo = payloadEdicao(formularioDe(ficha, { resumo: "Descrição nova, com mais de dez letras." }), ficha);
assert.equal(soResumo.ok, true);
assert.equal(soResumo.atividade.resumo, "Descrição nova, com mais de dez letras.");
assert.equal(soResumo.atividade.titulo, banco.titulo);
assert.equal(soResumo.atividade.preco, 4.9);
assert.deepEqual(Object.keys(soResumo.mudancas), ["resumo"]);

const intacto = payloadEdicao(formularioDe(ficha), ficha);
assert.equal(intacto.ok, true);
assert.equal(intacto.alterouTexto, false);
assert.equal(intacto.atividade.area, "");

const semTexto = fichaInicial({ ...banco, resumo: "", explicacao: "" }, catalogo);
const tituloComCatalogo = payloadEdicao(formularioDe(semTexto, { titulo: "Outro título válido" }), semTexto);
assert.equal(tituloComCatalogo.ok, true);
assert.equal(tituloComCatalogo.alterouTexto, true);
assert.deepEqual(tituloComCatalogo.mudancas, { titulo: "Outro título válido" });
assert.equal(tituloComCatalogo.atividade.resumo, "");
assert.equal(tituloComCatalogo.atividade.explicacao, "");
assert.equal(tituloComCatalogo.atividade.preco, 4.9);
assert.equal(tituloComCatalogo.atividade.area, "");
assert.deepEqual(tituloComCatalogo.atividade.informacoes, []);
assert.equal(tituloComCatalogo.compativel, false);
assert.equal(JSON.stringify(tituloComCatalogo.mudancas).includes("12 páginas"), false);

const precoComCatalogo = payloadEdicao(formularioDe(semTexto, { preco: "12.5" }), semTexto);
assert.equal(precoComCatalogo.ok, true);
assert.deepEqual(precoComCatalogo.mudancas, { preco: 12.5 });
assert.equal(precoComCatalogo.atividade.titulo, banco.titulo);
assert.equal(precoComCatalogo.atividade.resumo, "");
assert.equal(precoComCatalogo.atividade.area, "");

const semPreco = fichaInicial({ ...banco, preco: 0 }, catalogo);
const tituloComPrecoDoCatalogo = payloadEdicao(formularioDe(semPreco, { titulo: "Outro título válido" }), semPreco);
assert.equal(tituloComPrecoDoCatalogo.ok, true);
assert.equal(tituloComPrecoDoCatalogo.atividade.preco, 0);
assert.equal(tituloComPrecoDoCatalogo.mudancas.preco, undefined);
assert.equal(tituloComPrecoDoCatalogo.atividade.resumo, banco.resumo);

const semMudanca = payloadEdicao(formularioDe(semTexto), semTexto);
assert.equal(semMudanca.ok, true);
assert.equal(semMudanca.alterouTexto, false);
assert.deepEqual(semMudanca.mudancas, {});

const antes = { titulo: banco.titulo, resumo: "", explicacao: "", area: "", informacoes: [] };
const falha = { ...antes };
try {
  if (!tituloComCatalogo.compativel) throw new Error("recusado");
  Object.assign(falha, tituloComCatalogo.mudancas);
} catch {
  // A gravação recusada não altera o registro.
}
assert.equal(falha.titulo, antes.titulo);
assert.equal(falha.resumo, "");
assert.deepEqual(falha.informacoes, []);

assert.match(avisoCatalogo(semTexto), /descrição breve/);
assert.match(avisoCatalogo(semTexto), /não grava/);
assert.equal(avisoCatalogo(ficha).includes("descrição breve"), false);

const areaEditada = payloadEdicao(formularioDe(ficha, { area: "Ciências", tema: "Células" }), ficha);
assert.equal(areaEditada.atividade.area, "Ciências");
assert.equal(areaEditada.atividade.tema, "Células");

const pdfOriginal = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]);
const pdfNovo = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 2]);
assert.equal(validarPdf({ nome: "novo.pdf", tipo: "application/pdf", tamanho: pdfNovo.length, bytes: pdfNovo }).ok, true);
assert.equal(validarPdf({ nome: "novo.png", tipo: "application/pdf", tamanho: 10, bytes: pdfNovo }).ok, false);
assert.equal(validarPdf({ nome: "novo.pdf", tipo: "image/png", tamanho: 10, bytes: pdfNovo }).ok, false);
assert.equal(validarPdf({ nome: "novo.pdf", tipo: "application/pdf", tamanho: LIMITE_PDF + 1, bytes: pdfNovo }).ok, false);
assert.equal(validarPdf({ nome: "novo.pdf", tipo: "application/pdf", tamanho: 10, bytes: new Uint8Array([1, 2, 3, 4, 5]) }).ok, false);
assert.equal(pdfAnteriorDisponivel(["material-ficticio.pdf", "versao-10.pdf"], "versao-10.pdf"), "material-ficticio.pdf");
assert.equal(pdfAnteriorDisponivel(["material-ficticio.pdf", "versao-10.pdf", "versao-20.pdf"], "versao-20.pdf", "versao-10.pdf"), "versao-10.pdf");
assert.equal(pdfAnteriorDisponivel(["material-ficticio.pdf", "material-ficticio-anterior-10.pdf"], "material-ficticio.pdf"), "material-ficticio-anterior-10.pdf");
assert.equal(pdfAnteriorDisponivel(["somente-outra.pdf"], "versao-20.pdf", "versao-10.pdf"), "");
assert.match(PDF_AINDA_NAO_INSTALADO, /ainda não está instalada/);
assert.equal(caminhoPdf("material-ficticio", nomeVersao(10)), "material-ficticio/versao-10.pdf");
assert.equal(caminhoPdf("material-ficticio", nomeAnterior("material-ficticio.pdf", 10)).includes("/"), true);
assert.equal(nomeAnterior("material-ficticio.pdf", 10).includes("/"), false);

function memoria(inicial) {
  const objetos = new Map(Object.entries(inicial));
  const chamadas = [];
  return {
    objetos,
    chamadas,
    async baixar(caminho) {
      chamadas.push(["baixar", caminho]);
      if (!objetos.has(caminho)) throw new Error("ausente");
      return objetos.get(caminho);
    },
    async enviar(caminho, bytes, opcoes) {
      chamadas.push(["enviar", caminho, Boolean(opcoes?.upsert)]);
      if (objetos.has(caminho) && !opcoes?.upsert) throw new Error("existe");
      if (String(caminho).endsWith("falha.pdf")) throw new Error("falha");
      objetos.set(caminho, bytes);
    },
  };
}

const basePdf = {
  atividadeId: "material-ficticio",
  arquivoAtual: "material-ficticio.pdf",
  nome: "novo.pdf",
  tipo: "application/pdf",
  tamanho: pdfNovo.length,
  bytes: pdfNovo,
  instante: 10,
};

const falhaCopia = memoria({});
const semCopia = await executarSubstituicao({
  storage: falhaCopia,
  ...basePdf,
  existeAtual: true,
});
assert.equal(semCopia.ok, false);
assert.equal(falhaCopia.chamadas.some((chamada) => chamada[0] === "enviar" && chamada[2] === true), false);

const guardado = memoria({ "material-ficticio/material-ficticio.pdf": pdfOriginal });
guardado.enviar = async (caminho, bytes, opcoes) => {
  guardado.chamadas.push(["enviar", caminho, Boolean(opcoes?.upsert)]);
  if (caminho === "material-ficticio/material-ficticio.pdf") throw new Error("falha");
  guardado.objetos.set(caminho, bytes);
};
const falhaTroca = await executarSubstituicao({ storage: guardado, ...basePdf, existeAtual: true });
assert.equal(falhaTroca.ok, false);
assert.equal(guardado.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);
assert.equal(guardado.objetos.get("material-ficticio/material-ficticio-anterior-10.pdf"), pdfOriginal);

const troca = memoria({ "material-ficticio/material-ficticio.pdf": pdfOriginal });
const trocou = await executarSubstituicao({ storage: troca, ...basePdf, existeAtual: true });
assert.equal(trocou.ok, true);
assert.equal(trocou.arquivo, "material-ficticio.pdf");
assert.equal(troca.objetos.get("material-ficticio/material-ficticio.pdf"), pdfNovo);
assert.equal(troca.objetos.get("material-ficticio/material-ficticio-anterior-10.pdf"), pdfOriginal);
const restaurado = await executarRestauracao({
  storage: troca,
  atividadeId: "material-ficticio",
  arquivoAtual: "material-ficticio.pdf",
  nomeAnteriorArquivo: trocou.anterior,
});
assert.equal(restaurado.ok, true);
assert.equal(troca.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);

let apontou = "";
const versao = memoria({ "material-ficticio/material-ficticio.pdf": pdfOriginal });
const apontada = await executarSubstituicao({
  storage: versao,
  ...basePdf,
  existeAtual: true,
  definirArquivo: async (nome) => {
    apontou = nome;
    return { ok: true };
  },
});
assert.equal(apontada.ok, true);
assert.equal(apontou, "versao-10.pdf");
assert.equal(versao.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);
assert.equal(versao.objetos.get("material-ficticio/versao-10.pdf"), pdfNovo);
const voltou = await executarRestauracao({
  storage: versao,
  atividadeId: "material-ficticio",
  arquivoAtual: "versao-10.pdf",
  nomeAnteriorArquivo: apontada.anterior,
  definirArquivo: async (nome) => {
    apontou = nome;
    return { ok: true };
  },
});
assert.equal(voltou.arquivo, "material-ficticio.pdf");
assert.equal(versao.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);

const quebrada = memoria({ "material-ficticio/material-ficticio.pdf": pdfOriginal });
const semReferencia = await executarSubstituicao({
  storage: quebrada,
  ...basePdf,
  definirArquivo: async () => ({ ok: false }),
});
assert.equal(semReferencia.ok, false);
assert.equal(semReferencia.arquivo, "material-ficticio.pdf");
assert.equal(quebrada.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);

const envioQuebrado = memoria({ "material-ficticio/material-ficticio.pdf": pdfOriginal });
envioQuebrado.enviar = async () => {
  throw new Error("falha");
};
let apontouEnvio = false;
const semEnvio = await executarSubstituicao({
  storage: envioQuebrado,
  ...basePdf,
  definirArquivo: async () => {
    apontouEnvio = true;
    return { ok: true };
  },
});
assert.equal(semEnvio.ok, false);
assert.equal(apontouEnvio, false);
assert.equal(semEnvio.arquivo, "material-ficticio.pdf");
assert.equal(envioQuebrado.objetos.get("material-ficticio/material-ficticio.pdf"), pdfOriginal);

const trava = criarTrava();
assert.equal(trava.entrar(), true);
assert.equal(trava.entrar(), false);
trava.sair();
assert.equal(trava.entrar(), true);

assert.deepEqual(opcoesConta({ logado: true, administraLoja: true }), ["Minha conta", "Gerenciar loja", "Sair"]);
assert.deepEqual(opcoesConta({ logado: true, administraLoja: false }), ["Minha conta", "Sair"]);
assert.deepEqual(opcoesConta({ logado: false, administraLoja: false }), ["Entrar"]);
assert.equal(administra("cliente"), false);
assert.equal(administra("owner"), true);
assert.equal(administra("admin"), true);

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
assert.equal(validarCapa({ tipo: "image/jpeg", tamanho: jpeg.length, bytes: jpeg }).ok, true);
assert.equal(validarCapa({ tipo: "image/png", tamanho: jpeg.length, bytes: jpeg }).ok, false);
assert.equal(validarCapa({ tipo: "image/jpeg", tamanho: LIMITE_CAPA + 1, bytes: jpeg }).ok, false);
assert.equal(nomeCapa("material-ficticio", "jpg", 15), "material-ficticio-15.jpg");
assert.equal(urlComVersao("https://exemplo.supabase.co/capa.jpg", 15), "https://exemplo.supabase.co/capa.jpg?v=15");
assert.equal(urlComVersao("https://exemplo.supabase.co/capa.jpg?v=1", 15), "https://exemplo.supabase.co/capa.jpg?v=15");

const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
const baixar = sessao.slice(sessao.indexOf("async baixar"), sessao.indexOf("async painel"));
assert.equal(baixar.includes("link-download"), true);
assert.equal(baixar.includes("createSignedUrl"), false);
const trocaPdf = sessao.slice(sessao.indexOf("async substituirPdf"), sessao.indexOf("async restaurarPdf"));
const avisoTroca = trocaPdf.indexOf("PDF_AINDA_NAO_INSTALADO");
const gravacaoTroca = trocaPdf.indexOf("executarSubstituicao");
assert.ok(avisoTroca > -1 && avisoTroca < gravacaoTroca);
assert.equal(trocaPdf.includes("upsert: true"), false);
assert.match(trocaPdf, /definir_arquivo/);
const restaurarPdf = sessao.slice(sessao.indexOf("async restaurarPdf"), sessao.indexOf("api.trocasPdf = new Set()"));
assert.ok(restaurarPdf.indexOf("PDF_AINDA_NAO_INSTALADO") < restaurarPdf.indexOf("executarRestauracao"));
assert.equal(restaurarPdf.includes("upsert: true"), false);
const adminJs = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
assert.match(adminJs, /Restaurar anterior/);
assert.match(adminJs, /substituirPdf/);
assert.equal(adminJs.includes("upsert: true"), false);
assert.equal(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8").includes("cobrancaAutomatica: false"), true);

const sql = readFileSync(new URL("../supabase/migracao-arquivo.sql", import.meta.url), "utf8");
assert.match(sql, /NÃO rode este arquivo agora/);
assert.match(sql, /sou_admin\(\)/);
assert.match(sql, /arquivo = nome/);
assert.match(sql, /arquivo_anterior/);
assert.match(sql, /grant execute on function public\.definir_arquivo\(text, text\) to authenticated/);
assert.match(sql, /storage\.objects/);
assert.match(sql, /notify pgrst, 'reload schema'/);
assert.doesNotMatch(sql, /delete from storage|drop policy|drop table/i);
assert.equal((sql.match(/update public\.atividades/g) || []).length, 1);

const parcial = readFileSync(new URL("../supabase/migracao-edicao-parcial.sql", import.meta.url), "utf8");
assert.match(parcial, /NÃO rode este arquivo agora/);
assert.match(parcial, /editar_campos\(atividade_id text, campos jsonb\)/);
assert.match(parcial, /when campos \? 'titulo'/);
assert.doesNotMatch(parcial, /delete from|drop table|function public\.editar_atividade/i);
assert.doesNotMatch(parcial.split("update public.atividades")[1] || "", /arquivo|capa/);
assert.match(sessao, /rpc\("editar_campos"/);
const erroCampos = "Could not find the function public.editar_campos(atividade_id, campos) in the schema cache";
const erroAntiga = "Could not find the function public.editar_atividade(atividade_id, atividade_titulo) in the schema cache";
assert.match(erroCampos, /could not find the function|schema cache|does not exist/i);
assert.equal(
  /[áàâãéêíóôõúç]/i.test(erroAntiga) ? erroAntiga : "Não foi possível agora. Tente de novo.",
  "Não foi possível agora. Tente de novo.",
);
const soTituloGravar = decidirGravacao(tituloComCatalogo);
assert.equal(soTituloGravar.acao, "editar_campos");
assert.deepEqual(soTituloGravar.campos, { titulo: "Outro título válido" });
assert.equal(Object.hasOwn(soTituloGravar.campos, "resumo"), false);
const soPrecoGravar = decidirGravacao(precoComCatalogo);
assert.deepEqual(soPrecoGravar.campos, { preco: 12.5 });
const soResumoGravar = decidirGravacao(soResumo);
assert.deepEqual(Object.keys(soResumoGravar.campos), ["resumo"]);
const semGravar = decidirGravacao(semMudanca);
assert.equal(semGravar.acao, "parar");
assert.equal(semGravar.mensagem, "Nenhuma alteração para salvar");
assert.equal(semGravar.campos, undefined);
assert.match(mensagemFuncaoAusente(), /Nada foi alterado/);
const blocoSalvar = readFileSync(new URL("../js/conta/cadastro.js", import.meta.url), "utf8");
const salvarEdicao = blocoSalvar.slice(blocoSalvar.indexOf("async function salvarEdicao"), blocoSalvar.indexOf("export function prepararCadastro"));
assert.equal(salvarEdicao.includes("editarAtividade"), false);
const reverter = readFileSync(new URL("../supabase/reverter-edicao-parcial.sql", import.meta.url), "utf8");
assert.match(reverter, /NÃO rode este arquivo agora/);
assert.match(reverter, /drop function if exists public\.editar_campos\(text, jsonb\)/);
assert.doesNotMatch(reverter.replace(/--.*$/gm, ""), /editar_atividade|delete from|drop table|update public/i);

const download = readFileSync(new URL("../supabase/functions/link-download/index.ts", import.meta.url), "utf8");
assert.match(download, /pode_baixar/);
assert.match(download, /createSignedUrl\(`\$\{atividade\}\/\$\{nome\}`, 120\)/);

const novaCompleta = {
  titulo: "Atividade fictícia completa",
  resumo: "Descrição breve com mais de dez letras.",
  explicacao: "Texto da página com mais de vinte letras.",
  preco: 8,
  area: "Ciências",
  tema: "Células",
  temasDaArea: ["Células"],
  capa: true,
  tipoCapa: "image/png",
  quantidade: "2 páginas",
  formato: "PDF para impressão",
};
assert.equal(validarNovaAtividade(novaCompleta), "");
assert.match(validarNovaAtividade({ ...novaCompleta, titulo: "A" }), /atividade/);
assert.match(validarNovaAtividade({ ...novaCompleta, capa: false }), /capa/);
assert.match(validarNovaAtividade({ ...novaCompleta, resumo: "curta" }), /descrição/);
assert.match(validarNovaAtividade({ ...novaCompleta, quantidade: "" }), /quantidade/);
assert.match(validarNovaAtividade({ ...novaCompleta, formato: "" }), /formato/);

const adminHtml = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
assert.match(adminHtml, /Substituir PDF/);
assert.match(adminHtml, /id="pdf-troca-confirmar"/);
const criarHtml = adminHtml.slice(adminHtml.indexOf('id="nova-atividade"'), adminHtml.indexOf('id="ficha-edicao"'));
const editarHtml = adminHtml.slice(adminHtml.indexOf('id="ficha-edicao"'), adminHtml.indexOf('data-painel="arquivos"'));
assert.match(criarHtml, /Continuar/);
assert.match(criarHtml, /data-passo="4"/);
assert.equal(editarHtml.includes("Continuar"), false);
assert.equal(editarHtml.includes("data-passo"), false);
assert.match(editarHtml, /Salvar alterações/);
assert.match(editarHtml, /Cancelar/);

console.log("ok painel da loja");
