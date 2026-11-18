import { prepararAreas } from "./areas.js?v=4";
import { prepararCarrinho } from "./carrinho.js?v=2";
import { iniciarCatalogo, prepararBusca } from "./catalogo.js?v=4";
import { abrirPix, prepararCheckout } from "./checkout.js?v=9";

document.addEventListener("DOMContentLoaded", () => {
  prepararCarrinho(abrirPix);
  prepararAreas();
  prepararBusca();
  prepararCheckout();
  iniciarCatalogo();
});
