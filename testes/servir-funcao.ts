const porta = Number(Deno.args[1]);
const nome = Deno.args[0];
const original = Deno.serve.bind(Deno);
Deno.serve = ((argumento, tratador) => {
  if (typeof argumento === "function") {
    return original({ port: porta, hostname: "127.0.0.1", onListen() {} }, argumento);
  }
  return original({ ...argumento, port: porta, hostname: "127.0.0.1" }, tratador);
}) as typeof Deno.serve;
await import(`../supabase/functions/${nome}/index.ts`);
