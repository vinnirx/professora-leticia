import { iniciarAdmin } from "./conta/admin.js?v=14";
import { iniciarEntrar } from "./conta/entrar.js?v=5";
import { iniciarMinhas } from "./conta/minhas.js?v=7";

const pagina = document.body.dataset.pagina;
const loja = await window.contaPronta;
if (pagina === "entrar") iniciarEntrar(loja);
if (pagina === "minhas") iniciarMinhas(loja);
if (pagina === "admin") iniciarAdmin(loja);
