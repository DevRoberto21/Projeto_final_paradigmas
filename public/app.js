const CHAVE_TOKEN = "bilheteria.carrinho";
const INTERVALO_MAPA_MS = 2000;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const elementos = {
  eventos: document.querySelector("#eventos"),
  aviso: document.querySelector("#aviso"),
  resumo: document.querySelector("#resumo"),
  mapa: document.querySelector("#mapa"),
  contador: document.querySelector("#contador"),
  vazio: document.querySelector("#vazio"),
  form: document.querySelector("#pagamento"),
  pessoas: document.querySelector("#pessoas"),
  pagar: document.querySelector("#pagar"),
  comprovante: document.querySelector("#comprovante"),
  itens: document.querySelector("#itens"),
  total: document.querySelector("#total"),
};

const estado = {
  eventos: [],
  eventoId: null,
  mapa: { vendidas: [], bloqueadas: [] },
  carrinho: null,
  dados: new Map(),
  expiraNoRelogio: 0,
  ocupado: false,
  pagando: false,
};

async function api(caminho, metodo = "GET", corpo) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw Object.assign(new Error(dados.mensagem ?? "Erro inesperado."), { status: resposta.status });
  }
  return dados;
}

function avisar(mensagem) {
  elementos.aviso.textContent = mensagem;
}

function eventoAtual() {
  return estado.eventos.find((evento) => evento.id === estado.eventoId);
}

function dadosDaPoltrona(poltrona) {
  if (!estado.dados.has(poltrona)) {
    estado.dados.set(poltrona, { nome: "", idade: "", estudante: false, pcd: false });
  }
  return estado.dados.get(poltrona);
}

function definirCarrinho(carrinho) {
  estado.carrinho = carrinho;
  if (carrinho) {
    sessionStorage.setItem(CHAVE_TOKEN, carrinho.token);
    estado.expiraNoRelogio = performance.now() + carrinho.restanteMs;
    estado.eventoId = carrinho.eventoId;
    [...estado.dados.keys()]
      .filter((poltrona) => !carrinho.poltronas.includes(poltrona))
      .forEach((poltrona) => estado.dados.delete(poltrona));
  } else {
    sessionStorage.removeItem(CHAVE_TOKEN);
    estado.dados.clear();
  }
  elementos.pagar.textContent = "Pagar";
  renderizarCarrinho();
  renderizarEventos();
  renderizarMapa();
}

function renderizarEventos() {
  // Reaproveita os botões para a atualização periódica não tirar o foco do teclado.
  if (elementos.eventos.children.length !== estado.eventos.length) {
    const botoes = estado.eventos.map((evento) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.addEventListener("click", () => selecionarEvento(evento.id));
      return botao;
    });
    elementos.eventos.replaceChildren(...botoes);
  }
  estado.eventos.forEach((evento, indice) => {
    const botao = elementos.eventos.children[indice];
    botao.textContent = `${evento.nome} · ${moeda.format(evento.preco)}`;
    botao.setAttribute("aria-pressed", String(evento.id === estado.eventoId));
    botao.disabled = Boolean(estado.carrinho) && evento.id !== estado.eventoId;
  });
  const atual = eventoAtual();
  elementos.resumo.textContent = atual ? `${atual.disponivel} de ${atual.capacidade} livres` : "";
}

function situacao(poltrona) {
  if (estado.carrinho?.poltronas.includes(poltrona)) return ["sua", "S", "sua"];
  if (estado.mapa.vendidas.includes(poltrona)) return ["vendida", "X", "vendida"];
  if (estado.mapa.bloqueadas.includes(poltrona)) return ["bloqueada", "B", "bloqueada"];
  return ["livre", String(poltrona).padStart(2, "0"), "livre"];
}

