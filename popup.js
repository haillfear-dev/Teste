const $ = (id) => document.getElementById(id);
const weatherForm = $('weatherForm'), cityInput = $('cityInput'), weatherStatus = $('weatherStatus'), weatherResult = $('weatherResult');
const routeForm = $('routeForm'), originInput = $('originInput'), destinationInput = $('destinationInput'), routeStatus = $('routeStatus');
const routeResult = $('routeResult'), distanceValue = $('distanceValue'), routePlaces = $('routePlaces'), mapsBtn = $('mapsBtn');
let route = null;

weatherForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  weatherResult.hidden = true;
  status(weatherStatus, 'Buscando previsão…');
  try {
    const place = await geocode(cityInput.value.trim());
    const data = await weather(place.latitude, place.longitude);
    renderWeather(place, data);
    status(weatherStatus, '');
  } catch (err) {
    status(weatherStatus, err.message || 'Não foi possível consultar o clima.', true);
  }
});

routeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  routeResult.hidden = true;
  status(routeStatus, 'Calculando distância…');
  try {
    const [origin, destination] = await Promise.all([
      geocode(originInput.value.trim()),
      geocode(destinationInput.value.trim())
    ]);
    route = { origin, destination };
    distanceValue.textContent = `${haversine(origin, destination).toFixed(1)} km`;
    routePlaces.textContent = `${placeName(origin)} → ${placeName(destination)}`;
    routeResult.hidden = false;
    status(routeStatus, '');
  } catch (err) {
    route = null;
    status(routeStatus, err.message || 'Não foi possível calcular a distância.', true);
  }
});

mapsBtn.addEventListener('click', () => {
  if (!route) return;
  const origin = encodeURIComponent(`${route.origin.latitude},${route.origin.longitude}`);
  const destination = encodeURIComponent(`${route.destination.latitude},${route.destination.longitude}`);
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`, '_blank');
});

async function geocode(query) {
  if (!query) throw new Error('Preencha o local.');
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  Object.entries({ name: query, count: 1, language: 'pt', format: 'json' }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao localizar o lugar.');
  const data = await res.json();
  if (!data.results?.length) throw new Error(`Local não encontrado: ${query}`);
  const p = data.results[0];
  return { name: p.name, admin1: p.admin1 || '', country: p.country || '', latitude: p.latitude, longitude: p.longitude };
}

async function weather(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao consultar a previsão.');
  const data = await res.json();
  if (!data.current || !data.daily) throw new Error('A previsão retornou dados incompletos.');
  return data;
}

function renderWeather(place, data) {
  const c = data.current, d = data.daily;
  weatherResult.replaceChildren();
  const panel = el('div', 'weather-panel');
  const top = el('div', 'weather-top');
  const location = el('div');
  location.append(el('h3', '', placeName(place)), el('p', 'condition', description(c.weather_code)));
  top.append(location, el('div', 'temperature', `${Math.round(c.temperature_2m)}°C`));
  const grid = el('div', 'metrics-grid');
  const metrics = [
    ['Sensação', `${Math.round(c.apparent_temperature)}°C`],
    ['Máx. / mín.', `${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°`],
    ['Umidade', `${Math.round(c.relative_humidity_2m)}%`],
    ['Vento', `${Math.round(c.wind_speed_10m)} km/h`],
    ['Rajadas', `${Math.round(c.wind_gusts_10m)} km/h`],
    ['Precipitação', `${num(c.precipitation)} mm`],
    ['Chance de chuva', `${Math.round(d.precipitation_probability_max[0] ?? 0)}%`],
    ['Índice UV', num(d.uv_index_max[0], 1)],
    ['Nascer do sol', time(d.sunrise[0])],
    ['Pôr do sol', time(d.sunset[0])]
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

function placeName(p) {
  return [p.name, p.admin1, p.country].filter(Boolean).join(', ');
}

function num(value, decimals = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : '—';
}

function time(value) {
  return value?.split('T')[1]?.slice(0, 5) || '—';
}

function description(code) {
  return ({
    0:'Céu limpo',1:'Predominantemente limpo',2:'Parcialmente nublado',3:'Nublado',
    45:'Neblina',48:'Neblina com geada',51:'Garoa leve',53:'Garoa moderada',55:'Garoa intensa',
    61:'Chuva leve',63:'Chuva moderada',65:'Chuva forte',71:'Neve leve',73:'Neve moderada',75:'Neve forte',
    80:'Pancadas leves',81:'Pancadas moderadas',82:'Pancadas fortes',95:'Trovoada',96:'Trovoada com granizo',99:'Trovoada forte com granizo'
  })[code] || 'Condição não identificada';
}

function haversine(a, b) {
  const r = 6371, rad = (x) => x * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
