export type EmergencyFacilityType = 'police' | 'hospital' | 'fire_station' | 'traffic';

export interface EmergencyFacility {
  type: EmergencyFacilityType;
  name: string;
  address: string;
  distanceKm: number;
  lat: number;
  lng: number;
  phone?: string;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function getElementCoordinates(element: OverpassElement): { lat: number; lng: number } | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

function isEmergencyFacilityName(name: string, type: 'police' | 'hospital' | 'fire_station'): boolean {
  const normalizedName = name.toLowerCase();
  if (type === 'police') {
    return !['railway', 'rail', 'traffic', 'signal', 'booth', 'outpost', 'kiosk', 'chowk', 'post'].some((term) => normalizedName.includes(term));
  }
  if (type === 'hospital') {
    return ![
      'police hospital', 'railway hospital', 'rehabilitation', 'rehab', 'nursing home',
      'diagnostic', 'pathology', 'laboratory', 'pharmacy', 'clinic', 'dental', 'eye care',
      'ayurvedic', 'homeopathy', 'physiotherapy', 'blood bank',
    ].some((term) => normalizedName.includes(term));
  }
  return true;
}

export async function fetchNearestFacilities(lat: number, lng: number): Promise<{
  police: EmergencyFacility | null;
  hospital: EmergencyFacility | null;
  policeFacilities: EmergencyFacility[];
  hospitalFacilities: EmergencyFacility[];
  fireStation: EmergencyFacility | null;
  trafficControl: EmergencyFacility | null;
}> {
  const radiusMeters = 25000;
  const query = `
    [out:json][timeout:15];
    (
      nwr["amenity"="police"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      nwr["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="fire_station"](around:${radiusMeters},${lat},${lng});
      node["highway"="services"](around:${radiusMeters},${lat},${lng});
      node["barrier"="toll_booth"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  const overpassEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  const requestOverpass = async (endpoint: string) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RakshakSOS-App/1.0',
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
    return response;
  };
  const response = await Promise.any(overpassEndpoints.map(requestOverpass));

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };
  const categories: Record<EmergencyFacilityType, EmergencyFacility[]> = {
    police: [],
    hospital: [],
    fire_station: [],
    traffic: [],
  };

  for (const element of data.elements ?? []) {
    const coordinates = getElementCoordinates(element);
    if (!coordinates) continue;

    const tags = element.tags ?? {};
    const amenity = tags.amenity;
    const healthcare = tags.healthcare;
    const type: EmergencyFacilityType =
      amenity === 'police'
        ? 'police'
        : amenity === 'hospital' || healthcare === 'hospital'
          ? 'hospital'
          : amenity === 'fire_station'
            ? 'fire_station'
            : 'traffic';

    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']]
      .filter(Boolean)
      .join(', ') || 'Nearby emergency facility';
    const name = tags.name || tags['name:en'] || 'Nearby emergency facility';
    if ((type === 'police' || type === 'hospital') && !isEmergencyFacilityName(name, type)) continue;

    categories[type].push({
      type,
      name,
      address,
      distanceKm: getDistanceKm(lat, lng, coordinates.lat, coordinates.lng),
      lat: coordinates.lat,
      lng: coordinates.lng,
      phone: tags.phone || tags['contact:phone'],
    });
  }

  const pickNearest = (facilities: EmergencyFacility[]) =>
    facilities.sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;

  const sortedPolice = categories.police.sort((a, b) => a.distanceKm - b.distanceKm);
  const sortedHospitals = categories.hospital.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    police: pickNearest(sortedPolice),
    hospital: pickNearest(sortedHospitals),
    policeFacilities: sortedPolice,
    hospitalFacilities: sortedHospitals,
    fireStation: pickNearest(categories.fire_station),
    trafficControl: pickNearest(categories.traffic),
  };
}
