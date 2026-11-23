import express from "express";
import { fileURLToPath } from "node:url";
import { Evento } from "./dominio.ts";
import { criarPagamentoFalso } from "./pagamento.ts";
import { criarBilheteria } from "./bilheteria.ts";
import { Carrinhos } from "./carrinhos.ts";
import { criarRotasCarrinho } from "./rotasCarrinho.ts";
import { criarServidor } from "./servidor.ts";

const eventos = [
  new Evento(1, "Show de Abertura", 80, 100),
  new Evento(2, "Peça de Teatro", 60, 50),
  new Evento(3, "Cinema Especial", 30, 30),
];

const pagar = criarPagamentoFalso({ latenciaMs: 80, taxaDeFalha: 0.1 });

const bilheteria = criarBilheteria({
  eventos,
  pagar,
  limitePagamentoMs: 500,
});

const carrinhos = new Carrinhos({ bilheteria, eventos, prazoMs: 600000 });

const app = express();
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
app.use(criarRotasCarrinho(carrinhos));
app.use(criarServidor(bilheteria));

app.listen(3000, (erro) => {
  if (erro) throw erro;
  console.log("Bilheteria no ar em http://localhost:3000");
});
