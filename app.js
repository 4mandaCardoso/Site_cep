

const URL_VIACEP = "https://viacep.com.br/ws";
const URL_NOMINATIM = "https://nominatim.openstreetmap.org/search";
const URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

const SIGLAS_UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const TERMOS_GENERICOS = [
  "Rua", "Avenida", "Travessa", "Alameda", "Praça", "Estrada",
  "Rodovia", "Beco", "Largo", "Loteamento", "Conjunto", "Vila",
  "Ladeira", "Caminho", "Via", "Parque", "Residencial", "Condomínio"
];

const CODIGOS_CLIMA = {
  0: ["☀️", "Céu limpo"], 1: ["🌤️", "Predomínio de sol"], 2: ["⛅", "Parcialmente nublado"], 3: ["☁️", "Nublado"],
  45: ["🌫️", "Neblina"], 48: ["🌫️", "Neblina com geada"],
  51: ["🌦️", "Garoa fraca"], 53: ["🌦️", "Garoa"], 55: ["🌦️", "Garoa forte"],
  56: ["🌧️", "Garoa congelante"], 57: ["🌧️", "Garoa congelante forte"],
  61: ["🌧️", "Chuva fraca"], 63: ["🌧️", "Chuva"], 65: ["🌧️", "Chuva forte"],
  66: ["🌧️", "Chuva congelante"], 67: ["🌧️", "Chuva congelante forte"],
  71: ["🌨️", "Neve fraca"], 73: ["🌨️", "Neve"], 75: ["❄️", "Neve forte"], 77: ["❄️", "Granizo fino"],
  80: ["🌦️", "Pancadas fracas"], 81: ["🌧️", "Pancadas de chuva"], 82: ["⛈️", "Pancadas fortes"],
  85: ["🌨️", "Pancadas de neve"], 86: ["❄️", "Pancadas de neve fortes"],
  95: ["⛈️", "Trovoadas"], 96: ["⛈️", "Trovoadas com granizo"], 99: ["⛈️", "Trovoadas com granizo forte"]
};

const DICAS_MODO = {
  cep: "Digite os 8 números do CEP. Exemplo: 45653-000.",
  rua: "Informe estado, cidade e pelo menos 3 letras do nome da rua.",
  bairro: "Informe estado, cidade e o bairro. A lista mostra os CEPs de ruas desse bairro encontradas no ViaCEP.",
  cidade: "Informe estado e cidade. A lista reúne CEPs de ruas da cidade (até 50 por tipo de logradouro)."
};

/* ---------- Elementos ---------- */
const sel = (seletor, raiz = document) => raiz.querySelector(seletor);
const selTodos = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

const formulario = sel("#form-search");
const botao = sel("#btn-search");
const dica = sel("#hint");
const caixaStatus = sel("#status");
const secaoResultados = sel("#results");
const listaResultados = sel("#list");
const campoFiltro = sel("#filter");
const tituloResultados = sel("#results-title");
const detalheVazio = sel("#detail-empty");
const detalheConteudo = sel("#detail-content");

const campos = {
  cep: sel("#cep"),
  uf: sel("#uf"),
  cidade: sel("#cidade"),
  logradouro: sel("#logradouro"),
  bairro: sel("#bairro")
};

let modo = "cep";
let resultados = [];
let chaveSelecionada = null;
let tokenBusca = 0;
const cacheGeo = new Map();

/* ---------- Utilidades ---------- */
const normalizar = (texto = "") =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const apenasDigitos = (texto = "") => texto.replace(/\D/g, "");

const formatarCep = (cep = "") => {
  const digitos = apenasDigitos(cep);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : cep;
};

const chaveDe = (endereco) =>
  `${apenasDigitos(endereco.cep)}|${normalizar(endereco.logradouro)}|${normalizar(endereco.bairro)}`;

function criarElemento(tag, atributos = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (nome === "class") no.className = valor;
    else if (nome === "text") no.textContent = valor;
    else no.setAttribute(nome, valor);
  }
  [].concat(filhos).forEach((filho) => filho && no.append(filho));
  return no;
}

/* ---------- Status / erros ---------- */
function mostrarStatus(tipo, titulo, mensagem = "") {
  caixaStatus.className = `status status--${tipo}`;
  caixaStatus.replaceChildren(
    criarElemento("div", {}, [
      criarElemento("strong", { text: titulo }),
      mensagem ? criarElemento("span", { text: mensagem }) : null
    ])
  );
  caixaStatus.hidden = false;
}

function limparStatus() {
  caixaStatus.hidden = true;
  caixaStatus.replaceChildren();
}

function definirCarregando(ativo) {
  botao.disabled = ativo;
  botao.classList.toggle("is-loading", ativo);
  sel(".btn__label", botao).textContent = ativo ? "Buscando" : "Pesquisar";
}

