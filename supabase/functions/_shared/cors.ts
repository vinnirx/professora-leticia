const origens = new Set([
  "http://127.0.0.1:4204",
  "https://vinnirx.github.io",
  "https://professoraleticiapimenteldemacedo.com.br",
]);

export function cabecalhos(origem: string | null) {
  const permitida = origem && origens.has(origem) ? origem : "http://127.0.0.1:4204";
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function responder(origem: string | null, status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhos(origem), "Content-Type": "application/json" },
  });
}
