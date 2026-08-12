// Elementos do DOM
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const resultDiv = document.getElementById('result');

// Adiciona listener ao botão de busca
searchBtn.addEventListener('click', searchWeather);

// Permite buscar pressionando Enter no campo de entrada
cityInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    searchWeather();
  }
});

// Função principal de busca de clima
async function searchWeather() {
  const cityName = cityInput.value.trim();

  // Validação: verifica se o campo foi preenchido
  if (!cityName) {
    showError('Por favor, digite uma cidade.');
    return;
  }

  // Mostra mensagem de carregamento
  showLoading();

  try {
    // PASSO 1: Busca as coordenadas (latitude e longitude) da cidade
    const coordinates = await getCoordinates(cityName);

    if (!coordinates) {
      showError('Cidade não encontrada.');
      return;
    }

    // PASSO 2: Com as coordenadas, busca os dados meteorológicos
    const weatherData = await getWeatherData(coordinates.latitude, coordinates.longitude);

    if (!weatherData) {
      showError('Não foi possível consultar o clima.');
      return;
    }

    // PASSO 3: Exibe os dados no painel
    displayWeather(cityName, weatherData);

  } catch (error) {
    console.error('Erro:', error);
    showError('Não foi possível consultar o clima.');
  }
}

// Busca as coordenadas (latitude/longitude) da cidade usando a API de geocodificação
async function getCoordinates(cityName) {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pt`
    );

    if (!response.ok) {
      throw new Error('Erro na API de geocodificação');
    }

    const data = await response.json();

    // Verifica se encontrou a cidade
    if (!data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    return {
      latitude: result.latitude,
      longitude: result.longitude
    };

  } catch (error) {
    console.error('Erro ao buscar coordenadas:', error);
    return null;
  }
}

// Busca os dados meteorológicos usando latitude e longitude
async function getWeatherData(latitude, longitude) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`
    );

    if (!response.ok) {
      throw new Error('Erro na API meteorológica');
    }

    const data = await response.json();

    if (!data.current) {
      return null;
    }

    return data.current;

  } catch (error) {
    console.error('Erro ao buscar clima:', error);
    return null;
  }
}

// Converte o código de clima para descrição legível
function getWeatherDescription(weatherCode) {
  const weatherCodes = {
    0: 'Céu limpo',
    1: 'Principalmente céu limpo',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Neblina',
    48: 'Neblina com geada',
    51: 'Chuva leve',
    53: 'Chuva moderada',
    55: 'Chuva forte',
    61: 'Chuva',
    63: 'Chuva moderada',
    65: 'Chuva forte',
    71: 'Neve leve',
    73: 'Neve moderada',
    75: 'Neve forte',
    77: 'Grãos de neve',
    80: 'Chuva leve',
    81: 'Chuva moderada',
    82: 'Chuva forte',
    85: 'Neve leve',
    86: 'Neve forte',
    95: 'Tempestade',
    96: 'Tempestade com granizo',
    99: 'Tempestade com granizo'
  };

  return weatherCodes[weatherCode] || 'Clima desconhecido';
}

// Exibe os dados do clima na interface
function displayWeather(cityName, weatherData) {
  const temperature = Math.round(weatherData.temperature_2m);
  const windSpeed = Math.round(weatherData.wind_speed_10m);
  const weatherDescription = getWeatherDescription(weatherData.weather_code);

  const html = `
    <div class="weather-info">
      <div class="city-name">${cityName}</div>
      <div class="temp">${temperature}°C</div>
      <div class="weather-item">
        ${weatherDescription}
      </div>
      <div class="weather-item">
        Vento: ${windSpeed} km/h
      </div>
    </div>
  `;

  resultDiv.innerHTML = html;
}

// Mostra mensagem de erro
function showError(message) {
  resultDiv.innerHTML = `<div class="error">${message}</div>`;
}

// Mostra mensagem de carregamento
function showLoading() {
  resultDiv.innerHTML = '<div class="loading">Buscando...</div>';
}
