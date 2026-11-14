import { writeFileSync } from "node:fs";

let texto = "";
process.stdin.on("data", (parte) => {
  texto += parte;
});
process.stdin.on("end", () => {
  const anon = texto.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24i[^']+/)?.[0];
  const servico = texto.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZS[^']+/)?.[0];
  if (!anon || !servico) {
    console.log("falha ao localizar as chaves locais");
    process.exit(1);
  }
  writeFileSync("/tmp/sb-homologacao.env", `SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${servico}\n`);
  console.log("chaves locais gravadas");
});
