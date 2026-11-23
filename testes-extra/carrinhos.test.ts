import { test } from "node:test";
import assert from "node:assert/strict";
import { criarBilheteria } from "../src/bilheteria.ts";
import { Carrinhos } from "../src/carrinhos.ts";
import {
  DadosInvalidosErro,
  Evento,
  NaoEncontradoErro,
  PagamentoErro,
  PoltronaOcupadaErro,
} from "../src/dominio.ts";
import type { Pagamento } from "../src/pagamento.ts";

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pessoa = (poltrona: number) => ({ nome: "Ana", idade: 20, estudante: false, pcd: false, poltrona });

function montar(prazoMs = 1000, pagar: Pagamento = async () => {}) {
  const evento = new Evento(1, "Show", 100, 10);
  const bilheteria = criarBilheteria({ eventos: [evento], pagar, limitePagamentoMs: 200 });
  return { evento, carrinhos: new Carrinhos({ bilheteria, eventos: [evento], prazoMs }) };
}

test("criar bloqueia poltrona e aparece no mapa", () => {
  const { carrinhos, evento } = montar();
  const carrinho = carrinhos.criar(1, 4);
  assert.deepEqual(carrinho.poltronas, [4]);
  assert.equal(evento.disponivel, 9);
  assert.deepEqual(carrinhos.mapa(1), { vendidas: [], bloqueadas: [4] });
});

test("expiração libera todas as poltronas", async () => {
  const { carrinhos, evento } = montar(30);
  const { token } = carrinhos.criar(1, 1);
  carrinhos.adicionar(token, 2);
  await esperar(70);
  assert.equal(evento.disponivel, 10);
  assert.throws(() => carrinhos.consultar(token), NaoEncontradoErro);
});

test("nova poltrona não renova o prazo", async () => {
  const { carrinhos } = montar();
  const primeiro = carrinhos.criar(1, 1);
  await esperar(30);
  const depois = carrinhos.adicionar(primeiro.token, 2);
  assert.ok(depois.restanteMs < primeiro.restanteMs);
});

test("limite de 6 poltronas", () => {
  const { carrinhos } = montar();
  const { token } = carrinhos.criar(1, 1);
  [2, 3, 4, 5, 6].map((poltrona) => carrinhos.adicionar(token, poltrona));
  assert.throws(() => carrinhos.adicionar(token, 7), DadosInvalidosErro);
});

test("outro carrinho não pega poltrona bloqueada", () => {
  const { carrinhos } = montar();
  carrinhos.criar(1, 1);
  assert.throws(() => carrinhos.criar(1, 1), PoltronaOcupadaErro);
});

test("remover última poltrona apaga carrinho", () => {
  const { carrinhos, evento } = montar();
  const { token } = carrinhos.criar(1, 1);
  assert.equal(carrinhos.remover(token, 1), null);
  assert.equal(evento.disponivel, 10);
  assert.throws(() => carrinhos.consultar(token), NaoEncontradoErro);
});

test("pagamento aprovado transforma bloqueio em venda", async () => {
  const { carrinhos } = montar();
  const { token } = carrinhos.criar(1, 1);
  const comprovante = await carrinhos.pagar(token, [pessoa(1)]);
  assert.equal(comprovante.total, 110);
  assert.deepEqual(carrinhos.mapa(1), { vendidas: [1], bloqueadas: [] });
  assert.throws(() => carrinhos.consultar(token), NaoEncontradoErro);
});

test("falha mantém bloqueio e permite nova tentativa", async () => {
  let tentativas = 0;
  const { carrinhos } = montar(1000, async () => {
    tentativas += 1;
    if (tentativas === 1) throw new Error("recusado");
  });
  const { token } = carrinhos.criar(1, 1);
  await assert.rejects(carrinhos.pagar(token, [pessoa(1)]), PagamentoErro);
  assert.deepEqual(carrinhos.mapa(1).bloqueadas, [1]);
  await carrinhos.pagar(token, [pessoa(1)]);
  assert.deepEqual(carrinhos.mapa(1).vendidas, [1]);
});

test("clique duplo não cobra duas vezes", async () => {
  let cobrancas = 0;
  const { carrinhos } = montar(1000, async () => {
    cobrancas += 1;
    await esperar(20);
  });
  const { token } = carrinhos.criar(1, 1);
  const primeiro = carrinhos.pagar(token, [pessoa(1)]);
  await assert.rejects(carrinhos.pagar(token, [pessoa(1)]), PoltronaOcupadaErro);
  await primeiro;
  assert.equal(cobrancas, 1);
});

test("timer não expira durante pagamento aprovado", async () => {
  const { carrinhos } = montar(20, async () => { await esperar(60); });
  const { token } = carrinhos.criar(1, 1);
  await carrinhos.pagar(token, [pessoa(1)]);
  assert.deepEqual(carrinhos.mapa(1), { vendidas: [1], bloqueadas: [] });
});

test("falha depois do prazo libera poltronas", async () => {
  const { carrinhos, evento } = montar(20, async () => {
    await esperar(60);
    throw new Error("recusado");
  });
  const { token } = carrinhos.criar(1, 1);
  await assert.rejects(carrinhos.pagar(token, [pessoa(1)]), PagamentoErro);
  assert.equal(evento.disponivel, 10);
});

test("ingressos precisam ser exatamente as poltronas do carrinho", async () => {
  const { carrinhos } = montar();
  const { token } = carrinhos.criar(1, 1);
  await assert.rejects(carrinhos.pagar(token, [pessoa(2)]), DadosInvalidosErro);
  await assert.rejects(carrinhos.pagar(token, [pessoa(1), pessoa(1)]), DadosInvalidosErro);
  await assert.rejects(carrinhos.pagar(token, [{ ...pessoa(1), nome: " " }]), DadosInvalidosErro);
  assert.deepEqual(carrinhos.mapa(1).bloqueadas, [1]);
});