function marcarErro(...nomes) {
  selTodos(".field").forEach((campo) => campo.classList.remove("has-error"));
  nomes.forEach((nome) => campos[nome]?.closest(".field")?.classList.add("has-error"));
  if (nomes.length) campos[nomes[0]].focus();
}

/* ---------- Abas ---------- */
function definirModo(novoModo) {
  modo = novoModo;
  selTodos(".tab").forEach((aba) => {
    const ativa = aba.dataset.mode === novoModo;
    aba.classList.toggle("is-active", ativa);
    aba.setAttribute("aria-selected", String(ativa));
  });
  selTodos(".field[data-for]").forEach((campo) => {
    campo.hidden = !campo.dataset.for.split(" ").includes(novoModo);
  });
  dica.textContent = DICAS_MODO[novoModo];
  marcarErro();
  limparStatus();

  // reorganiza colunas conforme o modo
  const larga = novoModo === "cidade";
  sel(".field--city").style.gridColumn = larga ? "span 8" : "";
  sel(".field--uf").style.gridColumn = larga ? "span 2" : "";
  sel(".btn").style.gridColumn = larga ? "span 2" : "";
}

selTodos(".tab").forEach((aba) =>
  aba.addEventListener("click", () => definirModo(aba.dataset.mode))
);

SIGLAS_UF.forEach((sigla) => campos.uf.append(new Option(sigla, sigla)));

campos.cep.addEventListener("input", () => {
  const digitos = apenasDigitos(campos.cep.value).slice(0, 8);
  campos.cep.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
});

/* ---------- ViaCEP ---------- */
async function buscarJson(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function buscarPorCep(cep) {
  const dados = await buscarJson(`${URL_VIACEP}/${cep}/json/`);
  if (dados.erro) return [];
  return [dados];
}

async function buscarPorRua(uf, cidade, logradouro) {
  const url = `${URL_VIACEP}/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(logradouro)}/json/`;
  const dados = await buscarJson(url);
  return Array.isArray(dados) ? dados : [];
}

async function buscarAmplo(uf, cidade, bairro, token) {
  const unidos = new Map();
  let concluidas = 0;

  const tarefas = TERMOS_GENERICOS.map((termo) =>
    buscarPorRua(uf, cidade, termo)
      .catch(() => [])
      .then((linhas) => {
        concluidas += 1;
        if (token === tokenBusca) {
          dica.textContent = `Buscando… ${concluidas} de ${TERMOS_GENERICOS.length} tipos de logradouro`;
        }
        return linhas;
      })
  );

  const todos = (await Promise.all(tarefas)).flat();
  const bairroDesejado = bairro ? normalizar(bairro) : null;

  for (const endereco of todos) {
    if (bairroDesejado && !normalizar(endereco.bairro).includes(bairroDesejado)) continue;
    unidos.set(chaveDe(endereco), endereco);
  }
  return [...unidos.values()];
}

function ordenarResultados(linhas) {
  return linhas.sort((a, b) =>
    normalizar(a.bairro).localeCompare(normalizar(b.bairro)) ||
    normalizar(a.logradouro).localeCompare(normalizar(b.logradouro))
  );
}

/* ---------- Envio ---------- */
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  marcarErro();
  limparStatus();

  const cep = apenasDigitos(campos.cep.value);
  const uf = campos.uf.value;
  const cidade = campos.cidade.value.trim();
  const logradouro = campos.logradouro.value.trim();
  const bairro = campos.bairro.value.trim();

  // validação
  if (modo === "cep" && cep.length !== 8) {
    marcarErro("cep");
    return mostrarStatus("error", "CEP inválido", "Digite os 8 números do CEP, por exemplo 45653-000.");
  }
  if (modo !== "cep") {
    if (!uf) {
      marcarErro("uf");
      return mostrarStatus("error", "Escolha o estado", "A busca por endereço precisa da UF.");
    }
    if (cidade.length < 2) {
      marcarErro("cidade");
      return mostrarStatus("error", "Informe a cidade", "Digite o nome da cidade.");
    }
  }
  if (modo === "rua" && normalizar(logradouro).length < 3) {
    marcarErro("logradouro");
    return mostrarStatus("error", "Nome da rua muito curto", "Digite pelo menos 3 letras.");
  }
  if (modo === "bairro" && normalizar(bairro).length < 2) {
    marcarErro("bairro");
    return mostrarStatus("error", "Informe o bairro", "Digite o nome do bairro.");
  }

  const token = ++tokenBusca;
  definirCarregando(true);
  secaoResultados.hidden = true;

  try {
    let linhas = [];
    let rotulo = "";

    if (modo === "cep") {
      linhas = await buscarPorCep(cep);
      rotulo = `CEP ${formatarCep(cep)}`;
    } else if (modo === "rua") {
      linhas = await buscarPorRua(uf, cidade, logradouro);
      rotulo = `“${logradouro}” em ${cidade}/${uf}`;
    } else if (modo === "bairro") {
      linhas = await buscarAmplo(uf, cidade, bairro, token);
      rotulo = `Bairro ${bairro} em ${cidade}/${uf}`;
    } else {
      linhas = await buscarAmplo(uf, cidade, null, token);
      rotulo = `${cidade}/${uf}`;
    }

    if (token !== tokenBusca) return;

    if (!linhas.length) {
      const mensagem = {
        cep: "Confira o número digitado. Esse CEP não existe na base do ViaCEP.",
        rua: "Verifique a grafia da rua, a cidade e o estado.",
        bairro: "Verifique a grafia do bairro, da cidade e do estado. O ViaCEP pode não ter ruas cadastradas com esse bairro.",
        cidade: "Verifique a grafia da cidade e do estado."
      }[modo];
      return mostrarStatus("error", "Nenhum CEP encontrado", mensagem);
    }

    resultados = ordenarResultados(linhas);
    exibirResultados(rotulo);
  } catch (erro) {
    if (token !== tokenBusca) return;
    const consultaInvalida = String(erro.message).includes("400");
    mostrarStatus(
      "error",
      consultaInvalida ? "Consulta inválida" : "Não foi possível consultar o ViaCEP",
      consultaInvalida
        ? "Revise os dados informados e tente de novo."
        : "Verifique sua conexão e tente novamente em instantes."
    );
  } finally {
    if (token === tokenBusca) {
      definirCarregando(false);
      dica.textContent = DICAS_MODO[modo];
    }
  }
});

