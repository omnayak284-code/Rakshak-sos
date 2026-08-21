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

interface EmergencyUnit {
  id: string;
  name: string;
  address: string;
  type: 'hospital' | 'police' | 'fire' | 'ambulance';
  lat: number;
  lng: number;
  phone: string;
}

interface DispatchedUnit {
  id: string;
  name: string;
  address: string;
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

// ---------- In-memory dataset (mock highway units) ----------
const EMERGENCY_UNITS: EmergencyUnit[] = [
  { id: 'HOSP-001', name: 'Apollo Hospitals, Bhubaneswar', address: 'Gajapati Nagar, Bhubaneswar', type: 'hospital', lat: 20.3064, lng: 85.8322, phone: '+918069049752' },
  { id: 'HOSP-002', name: 'Kalinga Institute of Medical Sciences (KIMS)', address: 'KIIT Campus, Chandaka Industrial Estate, Bhubaneswar', type: 'hospital', lat: 20.3534, lng: 85.8154, phone: '+916747111000' },
  { id: 'HOSP-003', name: 'CARE Hospitals, Bhubaneswar', address: 'District Center, Chandrasekharpur, Bhubaneswar', type: 'hospital', lat: 20.3213, lng: 85.8203, phone: '+914068106589' },
  { id: 'HOSP-004', name: 'Utkal Hospital', address: 'Defence Colony, Bhubaneswar', type: 'hospital', lat: 20.32277, lng: 85.80049, phone: '+916370704001' },
  { id: 'POLICE-001', name: 'Police Commissionerate Office, Bhubaneswar', address: 'Bhubaneswar, Odisha', type: 'police', lat: 20.274694, lng: 85.825917, phone: '+916742530035' },
  { id: 'POLICE-002', name: 'Special Crime Unit Police Station, Nayapalli', address: 'Nayapalli, Bhubaneswar', type: 'police', lat: 20.290579, lng: 85.815449, phone: '+916742556668' },
  { id: 'POLICE-003', name: 'Infocity Police Station', address: 'Infocity, Bhubaneswar', type: 'police', lat: 20.3546, lng: 85.8091, phone: '+916742725700' },
];

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

function findNearestByType(lat: number, lng: number, type: EmergencyUnit['type']) {
  const candidates = EMERGENCY_UNITS.filter((u) => u.type === type).map((unit) => ({
    unit,
    distanceKm: haversineDistanceKm(lat, lng, unit.lat, unit.lng),
  }));
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates[0];
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

    const nearestHospitalMatch = findNearestByType(lat, lng, 'hospital');
    const nearestPoliceMatch = findNearestByType(lat, lng, 'police');

    if (!nearestHospitalMatch || !nearestPoliceMatch) {
      return NextResponse.json({ success: false, error: 'No emergency units available in dataset' }, { status: 500 });
    }

    const alertId = `RKS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const emergencyLabel = emergencyType.replace(/_/g, ' ').toUpperCase();
    const locationLink = `https://maps.google.com/?q=${lat},${lng}`;

    const hospitalEta = estimateEtaMinutes(nearestHospitalMatch.distanceKm);
    const policeEta = estimateEtaMinutes(nearestPoliceMatch.distanceKm);

    const hospitalMessage = `RAKSHAK SOS ALERT [${alertId}]. Type: ${emergencyLabel}. Estimated Victims: ${victimCount}. Highway KM ${km_id}. Location: ${locationLink}. Distance: ${nearestHospitalMatch.distanceKm.toFixed(2)} km. ETA ${hospitalEta} min. Respond immediately.`;
    const policeMessage = `RAKSHAK SOS ALERT [${alertId}]. Type: ${emergencyLabel}. Estimated Victims: ${victimCount}. Highway KM ${km_id}. Location: ${locationLink}. Distance: ${nearestPoliceMatch.distanceKm.toFixed(2)} km. ETA ${policeEta} min. Respond immediately.`;

    const [hospCall, hospSms, polCall, polSms] = await Promise.all([
      dispatchCall(nearestHospitalMatch.unit.phone, hospitalMessage),
      dispatchSms(nearestHospitalMatch.unit.phone, hospitalMessage),
      dispatchCall(nearestPoliceMatch.unit.phone, policeMessage),
      dispatchSms(nearestPoliceMatch.unit.phone, policeMessage),
    ]);

    if (bystanderPhone) {
      const bystanderMessage = `Rakshak SOS: Alert ${alertId} dispatched for ${victimCount}. Hospital: ${nearestHospitalMatch.unit.name} (${hospitalEta} min). Police: ${nearestPoliceMatch.unit.name} (${policeEta} min). Dial 112 if situation worsens.`;
      dispatchSms(bystanderPhone, bystanderMessage).catch((err) => console.error('Bystander SMS failed:', err));
    }

    const result: DispatchResult = {
      success: true,
      alertId,
      km_id,
      emergencyType,
      victimCount,
      nearestHospital: {
        id: nearestHospitalMatch.unit.id,
        name: nearestHospitalMatch.unit.name,
        address: nearestHospitalMatch.unit.address,
        type: nearestHospitalMatch.unit.type,
        distanceKm: Math.round(nearestHospitalMatch.distanceKm * 100) / 100,
        etaMinutes: hospitalEta,
        call: hospCall,
        sms: hospSms,
      },
      nearestPolice: {
        id: nearestPoliceMatch.unit.id,
        name: nearestPoliceMatch.unit.name,
        address: nearestPoliceMatch.unit.address,
        type: nearestPoliceMatch.unit.type,
        distanceKm: Math.round(nearestPoliceMatch.distanceKm * 100) / 100,
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
      service: 'Rakshak SOS Alert Dispatch API',
      unitsRegistered: EMERGENCY_UNITS.length,
      mode: process.env.TWILIO_ACCOUNT_SID ? 'live' : 'mock',
    },
    { status: 200 }
  );
}