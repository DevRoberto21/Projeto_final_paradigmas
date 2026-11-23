import type { EventoInfo } from "./tipos.ts";

export abstract class ErroDeNegocio extends Error {
  readonly status: number;

  protected constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = new.target.name;
    this.status = status;
  }
}

export class DadosInvalidosErro extends ErroDeNegocio {
  constructor(mensagem: string) { super(mensagem, 400); }
}

export class NaoEncontradoErro extends ErroDeNegocio {
  constructor(mensagem: string) { super(mensagem, 404); }
}

export class PoltronaOcupadaErro extends ErroDeNegocio {
  constructor(mensagem: string) { super(mensagem, 409); }
}

export class PagamentoErro extends ErroDeNegocio {
  constructor(mensagem: string) { super(mensagem, 502); }
}

export class Evento {
  readonly #id: number;
  readonly #nome: string;
  readonly #preco: number;
  readonly #capacidade: number;
  readonly #vendidas = new Set<number>();

  constructor(id: number, nome: string, preco: number, capacidade: number) {
    this.#id = id;
    this.#nome = nome;
    this.#preco = preco;
    this.#capacidade = capacidade;
  }

  get disponivel(): number {
    return this.#capacidade - this.#vendidas.size;
  }

  get id(): number { return this.#id; }
  get nome(): string { return this.#nome; }
  get preco(): number { return this.#preco; }
  get capacidade(): number { return this.#capacidade; }

  get ocupadas(): number[] {
    return [...this.#vendidas].sort((a, b) => a - b);
  }

  reservar(poltronas: number[]): void {
    if (
      poltronas.length === 0 ||
      poltronas.some((p) => !Number.isInteger(p) || p < 1 || p > this.#capacidade) ||
      new Set(poltronas).size !== poltronas.length
    ) {
      throw new DadosInvalidosErro("poltronas inválidas");
    }
    if (poltronas.some((p) => this.#vendidas.has(p))) {
      throw new PoltronaOcupadaErro("uma ou mais poltronas já foram vendidas");
    }
    poltronas.forEach((p) => this.#vendidas.add(p));
  }

  liberar(poltronas: number[]): void {
    if (
      poltronas.some((p) => !this.#vendidas.has(p)) ||
      new Set(poltronas).size !== poltronas.length
    ) {
      throw new DadosInvalidosErro("poltrona não estava vendida");
    }
    poltronas.forEach((p) => this.#vendidas.delete(p));
  }

  info(): EventoInfo {
    return {
      id: this.#id,
      nome: this.#nome,
      preco: this.#preco,
      capacidade: this.#capacidade,
      disponivel: this.disponivel,
    };
  }
}
