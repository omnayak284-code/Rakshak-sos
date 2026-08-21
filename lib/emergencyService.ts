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

export async function fetchNearestFacilities(lat: number, lng: number): Promise<{
  police: EmergencyFacility | null;
  hospital: EmergencyFacility | null;
  fireStation: EmergencyFacility | null;
  trafficControl: EmergencyFacility | null;
}> {
  const radiusMeters = 25000;
  const query = `
    [out:json][timeout:15];
    (
      nwr["amenity"="police"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="fire_station"](around:${radiusMeters},${lat},${lng});
      node["highway"="services"](around:${radiusMeters},${lat},${lng});
      node["barrier"="toll_booth"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  const response = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(15000), cache: 'no-store' }
  );

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
    const type: EmergencyFacilityType =
      amenity === 'police'
        ? 'police'
        : amenity === 'hospital' || amenity === 'clinic'
          ? 'hospital'
          : amenity === 'fire_station'
            ? 'fire_station'
            : 'traffic';

    const address = [tags['addr:street'], tags['addr:suburb'], tags['addr:city']]
      .filter(Boolean)
      .join(', ') || 'Nearby emergency facility';

    categories[type].push({
      type,
      name: tags.name || tags['name:en'] || 'Nearby emergency facility',
      address,
      distanceKm: getDistanceKm(lat, lng, coordinates.lat, coordinates.lng),
      lat: coordinates.lat,
      lng: coordinates.lng,
      phone: tags.phone || tags['contact:phone'],
    });
  }

  const pickNearest = (facilities: EmergencyFacility[]) =>
    facilities.sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;

  return {
    police: pickNearest(categories.police),
    hospital: pickNearest(categories.hospital),
    fireStation: pickNearest(categories.fire_station),
    trafficControl: pickNearest(categories.traffic),
  };
}
