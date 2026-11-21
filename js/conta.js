import { iniciarAdmin } from "./conta/admin.js?v=44";
import { iniciarEntrar } from "./conta/entrar.js?v=13";
import { iniciarMinhas } from "./conta/minhas.js?v=19";

const pagina = document.body.dataset.pagina;
const loja = await window.contaPronta;
if (pagina === "entrar") iniciarEntrar(loja);
if (pagina === "minhas") iniciarMinhas(loja);
if (pagina === "admin") iniciarAdmin(loja);
