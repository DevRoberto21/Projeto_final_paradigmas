import express from "express";
import type { NextFunction, Request, Response, Router } from "express";
import type { Carrinhos } from "./carrinhos.ts";
import { ErroDeNegocio } from "./dominio.ts";

export function criarRotasCarrinho(carrinhos: Carrinhos): Router {
  const rotas = express.Router();
  // Só em /carrinhos, para não interferir no POST /reservas do servidor original.
  rotas.use("/carrinhos", express.json());

  rotas.get("/eventos/:id/poltronas", (req, res) => {
    res.json(carrinhos.mapa(Number(req.params.id)));
  });

  rotas.post("/carrinhos", (req, res) => {
    res.status(201).json(carrinhos.criar(req.body?.eventoId, req.body?.poltrona));
  });

  rotas.get("/carrinhos/:token", (req, res) => {
    res.json(carrinhos.consultar(req.params.token));
  });

  rotas.post("/carrinhos/:token/poltronas", (req, res) => {
    res.json(carrinhos.adicionar(req.params.token, req.body?.poltrona));
  });

  rotas.delete("/carrinhos/:token/poltronas/:n", (req, res) => {
    const carrinho = carrinhos.remover(req.params.token, Number(req.params.n));
    if (carrinho) res.json(carrinho);
    else res.status(204).end();
  });

  rotas.post("/carrinhos/:token/pagamento", async (req, res) => {
    res.status(201).json(await carrinhos.pagar(req.params.token, req.body?.ingressos));
  });

  // O tratador de servidor.ts não recebe erros deste router, que roda antes dele.
  rotas.use((erro: Error, req: Request, res: Response, next: NextFunction) => {
    if (erro instanceof ErroDeNegocio) {
      res.status(erro.status).json({ mensagem: erro.message });
    } else if (erro instanceof SyntaxError) {
      res.status(400).json({ mensagem: "JSON inválido" });
    } else {
      console.error(erro);
      res.status(500).json({ mensagem: "erro interno" });
    }
  });

  return rotas;
}
