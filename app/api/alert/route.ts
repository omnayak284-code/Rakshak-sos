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

// ---------- Live Google Places lookup ----------
async function findNearestPlace(
  lat: number,
  lng: number,
  placeType: 'hospital' | 'police'
): Promise<{ place: PlaceResult; distanceKm: number } | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is missing');
    return null;
  }

  try {
    const keyword = placeType === 'police' ? '&keyword=police%20station' : '';
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=${placeType}${keyword}&key=${apiKey}`;
    const nearbyRes = await fetch(nearbyUrl);
    const nearbyData = await nearbyRes.json();

    if (nearbyData.status !== 'OK' || !nearbyData.results?.length) {
      console.error(`Places nearbysearch failed for ${placeType}:`, nearbyData.status);
      return null;
    }

    const top = nearbyData.results[0];
    const placeLat = top.geometry.location.lat;
    const placeLng = top.geometry.location.lng;
    const distanceKm = haversineDistanceKm(lat, lng, placeLat, placeLng);

    let phone = '';
    let address = top.vicinity || '';
    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${top.place_id}&fields=formatted_phone_number,formatted_address&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      if (detailsData.status === 'OK') {
        phone = detailsData.result.formatted_phone_number || '';
        address = detailsData.result.formatted_address || address;
      }
    } catch (err) {
      console.error('Place details lookup failed:', err);
    }

    return {
      place: {
        name: top.name,
        address,
        lat: placeLat,
        lng: placeLng,
        phone: phone.replace(/[\s()-]/g, '') || '+911000000000',
      },
      distanceKm,
    };
  } catch (err) {
    console.error(`Places API error for ${placeType}:`, err);
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
        id: 'hospital-live',
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
        id: 'police-live',
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
      service: 'Rakshak SOS Alert Dispatch API (live Places lookup)',
      mode: process.env.TWILIO_ACCOUNT_SID ? 'live' : 'mock',
    },
    { status: 200 }
  );
}
