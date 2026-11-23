import { randomUUID } from "node:crypto";
import type { Bilheteria } from "./bilheteria.ts";
import { DadosInvalidosErro, NaoEncontradoErro, PoltronaOcupadaErro } from "./dominio.ts";
import type { Evento } from "./dominio.ts";
import type { Comprovante, Pessoa } from "./tipos.ts";

const MAXIMO_POLTRONAS = 6;

interface Carrinho {
  token: string;
  eventoId: number;
  poltronas: number[];
  expiraEm: number;
  timer?: ReturnType<typeof setTimeout>;
  pagando: boolean;
}

export interface CarrinhoInfo {
  token: string;
  eventoId: number;
  poltronas: number[];
  restanteMs: number;
}

export interface MapaPoltronas {
  vendidas: number[];
  bloqueadas: number[];
}

export interface ConfigCarrinhos {
  bilheteria: Bilheteria;
  eventos: Evento[];
  prazoMs: number;
}

function ehPessoa(valor: unknown): valor is Pessoa {
  if (typeof valor !== "object" || valor === null) return false;
  const pessoa = valor as Record<string, unknown>;
  return (
    typeof pessoa.nome === "string" &&
    pessoa.nome.trim() !== "" &&
    Number.isInteger(pessoa.idade) &&
    (pessoa.idade as number) >= 0 &&
    typeof pessoa.estudante === "boolean" &&
    typeof pessoa.pcd === "boolean" &&
    Number.isInteger(pessoa.poltrona)
  );
}

function validarPessoas(ingressos: unknown, poltronas: number[]): Pessoa[] {
  if (!Array.isArray(ingressos) || !ingressos.every(ehPessoa)) {
    throw new DadosInvalidosErro("ingressos inválidos");
  }
  const pessoas: Pessoa[] = ingressos;
  const escolhidas = pessoas.map((pessoa) => pessoa.poltrona);
  const iguais =
    escolhidas.length === poltronas.length &&
    new Set(escolhidas).size === escolhidas.length &&
    escolhidas.every((poltrona) => poltronas.includes(poltrona));
  if (!iguais) throw new DadosInvalidosErro("os ingressos devem ser das poltronas do carrinho");
  return pessoas.map(({ nome, idade, estudante, pcd, poltrona }) => ({
    nome: nome.trim(),
    idade,
    estudante,
    pcd,
    poltrona,
  }));
}

export class Carrinhos {
  readonly #bilheteria: Bilheteria;
  readonly #eventos: Evento[];
  readonly #prazoMs: number;
  readonly #carrinhos = new Map<string, Carrinho>();

  constructor({ bilheteria, eventos, prazoMs }: ConfigCarrinhos) {
    this.#bilheteria = bilheteria;
    this.#eventos = eventos;
    this.#prazoMs = prazoMs;
  }

  criar(eventoId: number, poltrona: number): CarrinhoInfo {
    this.#evento(eventoId).reservar([poltrona]);
    const carrinho: Carrinho = {
      token: randomUUID(),
      eventoId,
      poltronas: [poltrona],
      expiraEm: Date.now() + this.#prazoMs,
      pagando: false,
    };
    this.#carrinhos.set(carrinho.token, carrinho);
    this.#agendar(carrinho, this.#prazoMs);
    return this.#info(carrinho);
  }

  adicionar(token: string, poltrona: number): CarrinhoInfo {
    const carrinho = this.#editavel(token);
    if (carrinho.poltronas.length >= MAXIMO_POLTRONAS) {
      throw new DadosInvalidosErro("limite de 6 poltronas por carrinho");
    }
    this.#evento(carrinho.eventoId).reservar([poltrona]);
    carrinho.poltronas = [...carrinho.poltronas, poltrona];
    return this.#info(carrinho);
  }

  remover(token: string, poltrona: number): CarrinhoInfo | null {
    const carrinho = this.#editavel(token);
    if (!carrinho.poltronas.includes(poltrona)) {
      throw new NaoEncontradoErro("poltrona fora do carrinho");
    }
    this.#evento(carrinho.eventoId).liberar([poltrona]);
    carrinho.poltronas = carrinho.poltronas.filter((item) => item !== poltrona);
    if (carrinho.poltronas.length > 0) return this.#info(carrinho);
    clearTimeout(carrinho.timer);
    this.#carrinhos.delete(token);
    return null;
  }

  consultar(token: string): CarrinhoInfo {
    return this.#info(this.#carrinho(token));
  }

  mapa(eventoId: number): MapaPoltronas {
    const evento = this.#evento(eventoId);
    const bloqueadas = [...this.#carrinhos.values()]
      .filter((carrinho) => carrinho.eventoId === eventoId)
      .flatMap((carrinho) => carrinho.poltronas)
      .sort((a, b) => a - b);
    return {
      vendidas: evento.ocupadas.filter((poltrona) => !bloqueadas.includes(poltrona)),
      bloqueadas,
    };
  }

  async pagar(token: string, ingressos: unknown): Promise<Comprovante> {
    const carrinho = this.#editavel(token);
    const pessoas = validarPessoas(ingressos, carrinho.poltronas);

    // Marcado antes do await: um segundo clique não pode iniciar outra cobrança.
    carrinho.pagando = true;
    clearTimeout(carrinho.timer);
    try {
      const comprovante = await this.#bilheteria.pagarBloqueadas(carrinho.eventoId, pessoas);
      this.#carrinhos.delete(token);
      return comprovante;
    } catch (erro) {
      carrinho.pagando = false;
      const restante = carrinho.expiraEm - Date.now();
      if (restante > 0) this.#agendar(carrinho, restante);
      else this.#expirar(token);
      throw erro;
    }
  }

  #evento(eventoId: number): Evento {
    const evento = this.#eventos.find((item) => item.id === eventoId);
    if (!evento) throw new NaoEncontradoErro("evento não encontrado");
    return evento;
  }

  #carrinho(token: string): Carrinho {
    const carrinho = this.#carrinhos.get(token);
    if (!carrinho) throw new NaoEncontradoErro("carrinho não encontrado ou expirado");
    return carrinho;
  }

  #editavel(token: string): Carrinho {
    const carrinho = this.#carrinho(token);
    if (carrinho.pagando) throw new PoltronaOcupadaErro("carrinho em pagamento");
    return carrinho;
  }

  #agendar(carrinho: Carrinho, ms: number): void {
    carrinho.timer = setTimeout(() => this.#expirar(carrinho.token), ms);
    carrinho.timer.unref();
  }

  #expirar(token: string): void {
    const carrinho = this.#carrinhos.get(token);
    if (!carrinho || carrinho.pagando) return;
    clearTimeout(carrinho.timer);
    this.#evento(carrinho.eventoId).liberar(carrinho.poltronas);
    this.#carrinhos.delete(token);
  }

  #info({ token, eventoId, poltronas, expiraEm }: Carrinho): CarrinhoInfo {
    return {
      token,
      eventoId,
      poltronas: [...poltronas],
      restanteMs: Math.max(0, expiraEm - Date.now()),
    };
  }
}
