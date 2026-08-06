/** Cidades reais por país (valor do select AI_COUNTRIES). */
export const COUNTRY_CITIES: Record<string, readonly string[]> = {
  Brasil: [
    "São Paulo",
    "Rio de Janeiro",
    "Belo Horizonte",
    "Brasília",
    "Curitiba",
    "Porto Alegre",
    "Salvador",
    "Recife",
    "Fortaleza",
    "Manaus",
    "Florianópolis",
    "Goiânia",
    "Campinas",
    "Belém",
    "Vitória",
  ],
  Portugal: [
    "Lisboa",
    "Porto",
    "Braga",
    "Coimbra",
    "Faro",
    "Aveiro",
    "Funchal",
    "Setúbal",
    "Évora",
    "Guimarães",
  ],
  "Estados Unidos": [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Miami",
    "Dallas",
    "Atlanta",
    "Seattle",
    "Boston",
    "Denver",
    "Phoenix",
    "San Francisco",
  ],
  Canadá: [
    "Toronto",
    "Vancouver",
    "Montreal",
    "Calgary",
    "Ottawa",
    "Edmonton",
    "Quebec City",
    "Winnipeg",
    "Halifax",
  ],
  "Reino Unido": [
    "London",
    "Manchester",
    "Birmingham",
    "Edinburgh",
    "Glasgow",
    "Liverpool",
    "Leeds",
    "Bristol",
    "Cardiff",
    "Belfast",
  ],
  Irlanda: ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Kilkenny"],
  Espanha: [
    "Madrid",
    "Barcelona",
    "Valencia",
    "Sevilla",
    "Bilbao",
    "Málaga",
    "Zaragoza",
    "Alicante",
    "Granada",
    "Palma",
  ],
  México: [
    "Ciudad de México",
    "Guadalajara",
    "Monterrey",
    "Puebla",
    "Cancún",
    "Tijuana",
    "León",
    "Mérida",
    "Querétaro",
  ],
  Argentina: [
    "Buenos Aires",
    "Córdoba",
    "Rosario",
    "Mendoza",
    "La Plata",
    "Mar del Plata",
    "Salta",
    "Bariloche",
  ],
  Chile: [
    "Santiago",
    "Valparaíso",
    "Concepción",
    "La Serena",
    "Antofagasta",
    "Puerto Montt",
    "Viña del Mar",
  ],
  Colômbia: [
    "Bogotá",
    "Medellín",
    "Cali",
    "Barranquilla",
    "Cartagena",
    "Bucaramanga",
    "Pereira",
  ],
  França: [
    "Paris",
    "Lyon",
    "Marseille",
    "Toulouse",
    "Nice",
    "Nantes",
    "Bordeaux",
    "Lille",
    "Strasbourg",
    "Montpellier",
    "Rennes",
  ],
  Alemanha: [
    "Berlin",
    "Munich",
    "Hamburg",
    "Cologne",
    "Frankfurt",
    "Stuttgart",
    "Düsseldorf",
    "Leipzig",
    "Dresden",
    "Hannover",
  ],
  Itália: [
    "Rome",
    "Milan",
    "Naples",
    "Turin",
    "Florence",
    "Bologna",
    "Venice",
    "Palermo",
    "Genoa",
    "Verona",
  ],
  "Países Baixos": [
    "Amsterdam",
    "Rotterdam",
    "The Hague",
    "Utrecht",
    "Eindhoven",
    "Groningen",
    "Maastricht",
  ],
  Bélgica: ["Brussels", "Antwerp", "Ghent", "Bruges", "Liège", "Leuven", "Namur"],
  Suíça: ["Zurich", "Geneva", "Basel", "Bern", "Lausanne", "Lucerne", "Lugano"],
  Áustria: ["Vienna", "Salzburg", "Graz", "Innsbruck", "Linz", "Klagenfurt"],
  Polônia: ["Warsaw", "Kraków", "Gdańsk", "Wrocław", "Poznań", "Łódź", "Szczecin"],
  Turquia: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Gaziantep"],
  Japão: [
    "Tokyo",
    "Osaka",
    "Yokohama",
    "Nagoya",
    "Sapporo",
    "Fukuoka",
    "Kyoto",
    "Kobe",
    "Hiroshima",
  ],
  "Coreia do Sul": [
    "Seoul",
    "Busan",
    "Incheon",
    "Daegu",
    "Daejeon",
    "Gwangju",
    "Jeju",
  ],
  China: [
    "Shanghai",
    "Beijing",
    "Shenzhen",
    "Guangzhou",
    "Chengdu",
    "Hangzhou",
    "Nanjing",
    "Wuhan",
  ],
  Austrália: [
    "Sydney",
    "Melbourne",
    "Brisbane",
    "Perth",
    "Adelaide",
    "Canberra",
    "Gold Coast",
  ],
  "Nova Zelândia": ["Auckland", "Wellington", "Christchurch", "Hamilton", "Dunedin"],
  "África do Sul": ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  Singapura: ["Singapore", "Jurong", "Tampines", "Woodlands", "Bedok"],
  Peru: ["Lima", "Arequipa", "Cusco", "Trujillo", "Piura", "Chiclayo"],
  Uruguai: ["Montevideo", "Salto", "Punta del Este", "Maldonado", "Paysandú"],
  Paraguai: ["Asunción", "Ciudad del Este", "Encarnación", "San Lorenzo"],
  Bolívia: ["La Paz", "Santa Cruz", "Cochabamba", "Sucre", "Oruro"],
  Equador: ["Quito", "Guayaquil", "Cuenca", "Ambato", "Manta"],
  Venezuela: ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay"],
  "Costa Rica": ["San José", "Alajuela", "Cartago", "Heredia", "Liberia"],
  Panamá: ["Ciudad de Panamá", "Colón", "David", "Santiago", "Chitré"],
  Guatemala: ["Ciudad de Guatemala", "Quetzaltenango", "Escuintla", "Antigua Guatemala"],
  "República Dominicana": [
    "Santo Domingo",
    "Santiago de los Caballeros",
    "La Romana",
    "Punta Cana",
    "San Pedro de Macorís",
  ],
};

