import { prepararAreas } from "./areas.js?v=6";
import { prepararCarrinho } from "./carrinho.js?v=2";
import { iniciarCatalogo, prepararBusca } from "./catalogo.js?v=5";
import { abrirPix, prepararCheckout } from "./checkout.js?v=10";

document.addEventListener("DOMContentLoaded", () => {
  prepararCarrinho(abrirPix);
  prepararAreas();
  prepararBusca();
  prepararCheckout();
  iniciarCatalogo();
});
