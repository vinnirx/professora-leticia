function campoPix(id, valor) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function identificadorPix() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => letras[byte % letras.length]).join("");
}

function nomeRecebedor(nome) {
  let limpo = semAcento(nome);
  if (limpo.length > 25) limpo = limpo.replace(" DE ", " ");
  return limpo.slice(0, 25);
}

function montarPix({ chave, nome, cidade, valor, txid }) {
  const recebedor = nomeRecebedor(nome);
  const municipio = semAcento(cidade || "BRASIL").slice(0, 15);
  const quantia = Number(valor).toFixed(2);
  const conta = campoPix("00", "br.gov.bcb.pix") + campoPix("01", chave) + campoPix("02", `Pedido ${txid}`);
  const extra = campoPix("05", txid);
  const semCrc = [
    campoPix("00", "01"),
    campoPix("01", "11"),
    campoPix("26", conta),
    campoPix("52", "0000"),
    campoPix("53", "986"),
    campoPix("54", quantia),
    campoPix("58", "BR"),
    campoPix("59", recebedor),
    campoPix("60", municipio),
    campoPix("62", extra),
    "6304",
  ].join("");
  return semCrc + crc16(semCrc);
}

const ECC_M = [
  null,
  { g1: 1, d1: 16, g2: 0, d2: 0, ec: 10 },
  { g1: 1, d1: 28, g2: 0, d2: 0, ec: 16 },
  { g1: 1, d1: 44, g2: 0, d2: 0, ec: 26 },
  { g1: 2, d1: 32, g2: 0, d2: 0, ec: 18 },
  { g1: 2, d1: 43, g2: 0, d2: 0, ec: 24 },
  { g1: 4, d1: 27, g2: 0, d2: 0, ec: 16 },
  { g1: 4, d1: 31, g2: 0, d2: 0, ec: 18 },
  { g1: 2, d1: 38, g2: 2, d2: 39, ec: 22 },
  { g1: 3, d1: 36, g2: 2, d2: 37, ec: 22 },
  { g1: 4, d1: 43, g2: 1, d2: 44, ec: 26 },
  { g1: 1, d1: 50, g2: 4, d2: 51, ec: 30 },
  { g1: 6, d1: 36, g2: 2, d2: 37, ec: 22 },
];

const FORMATO_M = [
  "101010000010010",
  "101000100100101",
  "101111001111100",
  "101101101001011",
  "100010111111001",
  "100000011001110",
  "100111110010111",
  "100101010100000",
];

const VERSAO_INFO = {
  7: "000111110010010100",
  8: "001000010110111100",
  9: "001001101010011001",
  10: "001010010011010011",
  11: "001011101111110110",
  12: "001100011101100010",
};

const ALINHAMENTO = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
};

function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i += 1) {
    if (b & 1) p ^= a;
    const cheio = a & 0x80;
    a = (a << 1) & 0xff;
    if (cheio) a ^= 0x1d;
    b >>= 1;
  }
  return p;
}

function reedSolomon(dados, tamanho) {
  let gerador = [1];
  for (let i = 0; i < tamanho; i += 1) {
    const proximo = new Array(gerador.length + 1).fill(0);
    for (let j = 0; j < gerador.length; j += 1) {
      proximo[j] ^= gerador[j];
      proximo[j + 1] ^= gfMul(gerador[j], EXP[i]);
    }
    gerador = proximo;
  }
  const resto = dados.concat(new Array(tamanho).fill(0));
  dados.forEach((_, indice) => {
    const fator = resto[indice];
    if (!fator) return;
    for (let j = 1; j < gerador.length; j += 1) {
      resto[indice + j] ^= gfMul(gerador[j], fator);
    }
  });
  return resto.slice(dados.length);
}

const EXP = [];
const LOG = [];
(function iniciarCampo() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x = gfMul(x, 2);
  }
})();

function expo(i) {
  return EXP[i % 255];
}

function bytesDoTexto(texto) {
  return Array.from(new TextEncoder().encode(texto));
}