/** Grupos de países (fonte única; reexportado por ai-review-options). */
export const COUNTRY_GROUPS: Record<string, string[]> = {
  global: [
    "Estados Unidos",
    "Reino Unido",
    "Canadá",
    "Irlanda",
    "Austrália",
    "Nova Zelândia",
    "África do Sul",
    "Singapura",
  ],
  latam: [
    "México",
    "Argentina",
    "Chile",
    "Colômbia",
    "Peru",
    "Uruguai",
    "Paraguai",
    "Bolívia",
    "Equador",
    "Venezuela",
    "Costa Rica",
    "Panamá",
    "Guatemala",
    "República Dominicana",
  ],
};

export type AiCityMode = "random" | "fixed" | "none";

export const AI_CITY_MODES: ReadonlyArray<{ label: string; value: AiCityMode }> = [
  { label: "Aleatória (do país)", value: "random" },
  { label: "Cidade fixa", value: "fixed" },
  { label: "Não mencionar cidade", value: "none" },
];

function pickFromPool(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}

export function pickRandomCityForCountry(country: string): string {
  if (country === "random") {
    const pools = Object.values(COUNTRY_CITIES);
    const pool = pools[Math.floor(Math.random() * pools.length)] ?? COUNTRY_CITIES.Brasil;
    return pickFromPool(pool);
  }
  // Grupos (global / latam): sorteia um país do grupo e depois a cidade.
  const group = COUNTRY_GROUPS[country];
  if (group?.length) {
    const withCities = group.filter((name) => COUNTRY_CITIES[name]?.length);
    if (withCities.length > 0) {
      const chosen = withCities[Math.floor(Math.random() * withCities.length)];
      return pickFromPool(COUNTRY_CITIES[chosen]);
    }
  }
  const pool = COUNTRY_CITIES[country];
  if (!pool?.length) return "";
  return pickFromPool(pool);
}

/** Uma cidade por avaliação; evita repetir a anterior quando possível. */
export function resolveCitiesForReviews(
  count: number,
  country: string,
  cityMode: AiCityMode,
  fixedCity: string,
): string[] {
  if (cityMode === "none" || count <= 0) {
    return Array.from({ length: count }, () => "");
  }

  if (cityMode === "fixed") {
    const name = fixedCity.trim();
    return Array.from({ length: count }, () => name);
  }

  const cities: string[] = [];
  for (let i = 0; i < count; i++) {
    let name = pickRandomCityForCountry(country);
    let guard = 0;
    while (i > 0 && name === cities[i - 1] && guard < 8) {
      name = pickRandomCityForCountry(country);
      guard++;
    }
    cities.push(name);
  }
  return cities;
}

export function getCityModeLabel(country: string, mode: AiCityMode): string {
  if (mode === "fixed") return "Cidade fixa";
  if (mode === "none") return "Não mencionar cidade";
  return country === "random"
    ? "Aleatória (vários países)"
    : `Aleatória (${country})`;
}
