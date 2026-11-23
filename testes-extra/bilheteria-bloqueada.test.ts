import { test } from "node:test";
import assert from "node:assert/strict";
import { criarBilheteria } from "../src/bilheteria.ts";
import { Evento, PagamentoErro } from "../src/dominio.ts";

const pessoa = (poltrona: number) => ({ nome: "Ana", idade: 20, estudante: true, pcd: false, poltrona });

test("ocupadas devolve cópia ordenada", () => {
  const evento = new Evento(1, "Show", 100, 5);
  evento.reservar([3, 1]);
  const ocupadas = evento.ocupadas;
  ocupadas.push(5);
  assert.deepEqual(evento.ocupadas, [1, 3]);
  assert.equal(Object.keys(evento.info()).length, 5);
});

test("pagarBloqueadas cobra sem marcar a poltrona de novo", async () => {
  const evento = new Evento(1, "Show", 100, 5);
  const cobrancas: number[] = [];
  const bilheteria = criarBilheteria({
    eventos: [evento],
    pagar: async (valor) => { cobrancas.push(valor); },
    limitePagamentoMs: 100,
  });
  evento.reservar([2]);
  const comprovante = await bilheteria.pagarBloqueadas(1, [pessoa(2)]);
  assert.deepEqual(cobrancas, [55]);
  assert.equal(comprovante.total, 55);
  assert.equal(comprovante.ingressos[0].tipo, "meia");
  assert.deepEqual(evento.ocupadas, [2]);
});

test("pagarBloqueadas não libera poltrona quando pagamento falha", async () => {
  const evento = new Evento(1, "Show", 100, 5);
  const bilheteria = criarBilheteria({
    eventos: [evento],
    pagar: async () => { throw new Error("recusado"); },
    limitePagamentoMs: 100,
  });
  evento.reservar([2]);
  await assert.rejects(bilheteria.pagarBloqueadas(1, [pessoa(2)]), PagamentoErro);
  assert.deepEqual(evento.ocupadas, [2]);
});
