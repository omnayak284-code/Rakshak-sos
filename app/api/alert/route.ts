// app/api/alert/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ---------- Types ----------
interface AlertPayload {
  km_id: string;
  lat: number;
  lng: number;
  emergencyType: 'severe_bleeding' | 'unconscious_no_breathing' | 'trapped_vehicle' | 'vehicle_fire';
  victimCount: '1 Person' | '2–3 People' | '4+ (Mass Casualty)';
  bystanderPhone?: string;
}

interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
}

interface DispatchedUnit {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  distanceKm: number;
  etaMinutes: number;
  call: { status: string; sid?: string; mode: 'live' | 'mock' };
  sms: { status: string; sid?: string; mode: 'live' | 'mock' };
}

interface DispatchResult {
  success: boolean;
  alertId: string;
  km_id: string;
  emergencyType: string;
  victimCount: AlertPayload['victimCount'];
  nearestHospital: DispatchedUnit;
  nearestPolice: DispatchedUnit;
  timestamp: string;
}

// ---------- Haversine distance ----------
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateEtaMinutes(distanceKm: number): number {
  const travelMinutes = (distanceKm / 60) * 60;
  return Math.max(3, Math.round(travelMinutes + 2));
}

// ---------- Keyless Photon / OpenStreetMap lookup ----------
const NON_EMERGENCY_MEDICAL_KEYWORDS = [
  'diagnostic', 'pathology', 'lab', 'laboratory', 'scan', 'imaging', 'x-ray', 'mri',
  'ultrasound', 'blood bank', 'dental', 'dentist', 'eye care', 'optical', 'optician',
  'ayurvedic', 'homeo', 'physiotherapy', 'pharmacy', 'chemist', 'skin clinic', 'cosmetic',
];

const NON_POLICE_STATION_KEYWORDS = [
  'signal', 'traffic signal', 'traffic booth', 'outpost', 'beat house', 'check post', 'kiosk', 'chowk',
];

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    street?: string;
    district?: string;
    suburb?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

async function findNearestPlace(
  lat: number,
  lng: number,
  placeType: 'hospital' | 'police'
): Promise<{ place: PlaceResult; distanceKm: number } | null> {
  try {
    const osmTag = placeType === 'police' ? 'amenity:police' : 'amenity:hospital';
    const searchQuery = placeType === 'police' ? 'police station thana' : 'hospital trauma care emergency';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=${lat}&lon=${lng}&osm_tag=${encodeURIComponent(osmTag)}&limit=15`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RakshakSOS-App' },
      cache: 'no-store',
    });
    const data: { features?: PhotonFeature[] } = await response.json();
    if (!response.ok || !data.features?.length) {
      console.error(`Photon lookup failed for ${placeType}:`, response.status);
      return null;
    }

    const candidates = data.features
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties || {};
        if (!coordinates || coordinates.length < 2) return null;
        const [placeLng, placeLat] = coordinates;
        const name = properties.name || (placeType === 'police' ? 'Police Station' : 'Emergency Hospital');
        const address = [properties.street, properties.district || properties.suburb, properties.city || properties.county, properties.state]
          .filter(Boolean)
          .join(', ') || 'Local Jurisdiction Area';
        return {
          id: `osm-${placeType}-${properties.osm_id || `${placeLat}-${placeLng}`}`,
          name,
          address,
          lat: placeLat,
          lng: placeLng,
          phone: '',
          distanceKm: haversineDistanceKm(lat, lng, placeLat, placeLng),
        };
      })
      .filter((candidate): candidate is PlaceResult & { distanceKm: number } => candidate !== null);

    const validCandidates = candidates.filter((candidate) => {
      const lowerName = candidate.name.toLowerCase();
      if (placeType === 'police') {
        return !NON_POLICE_STATION_KEYWORDS.some((keyword) => lowerName.includes(keyword));
      }
      return !NON_EMERGENCY_MEDICAL_KEYWORDS.some((keyword) => lowerName.includes(keyword));
    });

    const top = (validCandidates.length > 0 ? validCandidates : candidates)
      .sort((first, second) => {
        const firstDistance = first.distanceKm;
        const secondDistance = second.distanceKm;
        return firstDistance - secondDistance;
      })[0];

    if (!top) {
      console.error(`No valid ${placeType} result returned by Photon/OpenStreetMap`);
      return null;
    }

    return {
      place: top,
      distanceKm: top.distanceKm,
    };
  } catch (err) {
    console.error(`Photon lookup error for ${placeType}:`, err);
    return null;
  }
}

// ---------- Twilio dispatch (mock-safe) ----------
async function dispatchCall(phone: string, message: string): Promise<{ status: string; sid?: string; mode: 'live' | 'mock' }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[MOCK CALL] To: ${phone} | Message: ${message}`);
    return { status: 'simulated', mode: 'mock' };
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
    const body = new URLSearchParams({
      To: phone,
      From: fromNumber,
      Twiml: `<Response><Say>${message}</Say></Response>`,
    });

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      console.error('Twilio call failed:', await res.text());
      return { status: 'failed', mode: 'live' };
    }
    const data = await res.json();
    return { status: 'initiated', sid: data.sid, mode: 'live' };
  } catch (err) {
    console.error('Twilio call error:', err);
    return { status: 'error', mode: 'live' };
  }
}

