# Bilheteria concorrente

Projeto final de Paradigmas de Linguagens de Programação. Enunciado completo no Blackboard.

Os arquivos de `src/` que vocês escrevem já existem, vazios; o `tipos.ts` e o `servidor.ts` vêm prontos. O que vai em cada um está no passo
indicado do enunciado:

| Arquivo | Passo do enunciado |
| :--- | :--- |
| `src/tipos.ts` (pronto) | 1: os tipos |
| `src/regras.ts` | 2: meia-entrada |
| `src/preco.ts` | 3: preço (funcional) |
| `src/dominio.ts` | 4: evento e erros (orientado a objetos) |
| `src/bilheteria.ts` | 5: a venda, onde a concorrência aparece |
| `src/servidor.ts` (pronto) e `src/main.ts` | 6: ligar o servidor |

Não alterem `src/pagamento.ts`, `src/servidor.ts`, `src/bench.ts` nem `testes/`: a correção usa os originais.

Para começar, sigam o `GUIA.md`. Depois dele, os comandos são:

```bash
npm install
npm test          # correção automática: mostra os pontos
npm start         # serviço em http://localhost:3000
npm run bench     # com o serviço no ar: 200 pedidos simultâneos no evento 1, dois por poltrona
```

Exemplo de pedido:

```bash
curl -X POST localhost:3000/reservas -H 'Content-Type: application/json' \
  -d '{"eventoId":1,"ingressos":[{"nome":"Ana","idade":20,"estudante":true,"pcd":false,"poltrona":7}]}'
```

---

## Preencham (avaliado no vídeo)

**Link do vídeo:** https://drive.google.com/drive/folders/1oE-VXO2cgCCVMfv4lroubYFxLY0PUX9C?usp=sharing

### Integrantes

| Nome | Usuário do GitHub | Parte principal |
| :--- | :--- | :--- |
| José Roberto de Souza Filho | DevRoberto21 | Docker, ajustes em `bilheteria.ts` e `main.ts`, carrinhos e tela de compra (extra) |
| Eduardo Lima Freitas | EduardoLimaFreitas | `main.ts`: inicialização da aplicação |
| Caio Araújo de Vasconcelos | Caioara | `regras.ts`, `preco.ts`, `dominio.ts` e `bilheteria.ts` |

### Decisões

1. **Concorrência.** Como vocês garantem que duas pessoas não ficam com a mesma poltrona? Onde estava o
   `await` perigoso?

   No `bilheteria.reservar`, as poltronas são marcadas com `evento.reservar(poltronas)` **antes** do
   `await` do pagamento. Entre conferir se a poltrona está livre e marcá-la não existe nenhum `await`,
   então o Node executa esse trecho inteiro sem trocar de pedido. Quando o segundo pedido da mesma
   poltrona chega, ela já está marcada e ele recebe `PoltronaOcupadaErro` (409) sem ser cobrado. O
   `await` perigoso é o do pagamento: se marcássemos as poltronas só depois dele, vários pedidos
   passariam pela conferência enquanto esperam a operadora, e todos seriam cobrados pela mesma
   poltrona. Se o pagamento falha ou passa de 500 ms (`comTempoLimite` com `Promise.race`), as
   poltronas voltam com `evento.liberar(poltronas)` e o pedido recebe `PagamentoErro` (502).

2. **OO.** O que o `Evento` esconde e por quê? Por que o `reservar` é tudo ou nada? Por que os erros são uma hierarquia de classes?

   O `Evento` guarda as poltronas vendidas num campo privado (`#vendidas`), e os outros dados também
   são privados, só com getters. Quem está fora da classe não consegue marcar ou desmarcar poltronas
   sem passar por `reservar` e `liberar`, que validam tudo. Assim nenhum código consegue vender uma
   poltrona inexistente ou já vendida. O `reservar` é tudo ou nada porque um pedido de várias pessoas
   não pode ficar pela metade: ele confere todas as poltronas primeiro e só marca se todas estiverem
   válidas e livres. Se desse erro no meio, ficariam poltronas presas sem ninguém pagar. Os erros são
   uma hierarquia (`ErroDeNegocio` e as subclasses) porque cada um guarda o próprio `status` HTTP. O
   `servidor.ts` só precisa testar `instanceof ErroDeNegocio` e responder com `erro.status`, sem um
   `if` para cada tipo de erro. Um erro novo entra sem mexer no servidor.

