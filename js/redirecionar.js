import { destinoLegado } from "./rotas.js";

const destino = document.body?.dataset.destino || "./";
location.replace(destinoLegado(location.pathname, destino, location.hash, location.search));
