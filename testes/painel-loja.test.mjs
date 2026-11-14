import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { caminhoPdf } from "../js/arquivo-seguro.js";
import { LIMITE_CAPA, nomeCapa, urlComVersao, validarCapa } from "../js/capa-loja.js";
import { administra } from "../js/conta/papeis.js";
import { camposDoCatalogo, fichaInicial, payloadEdicao } from "../js/edicao-atividade.js";
import { opcoesConta } from "../js/menu-conta.js";
import {
  executarRestauracao,
  executarSubstituicao,
  LIMITE_PDF,
  nomeAnterior,
  nomeVersao,
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

const intacto = payloadEdicao(formularioDe(ficha), ficha);
assert.equal(intacto.ok, true);
assert.equal(intacto.alterouTexto, false);
assert.equal(intacto.atividade.area, "");

const semResumo = fichaInicial({ ...banco, resumo: "" }, catalogo);
const bloqueado = payloadEdicao(formularioDe(semResumo, { titulo: "Outro título válido" }), semResumo);
assert.equal(bloqueado.ok, false);
assert.match(bloqueado.mensagem, /descrição breve/);
assert.equal(bloqueado.atividade, undefined);

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
assert.equal(readFileSync(new URL("../js/loja.js", import.meta.url), "utf8").includes("cobrancaAutomatica: false"), true);

const sql = readFileSync(new URL("../supabase/migracao-arquivo.sql", import.meta.url), "utf8");
assert.match(sql, /NÃO rode este arquivo agora/);
assert.match(sql, /sou_admin\(\)/);
assert.match(sql, /set arquivo = nome/);
assert.match(sql, /grant execute on function public\.definir_arquivo\(text, text\) to authenticated/);
assert.doesNotMatch(sql, /delete from storage|drop policy|drop table/i);
assert.equal((sql.match(/update public\.atividades/g) || []).length, 1);

const download = readFileSync(new URL("../supabase/functions/link-download/index.ts", import.meta.url), "utf8");
assert.match(download, /pode_baixar/);
assert.match(download, /createSignedUrl\(`\$\{atividade\}\/\$\{nome\}`, 120\)/);

console.log("ok painel da loja");