function renderizarMapa() {
  const evento = eventoAtual();
  if (!evento) return;
  if (elementos.mapa.children.length !== evento.capacidade) {
    const botoes = Array.from({ length: evento.capacidade }, (_, indice) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.dataset.poltrona = String(indice + 1);
      botao.addEventListener("click", () => clicarPoltrona(indice + 1));
      return botao;
    });
    elementos.mapa.replaceChildren(...botoes);
  }
  [...elementos.mapa.children].forEach((botao) => {
    const poltrona = Number(botao.dataset.poltrona);
    const [classe, texto, descricao] = situacao(poltrona);
    botao.className = `poltrona ${classe}`;
    botao.textContent = texto;
    botao.setAttribute("aria-label", `Poltrona ${poltrona}, ${descricao}`);
    botao.disabled = estado.pagando || classe === "vendida" || classe === "bloqueada";
  });
}

function criarCampo(rotulo, tipo, valor, aoMudar, extras = {}) {
  const label = document.createElement("label");
  const texto = document.createElement("span");
  const input = document.createElement("input");
  texto.textContent = rotulo;
  input.type = tipo;
  Object.assign(input, extras);
  if (tipo === "checkbox") input.checked = valor;
  else input.value = valor;
  input.addEventListener("input", () => aoMudar(tipo === "checkbox" ? input.checked : input.value));
  label.append(...(tipo === "checkbox" ? [input, texto] : [texto, input]));
  return label;
}

function renderizarCarrinho() {
  const poltronas = estado.carrinho?.poltronas ?? [];
  elementos.vazio.hidden = poltronas.length > 0;
  elementos.form.hidden = poltronas.length === 0;
  const blocos = [...poltronas].sort((a, b) => a - b).map((poltrona) => {
    const dados = dadosDaPoltrona(poltrona);
    const bloco = document.createElement("fieldset");
    const legenda = document.createElement("legend");
    legenda.textContent = `Poltrona ${String(poltrona).padStart(2, "0")}`;

    const campos = document.createElement("div");
    campos.className = "campos";
    campos.append(
      criarCampo("Nome", "text", dados.nome, (valor) => { dados.nome = valor; }, { required: true, maxLength: 80 }),
      criarCampo("Idade", "number", dados.idade, (valor) => { dados.idade = valor; }, { required: true, min: 0, max: 130, step: 1 }),
    );

    const opcoes = document.createElement("div");
    opcoes.className = "opcoes";
    opcoes.append(
      criarCampo("Estudante", "checkbox", dados.estudante, (valor) => { dados.estudante = valor; }),
      criarCampo("PCD", "checkbox", dados.pcd, (valor) => { dados.pcd = valor; }),
    );

    bloco.append(legenda, campos, opcoes);
    return bloco;
  });
  elementos.pessoas.replaceChildren(...blocos);
  atualizarContador();
}

function atualizarContador() {
  if (!estado.carrinho) {
    elementos.contador.textContent = "";
    return;
  }
  const segundos = Math.max(0, Math.ceil((estado.expiraNoRelogio - performance.now()) / 1000));
  const minutos = String(Math.floor(segundos / 60)).padStart(2, "0");
  elementos.contador.textContent = `${minutos}:${String(segundos % 60).padStart(2, "0")}`;
  if (segundos === 0 && !estado.pagando) {
    definirCarrinho(null);
    avisar("Prazo encerrado. Suas poltronas foram liberadas.");
    atualizarDados();
  }
}

async function atualizarDados() {
  const eventoId = estado.eventoId;
  if (eventoId === null) return;
  try {
    const [eventos, mapa] = await Promise.all([
      api("/eventos"),
      api(`/eventos/${eventoId}/poltronas`),
    ]);
    if (eventoId !== estado.eventoId) return;
    estado.eventos = eventos;
    estado.mapa = mapa;
    renderizarEventos();
    renderizarMapa();
  } catch {
    avisar("Não foi possível atualizar o mapa.");
  }
}

function tratarErro(erro) {
  if (erro.status === 404 && estado.carrinho) {
    definirCarrinho(null);
    avisar("Seu carrinho expirou e as poltronas foram liberadas.");
  } else if (erro.status === 409) {
    avisar("Essa poltrona acabou de ser escolhida.");
  } else {
    avisar(erro.message);
  }
}

