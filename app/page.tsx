// app/page.tsx
'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Siren, MapPin } from 'lucide-react';

// This is the highway marker this QR code represents.
// In a real deployment you'd generate one of these pages/codes per physical km marker.
const DEMO_KM_ID = '42';
const DEMO_LAT = '20.2961';
const DEMO_LNG = '85.8245';

export default function HomePage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const qrValue = `${baseUrl}/sos?km_id=${DEMO_KM_ID}&lat=${DEMO_LAT}&lng=${DEMO_LNG}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-4 text-center gap-6">
      <Siren className="w-14 h-14 text-red-500" />
      <div>
        <h1 className="text-2xl font-bold">Rakshak SOS</h1>
        <p className="text-neutral-400 mt-2 text-sm max-w-xs">
          Scan this code at the highway marker to instantly send your exact location to emergency dispatch.
        </p>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-xl">
        <div className="w-[180px] sm:w-[220px]">
          <QRCodeSVG value={qrValue} size={220} level="H" includeMargin={false} className="w-full h-auto" />
        </div>
      </div>

      <div className="flex items-center gap-2 text-neutral-500 text-xs bg-neutral-900 border border-neutral-800 rounded-full px-4 py-2">
        <MapPin className="w-3.5 h-3.5" />
        <span>Highway KM {DEMO_KM_ID} — Demo Marker</span>
      </div>

      <p className="text-neutral-600 text-xs max-w-xs">
        No camera or QR reader on hand? A first responder can still open{' '}
        <span className="text-neutral-400 font-mono">/sos</span> directly — the app will use live GPS instead.
      </p>
    </div>
  );
}