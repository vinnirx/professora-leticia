export function administra(papel) {
  return papel === "owner" || papel === "super_admin" || papel === "admin";
}

export function perfilDaSessao(usuarioId, linha) {
  if (!usuarioId || !linha || linha.id !== usuarioId) return null;
  if (!["cliente", "admin", "super_admin", "owner"].includes(linha.papel)) return null;
  return linha;
}

export function podeFinanceiro(perfil) {
  if (!perfil) return false;
  if (perfil.papel === "owner" || perfil.papel === "super_admin") return true;
  return perfil.papel === "admin" && perfil.acesso_financeiro === true;
}

export function rotuloPapel(papel) {
  if (papel === "owner") return "Proprietária";
  if (papel === "super_admin") return "Super Admin";
  if (papel === "admin") return "Administrador";
  return "Cliente";
}
