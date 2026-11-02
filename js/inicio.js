import { prepararAreas } from "./areas.js";
import { prepararCarrinho } from "./carrinho.js";
import { iniciarCatalogo, prepararBusca } from "./catalogo.js";
import { abrirPix, prepararCheckout } from "./checkout.js";

document.addEventListener("DOMContentLoaded", () => {
  prepararCarrinho(abrirPix);
  prepararAreas();
  prepararBusca();
  prepararCheckout();
  iniciarCatalogo();
});