function escolherVersao(quantidade) {
  for (let versao = 1; versao <= 12; versao += 1) {
    const tabela = ECC_M[versao];
    const dados = tabela.g1 * tabela.d1 + tabela.g2 * tabela.d2;
    const comprimento = versao >= 10 ? 16 : 8;
    const capacidade = dados * 8;
    const preciso = 4 + comprimento + quantidade * 8;
    if (preciso <= capacidade) return versao;
  }
  throw new Error("texto longo demais para o QR");
}

function montarDados(texto, versao) {
  const tabela = ECC_M[versao];
  const total = tabela.g1 * tabela.d1 + tabela.g2 * tabela.d2;
  const bits = [];
  const empurrar = (valor, tamanho) => {
    for (let i = tamanho - 1; i >= 0; i -= 1) bits.push((valor >> i) & 1);
  };
  empurrar(0b0100, 4);
  empurrar(bytesDoTexto(texto).length, versao >= 10 ? 16 : 8);
  bytesDoTexto(texto).forEach((byte) => empurrar(byte, 8));
  const capacidade = total * 8;
  const terminador = Math.min(4, capacidade - bits.length);
  empurrar(0, terminador);
  while (bits.length % 8) bits.push(0);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let valor = 0;
    for (let b = 0; b < 8; b += 1) valor = (valor << 1) | bits[i + b];
    bytes.push(valor);
  }
  const enchimento = [0xec, 0x11];
  let turno = 0;
  while (bytes.length < total) {
    bytes.push(enchimento[turno]);
    turno = 1 - turno;
  }
  return bytes;
}

function blocosComCorrecao(bytes, versao) {
  const tabela = ECC_M[versao];
  const dados = [];
  const erros = [];
  let cursor = 0;
  for (let grupo = 0; grupo < 2; grupo += 1) {
    const blocos = grupo === 0 ? tabela.g1 : tabela.g2;
    const tamanho = grupo === 0 ? tabela.d1 : tabela.d2;
    for (let i = 0; i < blocos; i += 1) {
      const parte = bytes.slice(cursor, cursor + tamanho);
      cursor += tamanho;
      dados.push(parte);
      erros.push(reedSolomon(parte, tabela.ec));
    }
  }
  const saida = [];
  const maior = Math.max(tabela.d1, tabela.d2);
  for (let i = 0; i < maior; i += 1) {
    dados.forEach((bloco) => {
      if (i < bloco.length) saida.push(bloco[i]);
    });
  }
  for (let i = 0; i < tabela.ec; i += 1) {
    erros.forEach((bloco) => saida.push(bloco[i]));
  }
  return saida;
}

function criarMatriz(versao) {
  const n = 21 + (versao - 1) * 4;
  const modulos = Array.from({ length: n }, () => Array(n).fill(null));
  const reservado = Array.from({ length: n }, () => Array(n).fill(false));
  const marcar = (x, y, escuro) => {
    modulos[y][x] = escuro;
    reservado[y][x] = true;
  };
  const finder = (x, y) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const borda = dx < 0 || dy < 0 || dx > 6 || dy > 6;
        const anel = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        const miolo = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        marcar(xx, yy, !borda && (anel || miolo));
      }
    }
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  for (let i = 8; i < n - 8; i += 1) {
    marcar(i, 6, i % 2 === 0);
    marcar(6, i, i % 2 === 0);
  }
  const pontos = ALINHAMENTO[versao] || [];
  const noCanto = (x, y) => {
    const canto = (px, py) => x >= px && x <= px + 8 && y >= py && y <= py + 8;
    return canto(-1, -1) || canto(n - 8, -1) || canto(-1, n - 8);
  };
  pontos.forEach((cy) => {
    pontos.forEach((cx) => {
      if (noCanto(cx, cy)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const anel = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          marcar(cx + dx, cy + dy, anel);
        }
      }
    });
  });
  marcar(8, 4 * versao + 9, true);
  const reservar = (x, y) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    reservado[y][x] = true;
  };
  [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [n - 8, 8],
    [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1],
  ].forEach(([x, y]) => reservar(x, y));
  if (versao >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const coluna = n - 11 + (i % 3);
      const linha = Math.floor(i / 3);
      reservar(coluna, linha);
      reservar(linha, coluna);
    }
  }
  return { n, modulos, reservado };
}

