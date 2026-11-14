import http from "node:http";

const portas = {
  "criar-cobranca": 8781,
  "webhook-asaas": 8782,
  "link-download": 8783,
};

http.createServer((req, resposta) => {
  const nome = (req.url || "/").split("?")[0].replace(/^\//, "").split("/")[0];
  const porta = portas[nome];
  if (!porta) {
    resposta.writeHead(404);
    resposta.end();
    return;
  }
  const destino = http.request(
    {
      hostname: "127.0.0.1",
      port: porta,
      path: "/",
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${porta}` },
    },
    (origem) => {
      resposta.writeHead(origem.statusCode || 500, origem.headers);
      origem.pipe(resposta);
    },
  );
  destino.on("error", () => {
    resposta.writeHead(502);
    resposta.end();
  });
  req.pipe(destino);
}).listen(8787, "127.0.0.1");
