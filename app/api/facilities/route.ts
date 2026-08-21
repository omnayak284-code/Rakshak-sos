import { NextRequest, NextResponse } from 'next/server';
import { fetchNearestFacilities } from '@/lib/emergencyService';

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lng = Number(request.nextUrl.searchParams.get('lng'));

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Valid lat and lng are required.' }, { status: 400 });
  }

  try {
    const facilities = await fetchNearestFacilities(lat, lng);
    return NextResponse.json(facilities, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Facility lookup failed:', error);
    return NextResponse.json({ error: 'Unable to locate nearby emergency facilities.' }, { status: 502 });
  }
}
