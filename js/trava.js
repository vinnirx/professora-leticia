export function criarTrava() {
  let ocupada = false;
  return {
    entrar() {
      if (ocupada) return false;
      ocupada = true;
      return true;
    },
    sair() {
      ocupada = false;
    },
  };
}
