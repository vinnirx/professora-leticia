-- A conciliação lê cobranças e eventos já gravados com a chave interna do servidor.
-- Visitantes e contas comuns continuam sem acesso a essas tabelas.

grant select (evento_externo, resultado)
  on public.eventos_pagamento to service_role;

grant select (id, txid, valor_bruto, status, cobranca_externa)
  on public.cobrancas to service_role;
