import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { criarBilheteria } from "../src/bilheteria.ts";
import { Carrinhos } from "../src/carrinhos.ts";
import { Evento } from "../src/dominio.ts";
import { criarRotasCarrinho } from "../src/rotasCarrinho.ts";
import { criarServidor } from "../src/servidor.ts";

let servidor: Server;
let base: string;

const enviar = (metodo: string, caminho: string, corpo?: unknown) =>
  fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

before(async () => {
  const eventos = [new Evento(1, "Show", 100, 10)];
  const bilheteria = criarBilheteria({ eventos, pagar: async () => {}, limitePagamentoMs: 100 });
  const app = express();
  app.use(criarRotasCarrinho(new Carrinhos({ bilheteria, eventos, prazoMs: 1000 })));
  app.use(criarServidor(bilheteria));
  await new Promise<void>((resolve) => { servidor = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

test("fluxo completo do carrinho", async () => {
  const criado = await enviar("POST", "/carrinhos", { eventoId: 1, poltrona: 1 });
  assert.equal(criado.status, 201);
  const { token } = await criado.json();

  const adicionado = await enviar("POST", `/carrinhos/${token}/poltronas`, { poltrona: 2 });
  assert.equal(adicionado.status, 200);
  assert.equal((await enviar("DELETE", `/carrinhos/${token}/poltronas/2`)).status, 200);
  assert.equal((await enviar("GET", `/carrinhos/${token}`)).status, 200);

  const mapa = await (await enviar("GET", "/eventos/1/poltronas")).json();
  assert.deepEqual(mapa, { vendidas: [], bloqueadas: [1] });

  const pago = await enviar("POST", `/carrinhos/${token}/pagamento`, {
    ingressos: [{ nome: "Ana", idade: 20, estudante: true, pcd: false, poltrona: 1 }],
  });
  assert.equal(pago.status, 201);
  assert.equal((await pago.json()).total, 55);
  assert.equal((await enviar("GET", `/carrinhos/${token}`)).status, 404);
});

test("erros usam status de negócio", async () => {
  assert.equal((await enviar("POST", "/carrinhos", { eventoId: 99, poltrona: 1 })).status, 404);
  assert.equal((await enviar("POST", "/carrinhos", { eventoId: 1, poltrona: 0 })).status, 400);
  const criado = await enviar("POST", "/carrinhos", { eventoId: 1, poltrona: 5 });
  assert.equal(criado.status, 201);
  assert.equal((await enviar("POST", "/carrinhos", { eventoId: 1, poltrona: 5 })).status, 409);
  const { token } = await criado.json();
  assert.equal((await enviar("DELETE", `/carrinhos/${token}/poltronas/5`)).status, 204);
});

test("JSON inválido responde 400", async () => {
  const resposta = await fetch(`${base}/carrinhos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(resposta.status, 400);
});

test("rotas originais continuam funcionando", async () => {
  const eventos = await (await enviar("GET", "/eventos")).json();
  assert.deepEqual(Object.keys(eventos[0]), ["id", "nome", "preco", "capacidade", "disponivel"]);
  const reserva = await enviar("POST", "/reservas", {
    eventoId: 1,
    ingressos: [{ nome: "Ana", idade: 20, estudante: false, pcd: false, poltrona: 9 }],
  });
  assert.equal(reserva.status, 201);
});
