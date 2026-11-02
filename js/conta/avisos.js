export const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function aviso(elemento, mensagem, ok) {
  elemento.textContent = mensagem;
  elemento.classList.toggle("aviso-ok", Boolean(ok));
}

export function faltaBanco(elemento) {
  aviso(elemento, "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.");
}
