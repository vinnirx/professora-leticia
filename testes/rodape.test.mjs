import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paginas = [
  ["index.html", ""],
  ["atividade.html", ""],
  ["atividades/index.html", "../"],
  ["ajuda/index.html", "../"],
  ["termos/index.html", "../"],
  ["privacidade/index.html", "../"],
  ["reembolso/index.html", "../"],
  ["entrar/index.html", "../"],
  ["criar-conta/index.html", "../"],
  ["recuperar-senha/index.html", "../"],
  ["minha-conta/index.html", "../"],
  ["gerenciar/index.html", "../"],
  ["manual/index.html", "../"],
  ["diagnostico-sessao/index.html", "../"],
];

const links = [
  ["ajuda/", "Ajuda"],
  ["reembolso/", "Cancelamento e reembolso"],
  ["termos/", "Termos de uso"],
  ["privacidade/", "Privacidade"],
];

const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
const rodape = css.match(/\.rodape \{[^}]+\}/)?.[0] || "";
const menu = css.match(/\.rodape-links \{[^}]+\}/)?.[0] || "";
const texto = css.match(/\.rodape p \{[^}]+\}/)?.[0] || "";
assert.match(rodape, /align-items:\s*center/);
assert.match(rodape, /text-align:\s*center/);
assert.match(rodape, /margin:\s*2\.4rem auto 0/);
assert.match(menu, /justify-content:\s*center/);
assert.match(menu, /flex-wrap:\s*wrap/);
assert.match(texto, /text-align:\s*center/);

paginas.forEach(([pagina, prefixo]) => {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.match(html, /styles\.css\?v=(89|90|91|92|93|94|95|96|97|98)/);
  assert.equal((html.match(/<footer class="rodape">/g) || []).length, 1);
  links.forEach(([destino, rotulo]) => {
    assert.match(html, new RegExp(`href="${prefixo}${destino}">${rotulo}</a>`));
  });
  const rodapeHtml = html.slice(html.indexOf('<footer class="rodape">'));
  if (pagina === "ajuda/index.html") {
    assert.match(rodapeHtml, /mailto:leticiapimenteldemacedo@gmail\.com/);
    assert.doesNotMatch(rodapeHtml, /CPF ou CNPJ|endereço comercial/);
    return;
  }
  assert.match(rodapeHtml, /Responsável: Professora Letícia Pimentel de Macedo/);
});