/* ---------- Resultados ---------- */
function exibirResultados(rotulo) {
  chaveSelecionada = null;
  campoFiltro.value = "";
  campoFiltro.hidden = resultados.length < 8;
  tituloResultados.textContent = `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`;
  tituloResultados.title = rotulo;

  desenharLista(resultados);
  secaoResultados.hidden = false;
  detalheVazio.hidden = false;
  detalheConteudo.hidden = true;

  if (resultados.length === 1) selecionarResultado(resultados[0]);
  secaoResultados.scrollIntoView({ behavior: "smooth", block: "start" });
}

function desenharLista(linhas) {
  listaResultados.replaceChildren();

  if (!linhas.length) {
    listaResultados.append(criarElemento("li", { class: "weather__note", text: "Nenhum resultado com esse filtro." }));
    return;
  }

  linhas.forEach((endereco) => {
    const chave = chaveDe(endereco);
    const local = [endereco.bairro, `${endereco.localidade}/${endereco.uf}`].filter(Boolean).join(" — ");
    const item = criarElemento("button", { class: "item", type: "button" }, [
      criarElemento("span", { class: "item__street", text: endereco.logradouro || "Endereço geral da cidade" }),
      criarElemento("span", { class: "item__cep", text: formatarCep(endereco.cep) }),
      criarElemento("span", { class: "item__place", text: local })
    ]);
    item.dataset.chave = chave;
    if (chave === chaveSelecionada) item.setAttribute("aria-current", "true");
    item.addEventListener("click", () => selecionarResultado(endereco));
    listaResultados.append(criarElemento("li", {}, item));
  });
}

campoFiltro.addEventListener("input", () => {
  const termo = normalizar(campoFiltro.value);
  desenharLista(
    termo
      ? resultados.filter((e) => normalizar(`${e.logradouro} ${e.bairro} ${e.cep}`).includes(termo))
      : resultados
  );
});

