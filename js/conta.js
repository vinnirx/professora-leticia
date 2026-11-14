import { iniciarAdmin } from "./conta/admin.js?v=2";
import { iniciarEntrar } from "./conta/entrar.js";
import { iniciarMinhas } from "./conta/minhas.js?v=2";

const pagina = document.body.dataset.pagina;
const loja = await window.contaPronta;
if (pagina === "entrar") iniciarEntrar(loja);
if (pagina === "minhas") iniciarMinhas(loja);
if (pagina === "admin") iniciarAdmin(loja);