async function dispatchSms(phone: string, message: string): Promise<{ status: string; sid?: string; mode: 'live' | 'mock' }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[MOCK SMS] To: ${phone} | Message: ${message}`);
    return { status: 'simulated', mode: 'mock' };
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: fromNumber, Body: message });

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      console.error('Twilio SMS failed:', await res.text());
      return { status: 'failed', mode: 'live' };
    }
    const data = await res.json();
    return { status: 'sent', sid: data.sid, mode: 'live' };
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return { status: 'error', mode: 'live' };
  }
}

// ---------- Validation ----------
function validatePayload(body: any): { valid: boolean; error?: string; payload?: AlertPayload } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  const { km_id, lat, lng, emergencyType, victimCount, bystanderPhone } = body;

  if (typeof km_id !== 'string' || km_id.trim().length === 0) {
    return { valid: false, error: 'km_id is required and must be a string' };
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
    return { valid: false, error: 'lat is required and must be a valid latitude' };
  }
  if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    return { valid: false, error: 'lng is required and must be a valid longitude' };
  }
  const validTypes: AlertPayload['emergencyType'][] = [
    'severe_bleeding', 'unconscious_no_breathing', 'trapped_vehicle', 'vehicle_fire',
  ];
  if (!validTypes.includes(emergencyType)) {
    return { valid: false, error: `emergencyType must be one of: ${validTypes.join(', ')}` };
  }
  const validVictimCounts: AlertPayload['victimCount'][] = ['1 Person', '2–3 People', '4+ (Mass Casualty)'];
  if (!validVictimCounts.includes(victimCount)) {
    return { valid: false, error: `victimCount must be one of: ${validVictimCounts.join(', ')}` };
  }
  if (bystanderPhone !== undefined && typeof bystanderPhone !== 'string') {
    return { valid: false, error: 'bystanderPhone must be a string if provided' };
  }
  return {
    valid: true,
    payload: {
      km_id: km_id.trim(), lat: latNum, lng: lngNum, emergencyType, victimCount,
      bystanderPhone: bystanderPhone || undefined,
    },
  };
}

// ---------- Route Handler ----------
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validation = validatePayload(rawBody);

    if (!validation.valid || !validation.payload) {
      return NextResponse.json({ success: false, error: validation.error || 'Invalid payload' }, { status: 400 });
    }

    const { km_id, lat, lng, emergencyType, victimCount, bystanderPhone } = validation.payload;

    const [hospitalResult, policeResult] = await Promise.all([
      findNearestPlace(lat, lng, 'hospital'),
      findNearestPlace(lat, lng, 'police'),
    ]);

    if (!hospitalResult || !policeResult) {
      return NextResponse.json(
        { success: false, error: 'Unable to locate nearby emergency units live. Please call 112 directly.' },
        { status: 503 }
      );
    }

    const alertId = `RKS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const emergencyLabel = emergencyType.replace(/_/g, ' ').toUpperCase();
    const locationLink = `https://maps.google.com/?q=${lat},${lng}`;

    const hospitalEta = estimateEtaMinutes(hospitalResult.distanceKm);
    const policeEta = estimateEtaMinutes(policeResult.distanceKm);

    const hospitalMessage = `RAKSHAK SOS ALERT [${alertId}]. Type: ${emergencyLabel}. Casualties: ${victimCount}. Highway KM ${km_id}. Location: ${locationLink}. Distance: ${hospitalResult.distanceKm.toFixed(2)} km. ETA ${hospitalEta} min. Respond immediately.`;
    const policeMessage = `RAKSHAK SOS ALERT [${alertId}]. Type: ${emergencyLabel}. Casualties: ${victimCount}. Highway KM ${km_id}. Location: ${locationLink}. Distance: ${policeResult.distanceKm.toFixed(2)} km. ETA ${policeEta} min. Respond immediately.`;

    const [hospCall, hospSms, polCall, polSms] = await Promise.all([
      dispatchCall(hospitalResult.place.phone, hospitalMessage),
      dispatchSms(hospitalResult.place.phone, hospitalMessage),
      dispatchCall(policeResult.place.phone, policeMessage),
      dispatchSms(policeResult.place.phone, policeMessage),
    ]);

    if (bystanderPhone) {
      const shortAlertId = alertId.slice(-6).toUpperCase();
      const bystanderMessage = `RAKSHAK SOS — Alert ${alertId} dispatched. Hospital: ${hospitalResult.place.name} (${hospitalEta} min). Police: ${policeResult.place.name} (${policeEta} min).\n\nGOOD SAMARITAN DIGITAL SHIELD: Under Section 134A of the Motor Vehicles Act, 1988 and MoRTH Good Samaritan guidelines, you are protected from civil and criminal liability for helping. Police and hospitals cannot detain you, force a statement, or bill you for the injured person's care. Show this message and Alert ID #${shortAlertId} if asked.\n\nDial 112 if situation worsens.`;
      dispatchSms(bystanderPhone, bystanderMessage).catch((err) => console.error('Bystander SMS failed:', err));
    }

    const result: DispatchResult = {
      success: true,
      alertId,
      km_id,
      emergencyType,
      victimCount,
      nearestHospital: {
        id: hospitalResult.place.id,
        name: hospitalResult.place.name,
        address: hospitalResult.place.address,
        lat: hospitalResult.place.lat,
        lng: hospitalResult.place.lng,
        type: 'hospital',
        distanceKm: Math.round(hospitalResult.distanceKm * 100) / 100,
        etaMinutes: hospitalEta,
        call: hospCall,
        sms: hospSms,
      },
      nearestPolice: {
        id: policeResult.place.id,
        name: policeResult.place.name,
        address: policeResult.place.address,
        lat: policeResult.place.lat,
        lng: policeResult.place.lng,
        type: 'police',
        distanceKm: Math.round(policeResult.distanceKm * 100) / 100,
        etaMinutes: policeEta,
        call: polCall,
        sms: polSms,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('Alert dispatch error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error during dispatch' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'Rakshak SOS Alert Dispatch API (Photon/OpenStreetMap lookup)',
      mode: process.env.TWILIO_ACCOUNT_SID ? 'live' : 'mock',
    },
    { status: 200 }
  );
}
