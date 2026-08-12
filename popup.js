const $ = (id) => document.getElementById(id);
const weatherForm = $('weatherForm'), cityInput = $('cityInput'), weatherStatus = $('weatherStatus'), weatherResult = $('weatherResult');
const routeForm = $('routeForm'), originInput = $('originInput'), destinationInput = $('destinationInput'), routeStatus = $('routeStatus');
const routeResult = $('routeResult'), distanceValue = $('distanceValue'), routePlaces = $('routePlaces'), mapsBtn = $('mapsBtn');
const weatherDashboard = $('weatherDashboard'), dashboardStatus = $('dashboardStatus'), refreshDashboard = $('refreshDashboard');
const DEFAULT_CITIES = [
  { name: 'São Paulo', admin1: 'São Paulo', country: 'Brasil', latitude: -23.5475, longitude: -46.6361 },
  { name: 'Rio de Janeiro', admin1: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9064, longitude: -43.1822 },
  { name: 'Curitiba', admin1: 'Paraná', country: 'Brasil', latitude: -25.4278, longitude: -49.2731 },
  { name: 'Belo Horizonte', admin1: 'Minas Gerais', country: 'Brasil', latitude: -19.9208, longitude: -43.9378 }
];
const selectedPlaces = new WeakMap();
const operations = new Map();
let route = null;

setupAutocomplete(cityInput, $('citySuggestions'));
setupAutocomplete(originInput, $('originSuggestions'));
setupAutocomplete(destinationInput, $('destinationSuggestions'));
refreshDashboard.addEventListener('click', loadDashboard);
loadDashboard();

weatherForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = weatherForm.querySelector('button[type="submit"]');
  weatherResult.hidden = true;
  status(weatherStatus, 'Buscando previsão…');
  setLoading(button, true, 'Buscando…');
  const signal = startOperation('weather');
  try {
    const place = await resolveInput(cityInput, signal);
    const data = await weather(place.latitude, place.longitude, signal);
    if (!isCurrentOperation('weather', signal)) return;
    renderWeather(place, data);
    status(weatherStatus, '');
  } catch (error) {
    if (isAbort(error)) return;
    status(weatherStatus, errorMessage(error, 'Não foi possível consultar o clima.'), true);
  } finally {
    if (isCurrentOperation('weather', signal)) setLoading(button, false);
  }
});

routeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = routeForm.querySelector('button[type="submit"]');
  routeResult.hidden = true;
  route = null;
  status(routeStatus, 'Calculando distância…');
  setLoading(button, true, 'Calculando…');
  const signal = startOperation('route');
  try {
    const [origin, destination] = await Promise.all([
      resolveInput(originInput, signal),
      resolveInput(destinationInput, signal)
    ]);
    if (!isCurrentOperation('route', signal)) return;
    const distance = haversine(origin, destination);
    if (!Number.isFinite(distance)) throw new Error('As coordenadas retornadas são inválidas.');
    route = { origin, destination };
    distanceValue.textContent = `${distance.toFixed(1)} km`;
    routePlaces.textContent = `${placeName(origin)} → ${placeName(destination)}`;
    routeResult.hidden = false;
    status(routeStatus, '');
  } catch (error) {
    if (isAbort(error)) return;
    status(routeStatus, errorMessage(error, 'Não foi possível calcular a distância.'), true);
  } finally {
    if (isCurrentOperation('route', signal)) setLoading(button, false);
  }
});

