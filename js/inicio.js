import { prepararAreas } from "./areas.js?v=3";
import { prepararCarrinho } from "./carrinho.js?v=2";
import { iniciarCatalogo, prepararBusca } from "./catalogo.js?v=3";
import { abrirPix, prepararCheckout } from "./checkout.js?v=6";

document.addEventListener("DOMContentLoaded", () => {
  prepararCarrinho(abrirPix);
  prepararAreas();
  prepararBusca();
  prepararCheckout();
  iniciarCatalogo();
});
