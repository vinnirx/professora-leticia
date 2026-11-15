const status = document.querySelector("#diagnostico-status");
const detalhe = document.querySelector("#diagnostico-detalhe");
const entrada = document.querySelector("#diagnostico-entrar");

function escrever(texto) {
  if (status) status.textContent = texto;
}

const loja = await window.contaPronta;
if (!loja?.diagnosticarSessao) {
  escrever("Falha. A verificação ainda não está nesta página.");
} else {
  const resultado = await loja.diagnosticarSessao();
  const nivel = /^aal[12]$/.test(resultado.nivel || "") ? resultado.nivel : "";
  if (!resultado.autenticado) {
    escrever("Falha. Nenhuma sessão nesta janela.");
    if (entrada) entrada.hidden = false;
  } else if (resultado.ativa === true) {
    escrever("Sucesso. A sessão foi aceita.");
  } else if (resultado.ativa === false) {
    escrever("Falha. A sessão não foi aceita.");
  } else {
    escrever(`Falha. ${resultado.mensagem || "A chamada foi recusada."}`);
  }
  if (detalhe) detalhe.textContent = nivel ? `Nível: ${nivel}` : "Nível: não informado.";
}
