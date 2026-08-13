import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import L from 'leaflet'
import { Call, Mode } from '../types'

export interface MapHandle {
  flyTo: (lat: number, lon: number) => void
}

interface Props {
  calls: Call[]
  mode: Mode
}

interface ApiState {
  fire_perimeter?: GeoJSON.GeoJsonObject
  resources?: Array<{ id: string; lat: number; lon: number; available: boolean }>
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  URGENT:   '#f59e0b',
  STANDARD: '#3b82f6',
  PENDING:  '#94a3b8',
}

function popupContent(call: Call): string {
  const color = SEV_COLOR[call.severity] ?? '#94a3b8'
  const unitRow = call.unit_id
    ? `<div style="border-top:1px solid #334155;margin-top:4px;padding-top:4px">Unit: ${call.unit_id}</div>
       ${call.eta_minutes != null ? `<div>ETA: ${call.eta_minutes} min</div>` : ''}`
    : ''
  const vulnRow = call.vulnerable
    ? `<div style="color:#f59e0b">&#9888; Vulnerable caller</div>`
    : ''
  return `<div style="font-family:monospace;font-size:12px;line-height:1.6;min-width:160px">
    <div style="font-weight:700">${call.id}</div>
    <span style="background:${color};color:white;padding:1px 8px;border-radius:999px;font-size:11px">${call.severity}</span>
    <div>Type: ${call.incident_type}</div>
    <div>Zone: ${call.zone}</div>
    ${vulnRow}
    ${unitRow}
  </div>`
}

const MapView = forwardRef<MapHandle, Props>(({ calls, mode }, ref) => {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const fireLayerRef = useRef<L.GeoJSON | null>(null)
  const callMarkersRef = useRef<Map<string, L.CircleMarker | L.Marker>>(new Map())
  const layersRef = useRef<{
    unitMarkers: L.CircleMarker[]
    availCount: number
    totalCount: number
  }>({ unitMarkers: [], availCount: 0, totalCount: 0 })
  const [fireGeoJson, setFireGeoJson] = useState<GeoJSON.GeoJsonObject | null>(null)

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon) => mapRef.current?.flyTo([lat, lon], 13, { animate: true, duration: 0.8 }),
  }))

  // Init map once
  useEffect(() => {
    if (!elRef.current || mapRef.current) return

    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false })
      .setView([39.85, -121.62], 9)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    fetch('/api/state')
      .then((r) => r.json())
      .then((data: ApiState) => {
        if (!mapRef.current) return

        if (data.fire_perimeter) {
          setFireGeoJson(data.fire_perimeter)
        }

        if (data.resources) {
          layersRef.current.availCount = data.resources.filter((u) => u.available).length
          layersRef.current.totalCount = data.resources.length
          layersRef.current.unitMarkers = data.resources.map((unit) =>
            L.circleMarker([unit.lat, unit.lon], {
              radius: 6,
              color: unit.available ? '#16a34a' : '#475569',
              fillColor: unit.available ? '#22c55e' : '#64748b',
              fillOpacity: unit.available ? 0.95 : 0.7,
              weight: 2,
            })
              .bindTooltip(`Unit ${unit.id} — ${unit.available ? 'Available' : 'Dispatched'}`, { sticky: true })
              .addTo(mapRef.current!)
          )
        }
      })
      .catch(() => {/* backend not running yet */})

    return () => {
      callMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Toggle fire perimeter based on mode
  useEffect(() => {
    if (!mapRef.current) return
    if (mode === 'SURGE' && fireGeoJson && !fireLayerRef.current) {
      fireLayerRef.current = L.geoJSON(fireGeoJson, {
        style: { color: '#ea580c', weight: 2, fillColor: '#fed7aa', fillOpacity: 0.35 },
      })
        .bindTooltip('Affected Area — Park Fire 2024', { sticky: true })
        .addTo(mapRef.current)
    } else if (mode !== 'SURGE' && fireLayerRef.current) {
      fireLayerRef.current.remove()
      fireLayerRef.current = null
    }
  }, [mode, fireGeoJson])

  // Sync call markers
  useEffect(() => {
    if (!mapRef.current) return

    const currentIds = new Set(calls.map((c) => c.id))

    // Remove stale markers
    callMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove()
        callMarkersRef.current.delete(id)
      }
    })

    // Add / update markers
    for (const call of calls) {
      if (call.lat == null || call.lon == null) continue

      const existing = callMarkersRef.current.get(call.id)
      const color = SEV_COLOR[call.severity] ?? '#94a3b8'
      const fillOpacity = call.unit_id ? 0.4 : 0.85
      const popup = popupContent(call)

      if (call.severity === 'CRITICAL') {
        const icon = L.divIcon({
          className: 'call-critical-icon',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#dc2626;animation:call-ping 1.5s ease-out infinite"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10],
        })
        if (!(existing instanceof L.Marker)) {
          existing?.remove()
          const marker = L.marker([call.lat, call.lon], { icon })
            .bindPopup(popup)
            .addTo(mapRef.current!)
          callMarkersRef.current.set(call.id, marker)
        } else {
          existing.bindPopup(popup)
        }
      } else {
        const radius = call.severity === 'URGENT' ? 10 : 8
        if (existing instanceof L.CircleMarker && !(existing instanceof L.Marker)) {
          existing.setStyle({ color, fillColor: color, fillOpacity })
          existing.bindPopup(popup)
        } else {
          existing?.remove()
          const marker = L.circleMarker([call.lat, call.lon], {
            radius,
            color,
            fillColor: color,
            fillOpacity,
            weight: 2,
          })
            .bindPopup(popup)
            .addTo(mapRef.current!)
          callMarkersRef.current.set(call.id, marker)
        }
      }
    }
  }, [calls])

  const stats = useMemo(() => ({
    avail: layersRef.current.availCount,
    total: layersRef.current.totalCount,
    calls: calls.length,
  }), [calls.length])

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Incident Map · Butte County</span>
        <span className="count mono">39.85°N 121.62°W</span>
      </div>
      <div className="map-wrap">
        <div id="map" ref={elRef} />
        <div className="map-stat">
          <div>UNITS <span className="v">{stats.avail}/{stats.total}</span></div>
          <div>CALLS <span className="v">{stats.calls}</span></div>
          <div>FIRE <span className="v" style={{ color: '#fb923c' }}>429,083 ac</span></div>
        </div>
        <div className="map-legend" aria-hidden>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#dc2626' }} />
            Critical
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#f59e0b' }} />
            Urgent
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#3b82f6' }} />
            Standard
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#22c55e' }} />
            Available unit
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: '#64748b' }} />
            Unavailable
          </div>
          {mode === 'SURGE' && (
            <div className="legend-row">
              <span className="legend-swatch" style={{ background: '#fed7aa', borderRadius: 2 }} />
              Affected area
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

MapView.displayName = 'MapView'
export default MapView
