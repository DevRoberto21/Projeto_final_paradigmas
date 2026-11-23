import type { Comprovante, ConfigBilheteria, EventoInfo, Pedido, Pessoa } from "./tipos.ts";
import { DadosInvalidosErro, NaoEncontradoErro, PagamentoErro } from "./dominio.ts";
import { calcularTotal, montarIngressos } from "./preco.ts";
import { direitoAMeia } from "./regras.ts";

function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error("tempo esgotado")), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

export class Bilheteria {
  readonly #eventos: ConfigBilheteria["eventos"];
  readonly #pagar: ConfigBilheteria["pagar"];
  readonly #limitePagamentoMs: number;
  #proximoReservaId = 1;

  constructor(config: ConfigBilheteria) {
    this.#eventos = config.eventos;
    this.#pagar = config.pagar;
    this.#limitePagamentoMs = config.limitePagamentoMs;
  }

  listarEventos(): EventoInfo[] {
    return this.#eventos.map((evento) => evento.info());
  }

  async reservar(pedido: Pedido): Promise<Comprovante> {
    if (
      !pedido ||
      !Array.isArray(pedido.ingressos) ||
      pedido.ingressos.length === 0 ||
      pedido.ingressos.some((pessoa) => !pessoa)
    ) {
      throw new DadosInvalidosErro("o pedido deve conter ao menos um ingresso");
    }
    const evento = this.#eventos.find((item) => item.id === pedido.eventoId);
    if (!evento) throw new NaoEncontradoErro("evento não encontrado");

    const poltronas = pedido.ingressos.map((pessoa) => pessoa.poltrona);
    evento.reservar(poltronas);

    const ingressos = montarIngressos(evento.preco, pedido.ingressos, direitoAMeia);
    const total = calcularTotal(ingressos);
    try {
      await comTempoLimite(this.#pagar(total), this.#limitePagamentoMs);
    } catch {
      evento.liberar(poltronas);
      throw new PagamentoErro("pagamento recusado ou expirado");
    }

    return { reservaId: this.#proximoReservaId++, eventoId: evento.id, ingressos, total };
  }

  async pagarBloqueadas(eventoId: number, pessoas: Pessoa[]): Promise<Comprovante> {
    const evento = this.#eventos.find((item) => item.id === eventoId);
    if (!evento) throw new NaoEncontradoErro("evento não encontrado");

    const ingressos = montarIngressos(evento.preco, pessoas, direitoAMeia);
    const total = calcularTotal(ingressos);
    try {
      await comTempoLimite(this.#pagar(total), this.#limitePagamentoMs);
    } catch {
      throw new PagamentoErro("pagamento recusado ou expirado");
    }

    return { reservaId: this.#proximoReservaId++, eventoId: evento.id, ingressos, total };
  }
}

export function criarBilheteria(config: ConfigBilheteria): Bilheteria {
  return new Bilheteria(config);
}