/* ---------- Detalhe: dados, mapa, clima ---------- */
function selecionarResultado(endereco) {
  chaveSelecionada = chaveDe(endereco);
  selTodos(".item", listaResultados).forEach((item) => {
    if (item.dataset.chave === chaveSelecionada) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });

  detalheVazio.hidden = true;
  detalheConteudo.hidden = false;

  sel("#d-cep").textContent = formatarCep(endereco.cep);
  sel("#d-street").textContent = endereco.logradouro || "Endereço geral da cidade";
  sel("#d-place").textContent = [endereco.bairro, `${endereco.localidade} - ${endereco.uf}`].filter(Boolean).join(", ");

  const listaMeta = sel("#d-meta");
  listaMeta.replaceChildren();
  const informacoes = [
    ["Complemento", endereco.complemento],
    ["Bairro", endereco.bairro],
    ["Cidade", endereco.localidade],
    ["Estado", endereco.uf],
    ["DDD", endereco.ddd],
    ["Código IBGE", endereco.ibge]
  ].filter(([, valor]) => valor);
  informacoes.forEach(([nome, valor]) =>
    listaMeta.append(criarElemento("div", {}, [criarElemento("dt", { text: nome }), criarElemento("dd", { text: valor })]))
  );

  atualizarMapa(endereco);
  carregarClima(endereco);

  if (window.matchMedia("(max-width: 900px)").matches) {
    detalheConteudo.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function atualizarMapa(endereco) {
  const consulta = [endereco.logradouro, endereco.bairro, endereco.localidade, endereco.uf, "Brasil"]
    .filter(Boolean)
    .join(", ");
  const consultaCodificada = encodeURIComponent(consulta);
  sel("#d-map").src = `https://www.google.com/maps?q=${consultaCodificada}&output=embed&hl=pt-BR`;
  sel("#d-maplink").href = `https://www.google.com/maps/search/?api=1&query=${consultaCodificada}`;
}

async function geocodificarCidade(cidade, uf) {
  const chave = `${normalizar(cidade)}|${uf}`;
  if (cacheGeo.has(chave)) return cacheGeo.get(chave);

  const url = `${URL_NOMINATIM}?format=jsonv2&limit=1&countrycodes=br&city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}&country=Brasil`;
  let dados = await buscarJson(url);

  if (!dados.length) {
    dados = await buscarJson(`${URL_NOMINATIM}?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(`${cidade}, ${uf}, Brasil`)}`);
  }
  if (!dados.length) throw new Error("Local não encontrado");

  const ponto = { latitude: parseFloat(dados[0].lat), longitude: parseFloat(dados[0].lon) };
  cacheGeo.set(chave, ponto);
  return ponto;
}

async function carregarClima(endereco) {
  const corpo = sel("#weather-body");
  const chaveDesejada = chaveDe(endereco);
  corpo.replaceChildren(criarElemento("p", { class: "weather__loading", text: "Carregando clima…" }));

  try {
    const { latitude, longitude } = await geocodificarCidade(endereco.localidade, endereco.uf);

    const parametros = new URLSearchParams({
      latitude,
      longitude,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "5"
    });
    const dados = await buscarJson(`${URL_OPEN_METEO}?${parametros}`);

    if (chaveSelecionada !== chaveDesejada) return; // usuário já escolheu outro endereço
    exibirClima(corpo, dados, endereco.localidade);
  } catch {
    if (chaveSelecionada !== chaveDesejada) return;
    corpo.replaceChildren(
      criarElemento("p", { class: "weather__note", text: "Não foi possível carregar o clima agora. O mapa continua disponível." })
    );
  }
}

function exibirClima(corpo, dados, cidade) {
  const atual = dados.current;
  const [icone, descricao] = CODIGOS_CLIMA[atual.weather_code] || ["🌡️", "Condição indisponível"];
  const arredondar = (numero) => Math.round(numero);

  const agora = criarElemento("div", { class: "weather__now" }, [
    criarElemento("div", { class: "weather__icon", "aria-hidden": "true", text: icone }),
    criarElemento("div", {}, [
      criarElemento("div", { class: "weather__temp", text: `${arredondar(atual.temperature_2m)}°C` }),
      criarElemento("div", { class: "weather__desc", text: `${descricao} · ${cidade}` })
    ])
  ]);

  const indicador = (rotulo, valor) =>
    criarElemento("div", {}, [criarElemento("small", { text: rotulo }), criarElemento("b", { text: valor })]);
  const indicadores = criarElemento("div", { class: "weather__stats" }, [
    indicador("Sensação", `${arredondar(atual.apparent_temperature)}°C`),
    indicador("Umidade", `${arredondar(atual.relative_humidity_2m)}%`),
    indicador("Vento", `${arredondar(atual.wind_speed_10m)} km/h`)
  ]);

  const formatoDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  const previsao = criarElemento("div", { class: "forecast" });
  dados.daily.time.forEach((dia, i) => {
    const [iconeDia] = CODIGOS_CLIMA[dados.daily.weather_code[i]] || ["🌡️"];
    const data = new Date(`${dia}T12:00:00`);
    const chuva = dados.daily.precipitation_probability_max[i];
    previsao.append(
      criarElemento("div", { class: "forecast__day", title: chuva != null ? `Chance de chuva: ${chuva}%` : "" }, [
        criarElemento("span", { class: "name", text: i === 0 ? "Hoje" : formatoDiaSemana.format(data).replace(".", "") }),
        criarElemento("span", { class: "ic", "aria-hidden": "true", text: iconeDia }),
        criarElemento("span", { class: "hi", text: `${arredondar(dados.daily.temperature_2m_max[i])}°` }),
        criarElemento("span", { class: "lo", text: `${arredondar(dados.daily.temperature_2m_min[i])}°` })
      ])
    );
  });

  corpo.replaceChildren(agora, indicadores, previsao);
}

/* ---------- Início ---------- */
definirModo("cep");
