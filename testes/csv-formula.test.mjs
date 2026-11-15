import assert from "node:assert/strict";
import { celulaCsv } from "../js/conta/csv.js";

assert.equal(celulaCsv("R$ 4,90"), '"R$ 4,90"');
assert.equal(celulaCsv('Ana "Silva"'), '"Ana ""Silva"""');
assert.equal(celulaCsv("=1+1"), `"'=1+1"`);
assert.equal(celulaCsv("+55"), `"'+55"`);
assert.equal(celulaCsv("-10"), `"'-10"`);
assert.equal(celulaCsv("@soma"), `"'@soma"`);
assert.equal(celulaCsv("\tcmd"), `"'\tcmd"`);

console.log("ok csv");
