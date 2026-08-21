// app/sos/page.tsx
'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MapPin,
  Phone,
  MessageSquare,
  Droplet,
  HeartPulse,
  CarFront,
  Flame,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Siren,
  WifiOff,
  Volume2,
  VolumeX,
  Navigation,
  AlertTriangle,
  Send,
  ShieldAlert,
  Hospital,
} from 'lucide-react';

// ---------- Types ----------
type EmergencyType = 'severe_bleeding' | 'unconscious_no_breathing' | 'trapped_vehicle' | 'vehicle_fire';
type VictimCount = '1 Person' | '2–3 People' | '4+ (Mass Casualty)';

interface Coordinates {
  lat: number;
  lng: number;
  source: 'qr' | 'gps' | 'unknown';
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

interface DispatchResponse {
  success: boolean;
  alertId: string;
  km_id: string;
  emergencyType: string;
  victimCount: VictimCount;
  nearestHospital: DispatchedUnit;
  nearestPolice: DispatchedUnit;
  timestamp: string;
}

const EMERGENCY_CATEGORIES: {
  id: EmergencyType;
  label: string;
  icon: typeof Droplet;
  color: string;
}[] = [
  { id: 'severe_bleeding', label: 'Severe Bleeding', icon: Droplet, color: 'bg-red-600 hover:bg-red-700 active:bg-red-800' },
  { id: 'unconscious_no_breathing', label: 'Unconscious / No Breathing', icon: HeartPulse, color: 'bg-red-700 hover:bg-red-800 active:bg-red-900' },
  { id: 'trapped_vehicle', label: 'Trapped in Vehicle', icon: CarFront, color: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800' },
  { id: 'vehicle_fire', label: 'Vehicle Fire', icon: Flame, color: 'bg-rose-700 hover:bg-rose-800 active:bg-rose-900' },
];

const VICTIM_COUNT_OPTIONS: VictimCount[] = ['1 Person', '2–3 People', '4+ (Mass Casualty)'];

const FIRST_AID_GUIDANCE: Record<EmergencyType, { steps: string[] }> = {
  severe_bleeding: {
    steps: [
      'Apply firm, direct pressure on the wound with a clean cloth',
      'Do not remove the cloth if it soaks through — add more on top',
      'Keep the injured area raised above heart level if possible',
    ],
  },
  unconscious_no_breathing: {
    steps: [
      'Place the person flat on their back on a hard surface and tilt the head back gently to clear the airway',
      'Start chest compressions immediately: place your hands in the center of the chest and push down 5–6 cm deep at 110 BPM',
      'Do not stop or give water or food until paramedics arrive and take over',
    ],
  },
  trapped_vehicle: {
    steps: [
      'Do not attempt to pull the person out unless there is fire risk',
      'Turn off the vehicle engine if it is safely reachable',
      'Keep the person calm and talking until rescue arrives',
    ],
  },
  vehicle_fire: {
    steps: [
      'Move everyone at least 30 meters away from the vehicle',
      'Do not attempt to open the hood or fight the fire yourself',
      'Warn oncoming traffic if it is safe to do so',
    ],
  },
};

// ============================================================
// Inner component that reads search params (needs Suspense)
// ============================================================
function SosContent() {
  const searchParams = useSearchParams();

  const [kmId, setKmId] = useState<string>('Unknown');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [selectedEmergency, setSelectedEmergency] = useState<EmergencyType | null>(null);
    const [victimCount, setVictimCount] = useState<VictimCount | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [bystanderPhone, setBystanderPhone] = useState('');

  const [showCpr, setShowCpr] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const updateConnectionStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
    };

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    return () => {
      window.removeEventListener('online', updateConnectionStatus);
      window.removeEventListener('offline', updateConnectionStatus);
    };
  }, []);

  // ---------- Read QR params, fallback to GPS ----------
  useEffect(() => {
    const km_id = searchParams.get('km_id');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (km_id && lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
        setKmId(km_id);
        setCoords({ lat: latNum, lng: lngNum, source: 'qr' });
        setLocationLoading(false);
        return;
      }
    }

    // Fallback to GPS
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            source: 'gps',
          });
          setKmId(km_id || 'GPS-DETECTED');
          setLocationLoading(false);
        },
        (error) => {
          console.error('GPS error:', error);
          setLocationError('Unable to access GPS. Please enable location services or share your position manually.');
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError('Geolocation not supported on this device.');
      setLocationLoading(false);
    }
  }, [searchParams]);

  // ---------- Dispatch alert ----------
  const handleDispatch = useCallback(
    async () => {
      if (!coords) {
        setDispatchError('Location not available yet. Please wait for GPS lock or try again.');
        return;
      }
      if (!selectedEmergency || !victimCount) {
        setDispatchError('Select an emergency type and estimated victim count before dispatching.');
        return;
      }

      setDispatching(true);
      setDispatchError(null);

      try {
        const res = await fetch('/api/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            km_id: kmId,
            lat: coords.lat,
            lng: coords.lng,
            emergencyType: selectedEmergency,
            victimCount,
            bystanderPhone: bystanderPhone || undefined,
          }),
        });

        const data: DispatchResponse = await res.json();

        if (!res.ok || !data.success) {
          throw new Error((data as any).error || 'Dispatch failed');
        }

        setDispatchResult(data);
      } catch (err) {
        console.error('Dispatch error:', err);
        setDispatchError('Failed to reach dispatch server. Use the emergency call/SMS buttons below immediately.');
      } finally {
        setDispatching(false);
      }
    },
    [coords, kmId, bystanderPhone, selectedEmergency, victimCount]
  );

  // ---------- SMS body for zero-internet fallback ----------
  const emergencyLabel =
    EMERGENCY_CATEGORIES.find((category) => category.id === selectedEmergency)?.label || 'Emergency';
  const smsLocation = coords
    ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
    : 'Location unavailable';
  const smsBody = encodeURIComponent(
    `RAKSHAK SOS: Emergency at Highway KM ${kmId}. Location: ${smsLocation}. Type: ${emergencyLabel}. Estimated Victims: ${victimCount || 'Unknown'}. Please send help immediately.`
  );

  const legalPassSms = dispatchResult
    ? encodeURIComponent(
        `GOOD SAMARITAN DIGITAL SHIELD - Rakshak SOS\nAlert ID: ${dispatchResult.alertId}\nUnder Section 134A of the Motor Vehicles Act, 1988 (India), a bystander who in good faith renders emergency assistance to a road accident victim shall not be liable for any civil or criminal action for any injury or death caused, and shall not be forced to disclose personal details unless voluntarily offered, nor detained for questioning without consent.\nTimestamp: ${dispatchResult.timestamp}\nThis message serves as your digital record of good-faith emergency response.`
      )
    : '';

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center gap-2">
        <Siren className="w-6 h-6 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">Rakshak SOS</h1>
          <p className="text-xs text-neutral-400 leading-tight">Highway Emergency Response</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {isOnline === false && (
          <section className="bg-amber-950 border border-amber-800 rounded-2xl p-4 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200">Limited connection</p>
              <p className="text-sm text-amber-300 mt-1">
                Dispatch is paused. Use the call or SMS buttons below; they use your mobile network directly.
              </p>
            </div>
          </section>
        )}

        {isOnline === true && (
          <>
            {/* Location Card */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="bg-neutral-800 rounded-full p-2 flex-shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-400">Highway Marker</p>
                  <p className="text-xl font-bold">KM {kmId}</p>
                  {locationLoading && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Acquiring GPS location...</span>
                    </div>
                  )}
                  {!locationLoading && coords && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-neutral-300 font-mono">
                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <Navigation className="w-3 h-3" />
                        {coords.source === 'qr' ? 'From QR Code' : 'Live GPS'}
                      </span>
                    </div>
                  )}
                  {locationError && (
                    <div className="flex items-start gap-2 mt-2 text-sm text-amber-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{locationError}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Emergency Triage Grid */}
            {!dispatchResult && (
              <section>
                <h2 className="text-sm font-semibold text-neutral-400 mb-2 px-1">
                  SELECT EMERGENCY TYPE — 1 TAP TO DISPATCH
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {EMERGENCY_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedEmergency === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedEmergency(cat.id);
                          setDispatchError(null);
                        }}
                        disabled={dispatching}
                        className={`${cat.color} rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2 min-h-[100px] sm:min-h-[120px] text-white font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="w-8 h-8" />
                        ) : (
                          <Icon className="w-8 h-8" strokeWidth={2.5} />
                        )}
                        <span className="text-sm text-center leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedEmergency && (
                  <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-neutral-200 mb-3">
                      Estimated Victims / People Injured
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {VICTIM_COUNT_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setVictimCount(option);
                            setDispatchError(null);
                          }}
                          className={`rounded-full px-3 py-3 text-sm font-semibold transition-colors ${
                            victimCount === option
                              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleDispatch}
                      disabled={!victimCount || dispatching}
                      className="w-full mt-3 rounded-xl bg-red-600 hover:bg-red-700 p-3 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {dispatching ? 'Dispatching...' : 'Dispatch Emergency Help'}
                    </button>
                  </div>
                )}

                {dispatchError && (
                  <div className="mt-3 bg-red-950 border border-red-800 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{dispatchError}</p>
                  </div>
                )}
              </section>
            )}

            {/* Post-Dispatch Confirmation */}
            {dispatchResult && (
              <PostDispatchConfirmation
                result={dispatchResult}
                legalPassSms={legalPassSms}
              />
            )}

            {/* CPR Metronome */}
            {showCpr && <CprMetronome onClose={() => setShowCpr(false)} />}
          </>
        )}

        {/* Offline-safe direct actions */}
        {isOnline === false && <ZeroInternetFallback smsBody={smsBody} />}
      </main>
    </div>
  );
}

