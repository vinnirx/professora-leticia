import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const modoArquivo = "/tmp/asaas-modo.json";
const contagemArquivo = "/tmp/asaas-contagem.json";
const contagem = { postsCliente: 0, postsPagamento: 0 };

function modo() {
  try {
    return JSON.parse(readFileSync(modoArquivo, "utf8"));
  } catch {
    return {};
  }
}

function gravar() {
  writeFileSync(contagemArquivo, JSON.stringify(contagem));
}

createServer((req, resposta) => {
  const partes = [];
  req.on("data", (parte) => partes.push(parte));
  req.on("end", () => {
    const pedido = new URL(req.url || "/", "http://127.0.0.1");
    const atual = modo();
    if (pedido.pathname === "/v3/customers" && req.method === "GET") {
      const id = pedido.searchParams.get("externalReference");
      const lista = Array.isArray(atual.clientes) && atual.clientes.includes(id) ? [{ id: "cus_local" }] : [];
      resposta.writeHead(200, { "Content-Type": "application/json" });
      resposta.end(JSON.stringify({ data: lista }));
      return;
    }
    if (pedido.pathname === "/v3/customers" && req.method === "POST") {
      contagem.postsCliente += 1;
      gravar();
      resposta.writeHead(500, { "Content-Type": "application/json" });
      resposta.end("{}");
      return;
    }
    if (pedido.pathname === "/v3/payments" && req.method === "GET") {
      if (atual.pagamentos === "timeout") {
        setTimeout(() => {
          resposta.writeHead(200, { "Content-Type": "application/json" });
          resposta.end('{"data":[]}');
        }, 20000);
        return;
      }
      resposta.writeHead(atual.pagamentos === "erro" ? 500 : 200, { "Content-Type": "application/json" });
      resposta.end('{"data":[]}');
      return;
    }
    if (pedido.pathname === "/v3/payments" && req.method === "POST") {
      contagem.postsPagamento += 1;
      gravar();
      resposta.writeHead(500, { "Content-Type": "application/json" });
      resposta.end("{}");
      return;
    }
    resposta.writeHead(404);
    resposta.end();
  });
}).listen(8799, "127.0.0.1");
gravar();
