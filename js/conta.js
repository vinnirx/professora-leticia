import { iniciarAdmin } from "./conta/admin.js";
import { iniciarEntrar } from "./conta/entrar.js";
import { iniciarMinhas } from "./conta/minhas.js";

const pagina = document.body.dataset.pagina;
const loja = await window.contaPronta;
if (pagina === "entrar") iniciarEntrar(loja);
if (pagina === "minhas") iniciarMinhas(loja);
if (pagina === "admin") iniciarAdmin(loja);
