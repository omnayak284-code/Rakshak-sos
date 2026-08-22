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
  Globe2,
} from 'lucide-react';

// ---------- Types ----------
type EmergencyType = 'severe_bleeding' | 'unconscious_no_breathing' | 'trapped_vehicle' | 'vehicle_fire';
type VictimCount = '1 Person' | '2–3 People' | '4+ (Mass Casualty)';
type Language = 'en' | 'or' | 'hi';

const TRANSLATIONS = {
  en: {
    title: 'Rakshak SOS', subtitle: 'Highway Emergency Response', chooseLanguage: 'Choose your language',
    languageHint: 'Select a language to continue', marker: 'Highway Marker / Exact GPS', gps: 'Acquiring exact GPS coordinates...',
    gpsRequiredTitle: 'GPS Location Access Required', gpsRequiredDesc: 'Turn on Location and allow GPS access so we can send your exact coordinates to the nearest emergency units.',
    enableGps: 'Enable High-Accuracy GPS', gpsLocked: 'Exact live GPS locked', gpsDenied: 'Location access is off or was denied.',
    selectEmergency: 'SELECT EMERGENCY TYPE — 1 TAP TO DISPATCH', victims: 'Estimated Victims / People Injured',
    one: '1 Person', twoThree: '2–3 People', mass: '4+ (Mass Casualty)', autoDispatching: 'Auto-dispatching',
    changeCategory: 'Tap another category to change', transmitting: 'Transmitting', beep: 'A beep sounds every second.',
    cancel: 'Cancel', instant: 'Instant Transmit', priority: 'Priority Dispatch', requested: 'casualty response requested',
    helpOnWay: 'Help Is On the Way', dispatched: 'SOS dispatched to nearest police & hospital', whileWait: 'While You Wait',
    legalTitle: 'Good Samaritan Digital Shield', legalHeading: 'You cannot be detained, questioned, or billed',
    legalBody: 'Under Section 134A of the Motor Vehicles Act, 1988 and MoRTH Good Samaritan guidelines, a bystander who helps a crash victim is protected from civil and criminal liability.',
    saveLegal: 'Save Legal Pass to SMS', connectionLost: 'CONNECTION LOST — USE THESE DIRECTLY',
    directHint: 'These use your mobile network directly and do not require this page to reach the dispatch server.',
    call: 'Call 112', sms: 'SMS 112',
    emergency: { severe_bleeding: 'Severe Bleeding', unconscious_no_breathing: 'Unconscious / No Breathing', trapped_vehicle: 'Trapped in Vehicle', vehicle_fire: 'Vehicle Fire' },
    guidance: {
      severe_bleeding: ['Apply firm, direct pressure on the wound with a clean cloth', 'Do not remove the cloth if it soaks through — add more on top', 'Keep the injured area raised above heart level if possible'],
      unconscious_no_breathing: ['Place the person flat on their back on a hard surface and tilt the head back gently to clear the airway', 'Start chest compressions immediately: place your hands in the center of the chest and push down 5–6 cm deep at 110 BPM', 'Do not stop or give water or food until paramedics arrive and take over'],
      trapped_vehicle: ['Do not attempt to pull the person out unless there is fire risk', 'Turn off the vehicle engine if it is safely reachable', 'Keep the person calm and talking until rescue arrives'],
      vehicle_fire: ['Move everyone at least 30 meters away from the vehicle', 'Do not attempt to open the hood or fight the fire yourself', 'Warn oncoming traffic if it is safe to do so'],
    },
  },
  or: {
    title: 'ରକ୍ଷକ SOS', subtitle: 'ରାଜପଥ ଜରୁରୀକାଳୀନ ସହାୟତା', chooseLanguage: 'ଆପଣଙ୍କର ଭାଷା ବାଛନ୍ତୁ',
    languageHint: 'ଆଗକୁ ବଢ଼ିବା ପାଇଁ ଭାଷା ବାଛନ୍ତୁ', marker: 'ରାଜପଥ ଚିହ୍ନ / ସଠିକ୍ GPS', gps: 'ସଠିକ୍ GPS ସ୍ଥାନ ଖୋଜାଯାଉଛି...',
    gpsRequiredTitle: 'GPS ସ୍ଥାନ ଅନୁମତି ଆବଶ୍ୟକ', gpsRequiredDesc: 'ଆପଣଙ୍କ ସଠିକ୍ ସ୍ଥାନ ନିକଟସ୍ଥ ଜରୁରୀକାଳୀନ ୟୁନିଟ୍‌କୁ ପଠାଇବା ପାଇଁ Location ଅନ୍ କରନ୍ତୁ ଏବଂ GPS ଅନୁମତି ଦିଅନ୍ତୁ।',
    enableGps: 'ସଠିକ୍ GPS ଅନ୍ କରନ୍ତୁ', gpsLocked: 'ସଠିକ୍ Live GPS ଲକ୍ ହୋଇଛି', gpsDenied: 'Location ବନ୍ଦ ଅଛି କିମ୍ବା ଅନୁମତି ଦିଆଯାଇନାହିଁ।',
    selectEmergency: 'ଜରୁରୀକାଳୀନ ପ୍ରକାର ବାଛନ୍ତୁ — ୧ ଟ୍ୟାପ୍', victims: 'ଆହତଙ୍କ ଆନୁମାନିକ ସଂଖ୍ୟା',
    one: '୧ ଜଣ', twoThree: '୨–୩ ଜଣ', mass: '୪+ (ଅନେକ ଆହତ)', autoDispatching: 'ସ୍ୱୟଂଚାଳିତ ପଠାଯାଉଛି',
    changeCategory: 'ପରିବର୍ତ୍ତନ ପାଇଁ ଅନ୍ୟ ପ୍ରକାର ବାଛନ୍ତୁ', transmitting: 'ପଠାଯାଉଛି', beep: 'ପ୍ରତି ସେକେଣ୍ଡରେ ଧ୍ୱନି ହେବ।',
    cancel: 'ବାତିଲ୍', instant: 'ଏବେ ପଠାନ୍ତୁ', priority: 'ଜରୁରୀ ପଠାଣ', requested: 'ଆହତଙ୍କ ପାଇଁ ସହାୟତା ଅନୁରୋଧ',
    helpOnWay: 'ସହାୟତା ଆସୁଛି', dispatched: 'ନିକଟତମ ପୋଲିସ ଓ ହସ୍ପିଟାଲକୁ SOS ପଠାଯାଇଛି', whileWait: 'ସହାୟତା ଆସିବା ପର୍ଯ୍ୟନ୍ତ',
    legalTitle: 'ଉତ୍ତମ ନାଗରିକ ଆଇନଗତ ସୁରକ୍ଷା', legalHeading: 'ଆପଣଙ୍କୁ ଅଟକାଇ, ପଚରାଉଚରା କିମ୍ବା ବିଲ୍ କରାଯାଇପାରିବ ନାହିଁ',
    legalBody: 'ମୋଟର ଯାନ ଆଇନ, ୧୯୮୮ ର ଧାରା ୧୩୪A ଅନୁଯାୟୀ, ଦୁର୍ଘଟଣାଗ୍ରସ୍ତଙ୍କୁ ସାହାଯ୍ୟ କରୁଥିବା ବ୍ୟକ୍ତି ଆଇନଗତ ସୁରକ୍ଷା ପାଆନ୍ତି।',
    saveLegal: 'ଆଇନଗତ ପାସ୍ SMS ରେ ସେଭ୍ କରନ୍ତୁ', connectionLost: 'ସଂଯୋଗ ନାହିଁ — ଏଗୁଡ଼ିକ ସିଧାସଳଖ ବ୍ୟବହାର କରନ୍ତୁ',
    directHint: 'ଏଗୁଡ଼ିକ ମୋବାଇଲ୍ ନେଟୱର୍କରେ ସିଧାସଳଖ କାମ କରେ।', call: '୧୧୨ କଲ୍ କରନ୍ତୁ', sms: '୧୧୨ SMS',
    emergency: { severe_bleeding: 'ପ୍ରବଳ ରକ୍ତସ୍ରାବ', unconscious_no_breathing: 'ଅଚେତ / ନିଶ୍ୱାସ ବନ୍ଦ', trapped_vehicle: 'ଗାଡ଼ିରେ ଫସିଛନ୍ତି', vehicle_fire: 'ଗାଡ଼ିରେ ନିଆଁ' },
    guidance: {
      severe_bleeding: ['ସଫା କପଡ଼ାରେ ଘା ଉପରେ ଦୃଢ଼ ଚାପ ଦିଅନ୍ତୁ', 'କପଡ଼ା ଭିଜିଗଲେ ତାହା କାଢ଼ନ୍ତୁ ନାହିଁ — ଉପରେ ଆଉ କପଡ଼ା ରଖନ୍ତୁ', 'ସମ୍ଭବ ହେଲେ ଆହତ ସ୍ଥାନକୁ ହୃଦୟଠାରୁ ଉପରେ ରଖନ୍ତୁ'],
      unconscious_no_breathing: ['ବ୍ୟକ୍ତିଙ୍କୁ କଠିନ ସ୍ଥାନରେ ପିଠି ଉପରେ ଶୁଆଇ ଶ୍ୱାସ ପଥ ଖୋଲିବା ପାଇଁ ମୁଣ୍ଡକୁ ଧୀରେ ପଛକୁ ନିଅନ୍ତୁ', 'ତୁରନ୍ତ ଛାତିର ମଝିରେ ୫–୬ ସେ.ମି. ଗଭୀରରେ ୧୧୦ BPM ରେ ଚାପ ଦିଅନ୍ତୁ', 'ପାରାମେଡିକ୍ ଆସିବା ପର୍ଯ୍ୟନ୍ତ ବନ୍ଦ କରନ୍ତୁ ନାହିଁ କିମ୍ବା ପାଣି/ଖାଦ୍ୟ ଦିଅନ୍ତୁ ନାହିଁ'],
      trapped_vehicle: ['ନିଆଁର ବିପଦ ନଥିଲେ ବ୍ୟକ୍ତିଙ୍କୁ ବାହାର କରନ୍ତୁ ନାହିଁ', 'ନିରାପଦ ହେଲେ ଗାଡ଼ିର ଇଞ୍ଜିନ୍ ବନ୍ଦ କରନ୍ତୁ', 'ସହାୟତା ଆସିବା ପର୍ଯ୍ୟନ୍ତ ବ୍ୟକ୍ତିଙ୍କୁ ଶାନ୍ତ ରଖନ୍ତୁ'],
      vehicle_fire: ['ସମସ୍ତଙ୍କୁ ଗାଡ଼ିଠାରୁ ଅତି କମରେ ୩୦ ମିଟର ଦୂରକୁ ନିଅନ୍ତୁ', 'ନିଜେ ଗାଡ଼ି ଖୋଲିବା କିମ୍ବା ନିଆଁ ଲିଭାଇବାକୁ ଚେଷ୍ଟା କରନ୍ତୁ ନାହିଁ', 'ନିରାପଦ ହେଲେ ଆସୁଥିବା ଗାଡ଼ିକୁ ସତର୍କ କରନ୍ତୁ'],
    },
  },
  hi: {
    title: 'रक्षक SOS', subtitle: 'राजमार्ग आपातकालीन सहायता', chooseLanguage: 'अपनी भाषा चुनें',
    languageHint: 'आगे बढ़ने के लिए भाषा चुनें', marker: 'राजमार्ग स्थान / सटीक GPS', gps: 'सटीक GPS स्थान खोजा जा रहा है...',
    gpsRequiredTitle: 'GPS लोकेशन की अनुमति जरूरी है', gpsRequiredDesc: 'आपके सटीक निर्देशांक नजदीकी आपातकालीन इकाइयों को भेजने के लिए Location चालू करें और GPS की अनुमति दें।',
    enableGps: 'सटीक GPS चालू करें', gpsLocked: 'सटीक Live GPS लॉक हो गया', gpsDenied: 'Location बंद है या अनुमति नहीं दी गई।',
    selectEmergency: 'आपातकाल का प्रकार चुनें — 1 टैप', victims: 'घायलों की अनुमानित संख्या',
    one: '1 व्यक्ति', twoThree: '2–3 लोग', mass: '4+ (बहुत से घायल)', autoDispatching: 'मदद अपने आप भेजी जा रही है',
    changeCategory: 'बदलने के लिए दूसरा प्रकार चुनें', transmitting: 'भेजा जा रहा है', beep: 'हर सेकंड ध्वनि होगी।',
    cancel: 'रद्द करें', instant: 'अभी भेजें', priority: 'प्राथमिक सहायता', requested: 'घायलों के लिए सहायता का अनुरोध',
    helpOnWay: 'मदद रास्ते में है', dispatched: 'निकटतम पुलिस और अस्पताल को SOS भेजा गया है', whileWait: 'मदद आने तक',
    legalTitle: 'गुड सेमेरिटन कानूनी सुरक्षा', legalHeading: 'आपको हिरासत में नहीं लिया, पूछताछ या बिल नहीं किया जा सकता',
    legalBody: 'मोटर वाहन अधिनियम 1988 की धारा 134A के तहत दुर्घटना पीड़ित की मदद करने वाले नागरिक को कानूनी सुरक्षा मिलती है।',
    saveLegal: 'कानूनी पास SMS में सेव करें', connectionLost: 'कनेक्शन नहीं है — सीधे इनका उपयोग करें',
    directHint: 'ये आपके मोबाइल नेटवर्क से सीधे काम करते हैं।', call: '112 पर कॉल करें', sms: '112 SMS',
    emergency: { severe_bleeding: 'गंभीर रक्तस्राव', unconscious_no_breathing: 'बेहोश / सांस बंद', trapped_vehicle: 'वाहन में फंसे हुए', vehicle_fire: 'वाहन में आग' },
    guidance: {
      severe_bleeding: ['साफ कपड़े से घाव पर जोर से दबाव डालें', 'कपड़ा भीग जाए तो उसे न हटाएं — ऊपर और कपड़ा रखें', 'संभव हो तो घायल हिस्से को हृदय से ऊपर रखें'],
      unconscious_no_breathing: ['व्यक्ति को कठोर सतह पर पीठ के बल लिटाएं और सांस का रास्ता खोलने के लिए सिर को धीरे पीछे करें', 'तुरंत छाती के बीच में 5–6 सेमी गहराई तक 110 BPM की गति से दबाएं', 'पैरामेडिक्स के आने तक रुकें नहीं और पानी/खाना न दें'],
      trapped_vehicle: ['आग का खतरा न हो तो व्यक्ति को बाहर निकालने की कोशिश न करें', 'सुरक्षित होने पर वाहन का इंजन बंद करें', 'मदद आने तक व्यक्ति को शांत रखें'],
      vehicle_fire: ['सभी लोगों को वाहन से कम से कम 30 मीटर दूर ले जाएं', 'वाहन खोलने या आग बुझाने की कोशिश न करें', 'सुरक्षित हो तो आने वाले यातायात को चेतावनी दें'],
    },
  },
} as const;

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
  nearestFire?: DispatchedUnit;
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
  const [language, setLanguage] = useState<Language>('en');
  const [isLanguageSelected, setIsLanguageSelected] = useState(false);
  const t = TRANSLATIONS[language];

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
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const updateConnectionStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (!online) {
        setIsTimerActive(false);
        setCountdown(null);
      }
    };

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    return () => {
      window.removeEventListener('online', updateConnectionStatus);
      window.removeEventListener('offline', updateConnectionStatus);
    };
  }, []);

  // ---------- QR identifies the marker; device GPS identifies the person ----------
  useEffect(() => {
    const km_id = searchParams.get('km_id');
    if (km_id) setKmId(km_id);

    setLocationLoading(true);
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            source: 'gps',
          });
          setKmId(km_id || 'GPS-DETECTED');
          setLocationError(null);
          setLocationLoading(false);
        },
        (error) => {
          console.error('GPS error:', error);
          setLocationError('Location access is off or was denied.');
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    } else {
      setLocationError('Geolocation not supported on this device.');
      setLocationLoading(false);
    }
  }, [searchParams]);

  const requestLocation = useCallback(() => {
    setLocationLoading(true);
    setLocationError(null);

    if (!('geolocation' in navigator)) {
      setLocationError('Location services are not supported on this device.');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: 'gps',
        });
        setLocationError(null);
        setLocationLoading(false);
      },
      (error) => {
        console.error('GPS retry error:', error);
        setLocationError('Location access is off or was denied.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

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

  const playCountdownBeep = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const context = audioContextRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch (error) {
      console.error('Countdown audio error:', error);
    }
  }, []);

  useEffect(() => {
    if (!isTimerActive || countdown === null) return;

    if (countdown === 0) {
      setIsTimerActive(false);
      setCountdown(null);
      void handleDispatch();
      return;
    }

    playCountdownBeep();
    const timer = window.setTimeout(() => {
      setCountdown((current) => (current === null ? null : current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, handleDispatch, isTimerActive, playCountdownBeep]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const handleEmergencySelect = (type: EmergencyType) => {
    if (!coords) {
      setLocationError('Location access is off or was denied.');
      return;
    }
    setSelectedEmergency(type);
    setVictimCount((current) => current || '1 Person');
    setDispatchError(null);
    setCountdown(10);
    setIsTimerActive(true);
  };

  const handleCancelDispatch = () => {
    setIsTimerActive(false);
    setCountdown(null);
    setSelectedEmergency(null);
    setVictimCount(null);
    setDispatchError(null);
  };

  const handleInstantDispatch = () => {
    setIsTimerActive(false);
    setCountdown(null);
    void handleDispatch();
  };

  // ---------- SMS body for zero-internet fallback ----------
  const emergencyLabel = selectedEmergency ? t.emergency[selectedEmergency] : 'Emergency';
  const victimLabel = victimCount
    ? victimCount === '1 Person'
      ? t.one
      : victimCount === '2–3 People'
        ? t.twoThree
        : t.mass
    : 'Unknown';
  const smsLocation = coords
    ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
    : 'Location unavailable';
  const offlineSpecialNote = selectedEmergency === 'trapped_vehicle'
    ? ' ALERT FIRE BRIGADE: Hydraulic cutters required for trapped victims.'
    : selectedEmergency === 'vehicle_fire'
      ? ' ALERT FIRE & TRAFFIC: Active vehicle fire or hazard; secure the perimeter and divert traffic.'
      : '';
  const smsMessage = language === 'or'
    ? `ରକ୍ଷକ SOS: ରାଜପଥ KM ${kmId} ରେ ଜରୁରୀକାଳୀନ ସହାୟତା ଆବଶ୍ୟକ। ସ୍ଥାନ: ${smsLocation}। ପ୍ରକାର: ${emergencyLabel}। ଆନୁମାନିକ ଆହତ: ${victimLabel}।${offlineSpecialNote} ତୁରନ୍ତ ସହାୟତା ପଠାନ୍ତୁ।`
    : language === 'hi'
      ? `रक्षक SOS: राजमार्ग KM ${kmId} पर आपातकालीन सहायता चाहिए। स्थान: ${smsLocation}। प्रकार: ${emergencyLabel}। अनुमानित घायल: ${victimLabel}।${offlineSpecialNote} तुरंत मदद भेजें।`
      : `RAKSHAK SOS: Emergency at Highway KM ${kmId}. Location: ${smsLocation}. Type: ${emergencyLabel}. Estimated Victims: ${victimLabel}.${offlineSpecialNote} Please send help immediately.`;
  const smsBody = encodeURIComponent(
    smsMessage
  );

  const legalPassSms = dispatchResult
    ? encodeURIComponent(
        `GOOD SAMARITAN DIGITAL SHIELD - Rakshak SOS\nAlert ID: ${dispatchResult.alertId}\nUnder Section 134A of the Motor Vehicles Act, 1988 (India), a bystander who in good faith renders emergency assistance to a road accident victim shall not be liable for any civil or criminal action for any injury or death caused, and shall not be forced to disclose personal details unless voluntarily offered, nor detained for questioning without consent.\nTimestamp: ${dispatchResult.timestamp}\nThis message serves as your digital record of good-faith emergency response.`
      )
    : '';

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-safe">
      {!isLanguageSelected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-2xl p-6 text-center shadow-2xl">
            <Globe2 className="w-8 h-8 mx-auto mb-3 text-red-400" />
            <h2 className="text-xl font-bold text-white">{t.chooseLanguage}</h2>
            <p className="text-sm text-neutral-400 mt-2 mb-5">{t.languageHint}</p>
            <div className="grid gap-3">
              {([['en', 'English'], ['or', 'ଓଡ଼ିଆ (Odia)'], ['hi', 'हिंदी (Hindi)']] as [Language, string][]).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLanguage(code);
                    setIsLanguageSelected(true);
                  }}
                  className={`rounded-xl p-3 font-bold ${code === 'or' ? 'bg-red-700 hover:bg-red-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center gap-2">
        <Siren className="w-6 h-6 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">{t.title}</h1>
          <p className="text-xs text-neutral-400 leading-tight">{t.subtitle}</p>
        </div>
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
          {(['en', 'or', 'hi'] as Language[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setLanguage(code);
                setIsLanguageSelected(true);
              }}
              className={`px-2 py-1 rounded text-[11px] font-bold ${language === code ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              {code === 'en' ? 'EN' : code === 'or' ? 'ଓଡ଼ି' : 'हिं'}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {isOnline === false && (
          <section className="bg-amber-950 border border-amber-800 rounded-2xl p-4 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200">{t.connectionLost}</p>
              <p className="text-sm text-amber-300 mt-1">
                {t.directHint}
              </p>
            </div>
          </section>
        )}

        {isOnline !== false && (
          <>
            {/* Location Card */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="bg-neutral-800 rounded-full p-2 flex-shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-400">{t.marker}</p>
                  <p className="text-xl font-bold">KM {kmId}</p>
                  {locationLoading && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t.gps}</span>
                    </div>
                  )}
                  {!locationLoading && coords && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-neutral-300 font-mono">
                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <Navigation className="w-3 h-3" />
                        {t.gpsLocked}
                      </span>
                    </div>
                  )}
                  {locationError && (
                    <div className="flex items-start gap-2 mt-2 text-sm text-amber-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p>{locationError}</p>
                        <button type="button" onClick={requestLocation} className="mt-2 font-semibold text-amber-300 underline">
                          {t.enableGps}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Emergency Triage Grid */}
            {!dispatchResult && (
              <section>
                <h2 className="text-sm font-semibold text-neutral-400 mb-2 px-1">
                  {t.selectEmergency}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {EMERGENCY_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedEmergency === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleEmergencySelect(cat.id)}
                        disabled={dispatching}
                        className={`${cat.color} rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2 min-h-[100px] sm:min-h-[120px] text-white font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="w-8 h-8" />
                        ) : (
                          <Icon className="w-8 h-8" strokeWidth={2.5} />
                        )}
                        <span className="text-sm text-center leading-tight">{t.emergency[cat.id]}</span>
                      </button>
                    );
                  })}
                </div>

                {isTimerActive && countdown !== null && selectedEmergency && (
                  <div className="mt-4 bg-neutral-950 border-2 border-red-600 rounded-2xl p-4 text-center shadow-lg shadow-red-950/40">
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                        <span className="text-xs font-bold text-red-300 uppercase tracking-wide">
                          {t.autoDispatching}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-400">{t.changeCategory}</span>
                    </div>

                    <div className="mx-auto my-4 w-32 h-32 rounded-full border-8 border-red-700 bg-red-950 flex items-center justify-center animate-pulse">
                      <span className="text-6xl font-black leading-none text-red-100 tabular-nums">
                        {countdown}
                      </span>
                    </div>

                    <p className="text-sm text-neutral-300">
                      {t.transmitting} <strong className="text-white">{emergencyLabel}</strong> in{' '}
                      <strong className="text-red-300">{countdown}s</strong>
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">{t.beep}</p>

                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={handleCancelDispatch}
                        className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm font-semibold border border-neutral-700"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={handleInstantDispatch}
                        disabled={dispatching || !victimCount}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t.instant}
                      </button>
                    </div>
                  </div>
                )}

                {selectedEmergency && (
                  <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-neutral-200 mb-3">
                      {t.victims}
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
                          {option === '1 Person' ? t.one : option === '2–3 People' ? t.twoThree : t.mass}
                        </button>
                      ))}
                    </div>
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
                language={language}
              />
            )}

            {/* CPR Metronome */}
            {showCpr && <CprMetronome onClose={() => setShowCpr(false)} />}
          </>
        )}

        {/* Offline-safe direct actions */}
        {isOnline === false && coords && <ZeroInternetFallback smsBody={smsBody} language={language} />}
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
  language,
}: {
  result: DispatchResponse;
  legalPassSms: string;
  language: Language;
}) {
  const t = TRANSLATIONS[language];
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
      {t.helpOnWay}
    </h2>
    <p className="text-sm text-emerald-100 mt-1">
      {t.dispatched}
    </p>
  </div>
</div>
        <div className="mt-4 space-y-3">
          <p className="bg-red-900/50 rounded-xl p-3 text-sm font-bold text-red-100">
            🚨 {t.priority}: {t.emergency[result.emergencyType as EmergencyType]} — {result.victimCount} {t.requested}
          </p>
          <div className="flex items-start gap-3 bg-emerald-700/30 rounded-xl p-3">
            <ShieldAlert className="w-5 h-5 text-emerald-100 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-50 leading-snug">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-200">Nearest Police Station</p>
              <p className="font-semibold">{result.nearestPolice.name}</p>
              <p className="text-emerald-100/80 text-xs mt-0.5">{result.nearestPolice.address}</p>
              <p className="text-emerald-100 text-xs mt-1 font-medium">{result.nearestPolice.distanceKm} km away</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-emerald-700/30 rounded-xl p-3">
            <Hospital className="w-5 h-5 text-emerald-100 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-50 leading-snug">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-200">Nearest Hospital</p>
              <p className="font-semibold">{result.nearestHospital.name}</p>
              <p className="text-emerald-100/80 text-xs mt-0.5">{result.nearestHospital.address}</p>
              <p className="text-emerald-100 text-xs mt-1 font-medium">{result.nearestHospital.distanceKm} km away</p>
            </div>
          </div>
          {result.nearestFire && (
            <div className="flex items-start gap-3 bg-amber-700/30 rounded-xl p-3">
              <span className="text-xl" aria-hidden="true">🚒</span>
              <div className="text-sm text-amber-50 leading-snug">
                <p className="font-semibold">Fire &amp; Rescue: {result.nearestFire.name}</p>
                <p className="text-amber-100/80 text-xs mt-0.5">{result.nearestFire.address}</p>
                <p className="text-amber-100 text-xs mt-1 font-medium">
                  {result.nearestFire.distanceKm} km away — Fire brigade notified
                </p>
              </div>
            </div>
          )}
        </div>
        {isMockMode && (
          <p className="text-xs text-emerald-100/80 mt-3 border-t border-emerald-500/40 pt-2">
            Local mock mode: Twilio credentials were not live. Units were still selected by distance.
          </p>
        )}
      </div>

      <FirstAidGuidance type={result.emergencyType as EmergencyType} language={language} />

      {/* Good Samaritan Digital Shield */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">
              {t.legalTitle}
            </p>
            <h3 className="text-lg font-bold text-neutral-900 mt-1 leading-snug">
              {t.legalHeading}
            </h3>
            <p className="text-sm text-neutral-700 mt-2 leading-relaxed">
              {t.legalBody} Show this badge and Alert ID #{result.alertId.slice(-6)} if asked.
            </p>
            <a
              href={`sms:112?body=${legalPassSms}`}
              className="mt-3 inline-flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" />
              {t.saveLegal}
            </a>
          </div>
        </div>
      </div>

    </section>
  );
}

function FirstAidGuidance({ type, language }: { type: EmergencyType; language: Language }) {
  const category = EMERGENCY_CATEGORIES.find((c) => c.id === type)!;
  const Icon = category.icon;
  const t = TRANSLATIONS[language];
  const guidance = t.guidance[type];

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-center gap-3 mb-3">
        <div className={`${category.color} rounded-full p-2.5 animate-pulse`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="font-bold text-neutral-100">{t.whileWait}: {t.emergency[type]}</h3>
      </div>
      <ul className="space-y-2">
        {guidance.map((step, i) => (
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
function ZeroInternetFallback({ smsBody, language }: { smsBody: string; language: Language }) {
  const t = TRANSLATIONS[language];
  return (
    <section className="bg-neutral-900 border-2 border-dashed border-neutral-700 rounded-2xl p-4">
      <h2 className="text-sm font-bold text-neutral-300 mb-1 flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-400" />
        {t.connectionLost}
      </h2>
      <p className="text-xs text-neutral-500 mb-3">
        {t.directHint}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <a
          href="tel:112"
          className="bg-green-700 hover:bg-green-600 active:bg-green-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white font-bold transition-colors"
        >
          <Phone className="w-7 h-7" />
          <span className="text-sm">{t.call}</span>
        </a>
        <a
          href={`sms:112?body=${smsBody}`}
          className="bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white font-bold transition-colors"
        >
          <MessageSquare className="w-7 h-7" />
          <span className="text-sm">{t.sms}</span>
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
    <div className="min-h-screen bg-red-950 text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
        <p className="text-red-100 text-sm font-semibold">Rakshak SOS is loading...</p>
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