3. **Funcional.** O que ganhamos com `preco.ts` puro? Como vocês testariam ele sem subir o servidor?

   As funções de `preco.ts` só dependem dos argumentos e não alteram nada fora delas: a mesma entrada
   dá sempre a mesma saída. Isso deixa o cálculo fácil de entender e de reaproveitar (o `pagarBloqueadas`
   usa as mesmas funções). `valorDoIngresso` e `aplicarTaxa` devolvem funções, e `montarIngressos`
   recebe a regra de meia como parâmetro, então dá para trocar a regra sem mexer no cálculo. Para
   testar, basta importar as funções e comparar o resultado, sem servidor, banco ou pagamento. Exemplo:
   `montarIngressos(100, [ana, beto], direitoAMeia)` deve dar Ana meia por 50 e Beto inteira por 100,
   e `calcularTotal` sobre esses ingressos deve dar 165 (150 mais 10% de taxa).

4. **Se fosse em outro paradigma.** Escolham uma das partes e expliquem como ficaria em outro
   paradigma, e se ficaria melhor ou pior.

   Escolhemos o preço. Em OO, ficaria uma classe `CalculadoraDePreco` com o preço base e a taxa como
   atributos, e métodos como `calcularIngresso` e `calcularTotal`. Funcionaria, mas ficaria pior: o
   objeto tem estado, e para testar seria preciso criar e configurar a instância antes. Para trocar a
   regra de meia, a saída natural seria herança ou um padrão como Strategy, que é mais código para fazer
   o que no funcional é só passar uma função como argumento. Como o preço é só uma transformação de
   dados (pessoas em ingressos, ingressos em total), o funcional encaixa melhor.

5. **Concorrente × paralelo.** O Node roda o JavaScript numa linha só: os pedidos de vocês são
   concorrentes, não paralelos. O que mudaria se a venda rodasse em vários núcleos ao mesmo tempo?

   Hoje a nossa garantia depende de o Node rodar um trecho sem `await` do começo ao fim sem
   interrupção. Com vários núcleos, dois pedidos poderiam executar o `evento.reservar` ao mesmo tempo:
   os dois conferem que a poltrona está livre antes de qualquer um marcar, e a poltrona é vendida duas
   vezes. Além disso, cada núcleo teria a própria memória, então o `Set` de poltronas de um processo
   não seria visto pelos outros. Seria preciso guardar as poltronas num lugar compartilhado e proteger
   a conferência e a marcação juntas, com uma trava (mutex), uma operação atômica ou uma transação
   num banco de dados (por exemplo, um `UPDATE` que só marca se a poltrona ainda estiver livre).

### Resultados do bench

| Cenário | Pedidos | Tempo (ms) | Vendidos | Poltrona ocupada | Falha de pagamento |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Padrão (`main.ts`) | 200 | 115 | 95 | 100 | 5 |

O bench ocupa as poltronas do evento 1: para rodar de novo, parem o `npm start` (Ctrl+C) e subam outra
vez.

O que os números mostram: os 200 pedidos foram atendidos em 115 ms, embora cada pagamento demore cerca
de 80 ms. Se fossem atendidos um por vez, levaria uns 16 segundos. Isso só é possível porque, enquanto
um pedido espera no `await` do pagamento, o Node atende os outros. Os 100 pedidos recusados com 409
são exatamente o segundo pedido de cada poltrona: nenhuma poltrona foi vendida duas vezes e ninguém
foi cobrado por poltrona ocupada. Os 5 erros de pagamento (502) vêm da operadora falsa, que falha
cerca de 10% das vezes; essas poltronas foram devolvidas, e por isso o evento 1 terminou com 5
poltronas disponíveis (95 vendidas + 5 livres = 100). Os números de vendidos e de falhas mudam um pouco
a cada execução, mas vendidos + falhas sempre somam 100.
