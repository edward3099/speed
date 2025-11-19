import { NextResponse } from 'next/server'

// Common countries list - in production, you might want to fetch from an API
const COUNTRIES = [
  { name: "United States", code: "US" },
  { name: "United Kingdom", code: "GB" },
  { name: "Canada", code: "CA" },
  { name: "Australia", code: "AU" },
  { name: "Germany", code: "DE" },
  { name: "France", code: "FR" },
  { name: "Italy", code: "IT" },
  { name: "Spain", code: "ES" },
  { name: "Netherlands", code: "NL" },
  { name: "Belgium", code: "BE" },
  { name: "Switzerland", code: "CH" },
  { name: "Austria", code: "AT" },
  { name: "Sweden", code: "SE" },
  { name: "Norway", code: "NO" },
  { name: "Denmark", code: "DK" },
  { name: "Finland", code: "FI" },
  { name: "Poland", code: "PL" },
  { name: "Portugal", code: "PT" },
  { name: "Greece", code: "GR" },
  { name: "Ireland", code: "IE" },
  { name: "New Zealand", code: "NZ" },
  { name: "Japan", code: "JP" },
  { name: "South Korea", code: "KR" },
  { name: "Singapore", code: "SG" },
  { name: "India", code: "IN" },
  { name: "Brazil", code: "BR" },
  { name: "Mexico", code: "MX" },
  { name: "Argentina", code: "AR" },
  { name: "South Africa", code: "ZA" },
  { name: "United Arab Emirates", code: "AE" },
].sort((a, b) => a.name.localeCompare(b.name))

export async function GET() {
  return NextResponse.json({ countries: COUNTRIES })
}