mapsBtn.addEventListener('click', () => {
  if (!route) return;
  const origin = encodeURIComponent(`${route.origin.latitude},${route.origin.longitude}`);
  const destination = encodeURIComponent(`${route.destination.latitude},${route.destination.longitude}`);
  const opened = window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`, '_blank', 'noopener');
  if (opened) opened.opener = null;
});

async function loadDashboard() {
  const signal = startOperation('dashboard');
  setLoading(refreshDashboard, true);
  weatherDashboard.setAttribute('aria-busy', 'true');
  status(dashboardStatus, 'Atualizando cidades…');
  try {
    const results = await Promise.allSettled(DEFAULT_CITIES.map(async (place) => ({
      place,
      data: await weather(place.latitude, place.longitude, signal)
    })));
    if (!isCurrentOperation('dashboard', signal)) return;
    weatherDashboard.replaceChildren();
    results.forEach((result) => {
      if (result.status === 'fulfilled') weatherDashboard.append(createCityCard(result.value.place, result.value.data));
    });
    const failures = results.filter((result) => result.status === 'rejected' && !isAbort(result.reason)).length;
    status(dashboardStatus, failures ? `${failures} cidade(s) não puderam ser atualizadas.` : '', failures === results.length);
  } catch (error) {
    if (!isAbort(error)) status(dashboardStatus, errorMessage(error, 'Não foi possível atualizar as cidades.'), true);
  } finally {
    if (isCurrentOperation('dashboard', signal)) {
      weatherDashboard.setAttribute('aria-busy', 'false');
      setLoading(refreshDashboard, false);
    }
  }
}

function createCityCard(place, data) {
  const current = data.current || {}, daily = data.daily || {};
  const button = el('button', 'city-card');
  button.type = 'button';
  button.setAttribute('aria-label', `Ver previsão completa de ${place.name}`);
  button.append(
    el('strong', 'city-card-name', place.name),
    el('span', 'city-card-temp', temperature(current.temperature_2m)),
    el('span', 'city-card-icon', weatherIcon(current.weather_code)),
    el('span', 'city-card-rain', `Chuva ${percent(first(daily.precipitation_probability_max))}`)
  );
  button.addEventListener('click', async () => {
    cityInput.value = placeName(place);
    selectedPlaces.set(cityInput, { label: cityInput.value, place });
    weatherResult.hidden = true;
    status(weatherStatus, 'Carregando detalhes…');
    const submit = weatherForm.querySelector('button[type="submit"]');
    setLoading(submit, true, 'Buscando…');
    const signal = startOperation('weather');
    try {
      const details = await weather(place.latitude, place.longitude, signal);
      if (!isCurrentOperation('weather', signal)) return;
      renderWeather(place, details);
      status(weatherStatus, '');
      weatherResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      if (!isAbort(error)) status(weatherStatus, errorMessage(error, 'Não foi possível consultar o clima.'), true);
    } finally {
      if (isCurrentOperation('weather', signal)) setLoading(submit, false);
    }
  });
  return button;
}

function setupAutocomplete(input, list) {
  let timer, controller, suggestions = [], activeIndex = -1;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };
  const select = (place) => {
    const label = placeName(place);
    input.value = label;
    selectedPlaces.set(input, { label, place });
    close();
  };
  const highlight = (index) => {
    activeIndex = index;
    [...list.children].forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    const active = list.children[index];
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  };
  const render = () => {
    list.replaceChildren();
    suggestions.forEach((place, index) => {
      const option = el('li', 'suggestion');
      option.id = `${list.id}-option-${index}`;
      option.role = 'option';
      option.setAttribute('aria-selected', 'false');
      option.append(el('strong', '', place.name), el('span', '', [place.admin1, place.country].filter(Boolean).join(', ')));
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        select(place);
      });
      list.append(option);
    });
    list.hidden = suggestions.length === 0;
    input.setAttribute('aria-expanded', String(suggestions.length > 0));
  };
  input.addEventListener('input', () => {
    selectedPlaces.delete(input);
    clearTimeout(timer);
    controller?.abort();
    const query = input.value.trim();
    if (query.length < 2) {
      suggestions = [];
      render();
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        suggestions = await geocodeMany(query, controller.signal);
        activeIndex = -1;
        render();
      } catch (error) {
        if (!isAbort(error)) {
          suggestions = [];
          render();
        }
      }
    }, 350);
  });
  input.addEventListener('keydown', (event) => {
    if (list.hidden || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlight((activeIndex + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight((activeIndex - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 100));
}

async function resolveInput(input, signal) {
  const selected = selectedPlaces.get(input);
  if (selected?.label === input.value) return selected.place;
  return geocode(input.value.trim(), signal);
}

async function geocode(query, signal) {
  if (!query) throw new Error('Preencha o local.');
  const results = await geocodeMany(query, signal, 1);
  if (!results.length) throw new Error(`Local não encontrado: ${query}`);
  return results[0];
}

async function geocodeMany(query, signal, count = 6) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  Object.entries({ name: query, count, language: 'pt', format: 'json' }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchWithTimeout(url, signal);
  if (!response.ok) throw new Error('Falha ao localizar o lugar.');
  const data = await response.json();
  return (data.results || []).map(normalizePlace).filter(validPlace);
}

async function weather(latitude, longitude, signal) {
  if (![latitude, longitude].every(Number.isFinite)) throw new Error('Coordenadas inválidas.');
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');
  const response = await fetchWithTimeout(url, signal);
  if (!response.ok) throw new Error('Falha ao consultar a previsão.');
  const data = await response.json();
  if (!data.current || !data.daily) throw new Error('A previsão retornou dados incompletos.');
  return data;
}

async function fetchWithTimeout(url, parentSignal, timeout = 10000) {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Tempo limite excedido.', 'TimeoutError')), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.reason?.name === 'TimeoutError') throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

function renderWeather(place, data) {
  const current = data.current || {}, daily = data.daily || {};
  weatherResult.replaceChildren();
  const panel = el('div', 'weather-panel'), top = el('div', 'weather-top'), location = el('div');
  location.append(el('h3', '', placeName(place)), el('p', 'condition', description(current.weather_code)));
  top.append(location, el('div', 'temperature', temperature(current.temperature_2m)));
  const grid = el('div', 'metrics-grid');
  const metrics = [
    ['Sensação', temperature(current.apparent_temperature)],
    ['Máx. / mín.', `${degree(first(daily.temperature_2m_max))} / ${degree(first(daily.temperature_2m_min))}`],
    ['Umidade', percent(current.relative_humidity_2m)],
    ['Vento', unit(current.wind_speed_10m, 'km/h')],
    ['Rajadas', unit(current.wind_gusts_10m, 'km/h')],
    ['Precipitação', unit(current.precipitation, 'mm', 1)],
    ['Chance de chuva', percent(first(daily.precipitation_probability_max))],
    ['Índice UV', formatNumber(first(daily.uv_index_max), 1)],
    ['Nascer do sol', time(first(daily.sunrise))],
    ['Pôr do sol', time(first(daily.sunset))]
  ];
  metrics.forEach(([label, value]) => {
    const item = el('div', 'metric');
    item.append(el('span', '', label), el('strong', '', value));
    grid.append(item);
  });
  panel.append(top, grid);
  weatherResult.append(panel);
  weatherResult.hidden = false;
}

function startOperation(name) {
  operations.get(name)?.abort();
  const controller = new AbortController();
  operations.set(name, controller);
  return controller.signal;
}

function isCurrentOperation(name, signal) {
  return operations.get(name)?.signal === signal;
}

function normalizePlace(place) {
  return { name: place.name || '', admin1: place.admin1 || '', country: place.country || '', latitude: numeric(place.latitude), longitude: numeric(place.longitude) };
}

function validPlace(place) {
  return Boolean(place.name) && [place.latitude, place.longitude].every(Number.isFinite);
}

function setLoading(button, loading, loadingText) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = loading;
  button.textContent = loading && loadingText ? loadingText : button.dataset.label;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function status(node, message, error = false) {
  node.textContent = message;
  node.classList.toggle('error', error);
}

function placeName(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

function first(value) {
  return Array.isArray(value) ? value[0] : undefined;
}

function formatNumber(value, decimals = 0) {
  const number = numeric(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '—';
}

function degree(value) {
  const number = numeric(value);
  return Number.isFinite(number) ? `${Math.round(number)}°` : '—';
}

function temperature(value) {
  const number = numeric(value);
  return Number.isFinite(number) ? `${Math.round(number)}°C` : '—';
}

function percent(value) {
  const number = numeric(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : '—';
}

function unit(value, suffix, decimals = 0) {
  const number = numeric(value);
  return Number.isFinite(number) ? `${number.toFixed(decimals)} ${suffix}` : '—';
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

function time(value) {
  return typeof value === 'string' ? value.split('T')[1]?.slice(0, 5) || '—' : '—';
}

function description(code) {
  return ({
    0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Neblina', 48: 'Neblina com geada', 51: 'Garoa leve', 53: 'Garoa moderada', 55: 'Garoa intensa',
    56: 'Garoa congelante leve', 57: 'Garoa congelante intensa', 61: 'Chuva leve', 63: 'Chuva moderada',
    65: 'Chuva forte', 66: 'Chuva congelante leve', 67: 'Chuva congelante forte', 71: 'Neve leve',
    73: 'Neve moderada', 75: 'Neve forte', 77: 'Grãos de neve', 80: 'Pancadas leves',
    81: 'Pancadas moderadas', 82: 'Pancadas fortes', 85: 'Pancadas de neve leves', 86: 'Pancadas de neve fortes',
    95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada forte com granizo'
  })[code] || 'Condição não identificada';
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  return '🌡️';
}

function haversine(a, b) {
  if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return NaN;
  const radius = 6371, radians = (value) => value * Math.PI / 180;
  const latitude = radians(b.latitude - a.latitude), longitude = radians(b.longitude - a.longitude);
  const raw = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  const h = Math.min(1, Math.max(0, raw));
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isAbort(error) {
  return error?.name === 'AbortError';
}

function errorMessage(error, fallback) {
  return error?.name === 'TimeoutError' ? 'A consulta demorou demais. Tente novamente.' : error?.message || fallback;
}
