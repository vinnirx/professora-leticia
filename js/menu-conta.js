export function opcoesConta({ logado, administraLoja }) {
  if (!logado) return ["Entrar"];
  if (administraLoja) return ["Minha conta", "Gerenciar loja", "Sair"];
  return ["Minha conta", "Sair"];
}
