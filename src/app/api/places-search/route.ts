import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()
    
    if (!query || query.length < 2) {
      return NextResponse.json({ hits: [] })
    }

    // Use OpenStreetMap Nominatim API (free, no API key required)
    // This provides location autocomplete similar to Algolia Places
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SpeedDateApp/1.0', // Required by Nominatim
        },
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    
    // Transform Nominatim results to match our LocationSuggestion interface
    const hits = data.map((item: any, index: number) => {
      // Extract city name (prioritize city, then town, then village, then first part of display_name)
      const cityName = item.address?.city || 
                       item.address?.town || 
                       item.address?.village || 
                       item.address?.municipality ||
                       item.display_name?.split(',')[0]?.trim() || 
                       ''
      
      // Extract country
      const country = item.address?.country || ''
      
      // Extract state/administrative region
      const state = item.address?.state || item.address?.region || ''
      
      return {
        objectID: `nominatim-${item.place_id || index}`,
        locale_names: { default: [item.display_name] },
        city: { default: [cityName] },
        administrative: state ? [state] : [],
        country: { default: [country] },
        _geoloc: {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        },
      }
    })

    return NextResponse.json({ hits })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in places search API:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      })
    }
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined },
      { status: 500 }
    )
  }
}