// ============================================================
// Post-Dispatch Confirmation
// ============================================================
function PostDispatchConfirmation({
  result,
  legalPassSms,
}: {
  result: DispatchResponse;
  legalPassSms: string;
}) {
  const isMockMode =
    result.nearestHospital.call.mode === 'mock' || result.nearestPolice.call.mode === 'mock';

  return (
    <section className="space-y-3">
      {/* Combined dispatch confirmation card */}
      <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start gap-2">
  <span className="text-2xl leading-none">🚨</span>
  <div>
    <h2 className="text-xl font-bold leading-snug">
      Help Is On the Way
    </h2>
    <p className="text-sm text-emerald-100 mt-1">
      SOS dispatched to nearest police &amp; hospital
    </p>
  </div>
</div>
        <div className="mt-4 space-y-3">
          <p className="bg-red-900/50 rounded-xl p-3 text-sm font-bold text-red-100">
            🚨 Priority Dispatch: {result.victimCount} casualty response requested
          </p>
          <div className="flex items-start gap-3 bg-emerald-700/30 rounded-xl p-3">
            <ShieldAlert className="w-5 h-5 text-emerald-100 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-50 leading-snug">
              <p className="font-semibold">{result.nearestPolice.name}</p>
              <p className="text-emerald-100/80 text-xs mt-0.5">{result.nearestPolice.address}</p>
              <p className="text-emerald-100 text-xs mt-1 font-medium">{result.nearestPolice.distanceKm} km away</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-emerald-700/30 rounded-xl p-3">
            <Hospital className="w-5 h-5 text-emerald-100 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-50 leading-snug">
              <p className="font-semibold">{result.nearestHospital.name}</p>
              <p className="text-emerald-100/80 text-xs mt-0.5">{result.nearestHospital.address}</p>
              <p className="text-emerald-100 text-xs mt-1 font-medium">{result.nearestHospital.distanceKm} km away</p>
            </div>
          </div>
        </div>
        {isMockMode && (
          <p className="text-xs text-emerald-100/80 mt-3 border-t border-emerald-500/40 pt-2">
            Local mock mode: Twilio credentials were not live. Units were still selected by distance.
          </p>
        )}
      </div>

      <FirstAidGuidance type={result.emergencyType as EmergencyType} />

      {/* Good Samaritan Digital Shield */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">
              Good Samaritan Digital Shield
            </p>
            <h3 className="text-lg font-bold text-neutral-900 mt-1 leading-snug">
              You cannot be detained, questioned, or billed
            </h3>
            <p className="text-sm text-neutral-700 mt-2 leading-relaxed">
              Under <span className="font-semibold">Section 134A of the Motor Vehicles Act, 1988</span> and
              MoRTH Good Samaritan guidelines, a bystander who helps a crash victim is protected from
              civil and criminal liability. Police and hospitals must not detain you, force a statement as
              a condition of treatment, or bill you for emergency care of the injured person. Show this
              badge and Alert ID #{result.alertId.slice(-6)} if asked.
            </p>
            <a
              href={`sms:112?body=${legalPassSms}`}
              className="mt-3 inline-flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" />
              Save Legal Pass to SMS
            </a>
          </div>
        </div>
      </div>

    </section>
  );
}

function FirstAidGuidance({ type }: { type: EmergencyType }) {
  const category = EMERGENCY_CATEGORIES.find((c) => c.id === type)!;
  const Icon = category.icon;
  const guidance = FIRST_AID_GUIDANCE[type];

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-center gap-3 mb-3">
        <div className={`${category.color} rounded-full p-2.5 animate-pulse`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="font-bold text-neutral-100">While You Wait: {category.label}</h3>
      </div>
      <ul className="space-y-2">
        {guidance.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
            <span className="text-emerald-400 font-bold mt-0.5">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Zero-Internet Fallback Card
// ============================================================
function ZeroInternetFallback({ smsBody }: { smsBody: string }) {
  return (
    <section className="bg-neutral-900 border-2 border-dashed border-neutral-700 rounded-2xl p-4">
      <h2 className="text-sm font-bold text-neutral-300 mb-1 flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-400" />
        CONNECTION LOST — USE THESE DIRECTLY
      </h2>
      <p className="text-xs text-neutral-500 mb-3">
        These use your mobile network directly and do not require this page to reach the dispatch server.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <a
          href="tel:112"
          className="bg-green-700 hover:bg-green-600 active:bg-green-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white font-bold transition-colors"
        >
          <Phone className="w-7 h-7" />
          <span className="text-sm">Call 112</span>
        </a>
        <a
          href={`sms:112?body=${smsBody}`}
          className="bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white font-bold transition-colors"
        >
          <MessageSquare className="w-7 h-7" />
          <span className="text-sm">SMS 112</span>
        </a>
      </div>
    </section>
  );
}

// ============================================================
// CPR Metronome (110 BPM, Web Audio API)
// ============================================================
function CprMetronome({ onClose }: { onClose: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [muted, setMuted] = useState(false);
  const [compressionCount, setCompressionCount] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const BPM = 110;
  const INTERVAL_MS = Math.round(60000 / BPM); // ~545ms

  const playClick = useCallback(() => {
    if (muted) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.08);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [muted]);

  const tick = useCallback(() => {
    setPulse(true);
    playClick();
    setCompressionCount((c) => c + 1);
    setTimeout(() => setPulse(false), 150);
  }, [playClick]);

  const toggleMetronome = useCallback(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsPlaying(false);
    } else {
      // Resume audio context on user gesture (mobile requirement)
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      tick();
      intervalRef.current = setInterval(tick, INTERVAL_MS);
      setIsPlaying(true);
    }
  }, [isPlaying, tick, INTERVAL_MS]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <section className="bg-neutral-900 border-2 border-red-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-red-300 flex items-center gap-2">
          <Siren className="w-5 h-5" />
          CPR Metronome — {BPM} BPM
        </h2>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-300 text-sm px-2 py-1"
        >
          Close
        </button>
      </div>

      <p className="text-xs text-neutral-400">
        Push hard and fast in the center of the chest, 5–6 cm deep. Tap start and follow the beat.
      </p>

      {/* Pulsing visual card */}
      <div
        className={`rounded-2xl flex items-center justify-center h-24 sm:h-32 transition-all duration-150 ${
          pulse ? 'bg-red-600 scale-105' : 'bg-red-900 scale-100'
        }`}
      >
        <span className="text-4xl font-black text-white">{compressionCount}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleMetronome}
          className={`flex-1 rounded-xl p-3 font-bold flex items-center justify-center gap-2 transition-colors ${
            isPlaying
              ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isPlaying ? 'Stop' : 'Start Compressions'}
        </button>
        <button
          onClick={() => setMuted((m) => !m)}
          className="bg-neutral-800 hover:bg-neutral-700 rounded-xl p-3 flex items-center justify-center transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <VolumeX className="w-5 h-5 text-neutral-400" />
          ) : (
            <Volume2 className="w-5 h-5 text-neutral-200" />
          )}
        </button>
      </div>

      {compressionCount > 0 && (
        <button
          onClick={() => setCompressionCount(0)}
          className="w-full text-xs text-neutral-500 hover:text-neutral-300"
        >
          Reset counter
        </button>
      )}
    </section>
  );
}

// ============================================================
// Loading fallback for Suspense boundary
// ============================================================
function SosLoadingFallback() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
        <p className="text-neutral-400 text-sm">Loading Rakshak SOS...</p>
      </div>
    </div>
  );
}

// ============================================================
// Page export — wraps client param reader in Suspense
// ============================================================
export default function SosPage() {
  return (
    <Suspense fallback={<SosLoadingFallback />}>
      <SosContent />
    </Suspense>
  );
}