function aplicarMascara(modulos, reservado, mascara) {
  const n = modulos.length;
  const copia = modulos.map((linha) => linha.slice());
  const ligado = (x, y) => {
    if (mascara === 0) return (x + y) % 2 === 0;
    if (mascara === 1) return y % 2 === 0;
    if (mascara === 2) return x % 3 === 0;
    if (mascara === 3) return (x + y) % 3 === 0;
    if (mascara === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    if (mascara === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
    if (mascara === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  };
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!reservado[y][x] && ligado(x, y)) copia[y][x] = !copia[y][x];
    }
  }
  return copia;
}

function desenharFormato(modulos, reservado, mascara) {
  const bits = FORMATO_M[mascara].split("").reverse().join("");
  const n = modulos.length;
  const posicoes = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const outras = [
    [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [n - 8, 8],
    [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1],
  ];
  bits.split("").forEach((bit, indice) => {
    const escuro = bit === "1";
    const [x1, y1] = posicoes[indice];
    const [x2, y2] = outras[indice];
    modulos[y1][x1] = escuro;
    modulos[y2][x2] = escuro;
    reservado[y1][x1] = true;
    reservado[y2][x2] = true;
  });
}

function desenharVersao(modulos, versao) {
  const bits = (VERSAO_INFO[versao] || "").split("").reverse().join("");
  if (!bits) return;
  const n = modulos.length;
  bits.split("").forEach((bit, indice) => {
    const escuro = bit === "1";
    const coluna = n - 11 + (indice % 3);
    const linha = Math.floor(indice / 3);
    modulos[linha][coluna] = escuro;
    modulos[coluna][linha] = escuro;
  });
}

function preencherDados(modulos, reservado, bytes) {
  const bits = [];
  bytes.forEach((byte) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  });
  const n = modulos.length;
  let cursor = 0;
  for (let coluna = n - 1; coluna > 0; coluna -= 2) {
    if (coluna === 6) coluna = 5;
    for (let passo = 0; passo < n; passo += 1) {
      const subindo = Math.floor((n - coluna) / 2) % 2 === 0;
      const y = subindo ? n - 1 - passo : passo;
      [coluna, coluna - 1].forEach((x) => {
        if (reservado[y][x]) return;
        modulos[y][x] = cursor < bits.length && bits[cursor] === 1;
        cursor += 1;
      });
    }
  }
}

function penalidade(modulos) {
  const n = modulos.length;
  let pontos = 0;
  for (let y = 0; y < n; y += 1) {
    let corrida = 1;
    for (let x = 1; x < n; x += 1) {
      if (modulos[y][x] === modulos[y][x - 1]) corrida += 1;
      else {
        if (corrida >= 5) pontos += 3 + corrida - 5;
        corrida = 1;
      }
    }
    if (corrida >= 5) pontos += 3 + corrida - 5;
  }
  let escuros = 0;
  modulos.forEach((linha) => linha.forEach((celula) => {
    if (celula) escuros += 1;
  }));
  pontos += Math.floor(Math.abs(escuros / (n * n) - 0.5) * 20) * 10;
  return pontos;
}

function qrModulos(texto) {
  const versao = escolherVersao(bytesDoTexto(texto).length);
  const bytes = blocosComCorrecao(montarDados(texto, versao), versao);
  const base = criarMatriz(versao);
  preencherDados(base.modulos, base.reservado, bytes);
  let melhor = null;
  let menor = Infinity;
  for (let mascara = 0; mascara < 8; mascara += 1) {
    const modulos = aplicarMascara(base.modulos, base.reservado, mascara);
    desenharFormato(modulos, base.reservado.map((linha) => linha.slice()), mascara);
    desenharVersao(modulos, versao);
    const custo = penalidade(modulos);
    if (custo < menor) {
      menor = custo;
      melhor = modulos;
    }
  }
  return melhor;
}

function qrSvg(texto) {
  const modulos = qrModulos(texto);
  const n = modulos.length;
  const quiet = 4;
  const total = n + quiet * 2;
  let retangulos = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!modulos[y][x]) continue;
      retangulos += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="QR Code do Pix">${retangulos}</svg>`;
}
