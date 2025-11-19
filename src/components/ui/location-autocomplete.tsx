"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { MapPin } from "lucide-react"

interface LocationSuggestion {
  name: string
  code?: string
  lat?: number
  lng?: number
  state?: string
}

interface LocationAutocompleteProps {
  value: string
  onChange: (location: string, latitude: number, longitude: number) => void
  placeholder?: string
  className?: string
  type: "country" | "city"
  country?: string
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "start typing...",
  className = "",
  type,
  country,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Sync query with value prop
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Update dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }, [])

  const loadCountries = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/countries')
      if (response.ok) {
        const data = await response.json()
        const countries = data.countries || []
        const filtered = countries.filter((c: any) =>
          c.name.toLowerCase().includes(query.toLowerCase())
        )
        const countrySuggestions = filtered.slice(0, 5).map((c: any) => ({ name: c.name, code: c.code }))
        setSuggestions(countrySuggestions)
        if (countrySuggestions.length > 0) {
          setShowSuggestions(true)
          updateDropdownPosition()
        } else {
          setShowSuggestions(false)
        }
      } else {
        console.error("Failed to load countries:", response.status)
        setSuggestions([])
        setShowSuggestions(false)
      }
    } catch (error) {
      console.error("Error loading countries:", error)
      setSuggestions([])
      setShowSuggestions(false)
    } finally {
      setLoading(false)
    }
  }, [query])

  const searchCities = useCallback(async () => {
    if (!country) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/places-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${query}, ${country}`,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const hits = data.hits || []
      
      const cityList: LocationSuggestion[] = hits
        .filter((hit: any) => {
          const hitCountry = hit.country?.default?.[0] || ""
          return hitCountry.toLowerCase() === country.toLowerCase()
        })
        .map((hit: any) => ({
          name: hit.city?.default?.[0] || hit.locale_names?.default?.[0]?.split(',')[0] || "",
          lat: hit._geoloc?.lat || 0,
          lng: hit._geoloc?.lng || 0,
          state: hit.administrative?.[0] || undefined,
        }))
        .filter((city: LocationSuggestion) => city.name.length > 0)
      
      const uniqueCities = cityList.filter((city, index, self) =>
        index === self.findIndex((c) => c.name.toLowerCase() === city.name.toLowerCase())
      )
      
      const citySuggestions = uniqueCities.slice(0, 5)
      setSuggestions(citySuggestions)
      if (citySuggestions.length > 0) {
        setShowSuggestions(true)
        updateDropdownPosition()
      } else {
        setShowSuggestions(false)
      }
    } catch (error) {
      console.error("Error searching cities:", error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [query, country, updateDropdownPosition])

  // Load countries or search cities
  useEffect(() => {
    if (type === "country") {
      if (query.length < 1) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      // Load countries from API
      loadCountries()
    } else {
      // Search cities
      if (query.length < 2 || !country) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      searchCities()
    }
  }, [query, type, country, loadCountries, searchCities, updateDropdownPosition])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setQuery(newValue)
    setSelectedIndex(-1)
    if (!newValue) {
      onChange("", 0, 0)
    }
  }

  const handleSelect = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.name)
    setShowSuggestions(false)
    setSuggestions([])
    
    if (type === "country") {
      // For country, only pass the country name
      onChange(suggestion.name, 0, 0)
    } else {
      // For city, pass city name and coordinates
      onChange(suggestion.name, suggestion.lat || 0, suggestion.lng || 0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex])
        }
        break
      case "Escape":
        setShowSuggestions(false)
        break
    }
  }

  // Update position when suggestions show
  useEffect(() => {
    if (showSuggestions && suggestions.length > 0) {
      updateDropdownPosition()
    }
  }, [showSuggestions, suggestions.length, updateDropdownPosition])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true)
          }
        }}
        placeholder={placeholder}
        className={`w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation ${className}`}
        style={{ minHeight: '48px' }}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <MapPin className="w-5 h-5 text-teal-300/60" />
      </div>

      {/* Suggestions dropdown - render in portal to avoid overflow clipping */}
      {showSuggestions && suggestions.length > 0 && typeof window !== 'undefined' && createPortal(
        <div
          ref={suggestionsRef}
          className="fixed z-[9999] bg-[#0a0f1f] border border-teal-300/20 rounded-xl shadow-2xl overflow-hidden"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.name}-${index}`}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className={`w-full px-3 py-2.5 text-left transition-all duration-200 ${
                index === selectedIndex 
                  ? "bg-teal-300/20 text-teal-300" 
                  : "text-white/90 hover:bg-white/5 hover:text-white"
              } ${index !== suggestions.length - 1 ? "border-b border-white/5" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-300/10 flex items-center justify-center">
                  <MapPin className={`w-3.5 h-3.5 ${
                    index === selectedIndex ? "text-teal-300" : "text-teal-300/60"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    index === selectedIndex ? "text-teal-300" : "text-white"
                  }`}>
                    {suggestion.name}
                  </p>
                  {suggestion.state && (
                    <p className="text-xs text-white/50">
                      {suggestion.state}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