async function selecionarEvento(eventoId) {
  if (estado.carrinho) return;
  estado.eventoId = eventoId;
  estado.mapa = { vendidas: [], bloqueadas: [] };
  elementos.mapa.replaceChildren();
  elementos.comprovante.hidden = true;
  avisar("");
  renderizarEventos();
  renderizarMapa();
  await atualizarDados();
}

async function clicarPoltrona(poltrona) {
  if (estado.ocupado || estado.pagando) return;
  estado.ocupado = true;
  elementos.comprovante.hidden = true;
  avisar("");
  try {
    const token = estado.carrinho?.token;
    if (estado.carrinho?.poltronas.includes(poltrona)) {
      definirCarrinho(await api(`/carrinhos/${token}/poltronas/${poltrona}`, "DELETE"));
    } else if (token) {
      definirCarrinho(await api(`/carrinhos/${token}/poltronas`, "POST", { poltrona }));
    } else {
      definirCarrinho(await api("/carrinhos", "POST", { eventoId: estado.eventoId, poltrona }));
    }
  } catch (erro) {
    tratarErro(erro);
  } finally {
    estado.ocupado = false;
    await atualizarDados();
  }
}

function mostrarComprovante(comprovante) {
  const itens = comprovante.ingressos.map((ingresso) => {
    const item = document.createElement("li");
    item.textContent = `${ingresso.nome}, poltrona ${ingresso.poltrona}, ${ingresso.tipo}: ${moeda.format(ingresso.valor)}`;
    return item;
  });
  elementos.itens.replaceChildren(...itens);
  elementos.total.textContent = moeda.format(comprovante.total);
  elementos.comprovante.hidden = false;
}

async function pagar(evento) {
  evento.preventDefault();
  if (!estado.carrinho || estado.pagando) return;
  const { token, poltronas } = estado.carrinho;
  const ingressos = poltronas.map((poltrona) => {
    const dados = dadosDaPoltrona(poltrona);
    return { ...dados, idade: Number(dados.idade), poltrona };
  });

  estado.pagando = true;
  elementos.pagar.disabled = true;
  elementos.pagar.textContent = "Pagando...";
  renderizarMapa();
  avisar("");
  try {
    const comprovante = await api(`/carrinhos/${token}/pagamento`, "POST", { ingressos });
    estado.pagando = false;
    definirCarrinho(null);
    mostrarComprovante(comprovante);
    avisar("Pagamento aprovado.");
  } catch (erro) {
    estado.pagando = false;
    if (erro.status === 502) {
      elementos.pagar.textContent = "Tentar novamente";
      avisar("Pagamento recusado. Suas poltronas continuam bloqueadas.");
      await restaurarCarrinho(token, true);
    } else {
      elementos.pagar.textContent = "Pagar";
      tratarErro(erro);
    }
  } finally {
    elementos.pagar.disabled = false;
    renderizarMapa();
    await atualizarDados();
  }
}

async function restaurarCarrinho(token, manterBotao = false) {
  try {
    const carrinho = await api(`/carrinhos/${token}`);
    estado.carrinho = carrinho;
    estado.eventoId = carrinho.eventoId;
    estado.expiraNoRelogio = performance.now() + carrinho.restanteMs;
    if (!manterBotao) definirCarrinho(carrinho);
    else atualizarContador();
  } catch (erro) {
    if (erro.status === 404) {
      definirCarrinho(null);
      avisar("Seu carrinho expirou e as poltronas foram liberadas.");
    } else {
      avisar("Não foi possível recuperar seu carrinho.");
    }
  }
}

async function iniciar() {
  elementos.form.addEventListener("submit", pagar);
  try {
    estado.eventos = await api("/eventos");
    estado.eventoId = estado.eventos[0]?.id ?? null;
    const token = sessionStorage.getItem(CHAVE_TOKEN);
    if (token) await restaurarCarrinho(token);
    renderizarEventos();
    renderizarMapa();
    await atualizarDados();
  } catch {
    avisar("Não foi possível carregar os eventos.");
  }
  setInterval(atualizarDados, INTERVALO_MAPA_MS);
  setInterval(atualizarContador, 250);
}

iniciar();
