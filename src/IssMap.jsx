import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { splitAntimeridian } from './orbit.js'

// 우주 정거장 모양 아이콘 (태양전지판 + 트러스 + 모듈)
const issSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56">
  <defs>
    <linearGradient id="panel" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <g stroke="#1e293b" stroke-width="1">
    <rect x="2" y="10" width="10" height="18" fill="url(#panel)"/>
    <rect x="2" y="36" width="10" height="18" fill="url(#panel)"/>
    <rect x="14" y="10" width="10" height="18" fill="url(#panel)"/>
    <rect x="14" y="36" width="10" height="18" fill="url(#panel)"/>
    <rect x="40" y="10" width="10" height="18" fill="url(#panel)"/>
    <rect x="40" y="36" width="10" height="18" fill="url(#panel)"/>
    <rect x="52" y="10" width="10" height="18" fill="url(#panel)"/>
    <rect x="52" y="36" width="10" height="18" fill="url(#panel)"/>
    <rect x="2" y="30" width="60" height="4" fill="#cbd5e1"/>
    <rect x="12" y="28" width="2" height="8" fill="#94a3b8"/>
    <rect x="50" y="28" width="2" height="8" fill="#94a3b8"/>
    <rect x="28" y="18" width="8" height="28" rx="2" fill="#f8fafc"/>
    <rect x="25" y="24" width="14" height="6" rx="1.5" fill="#e2e8f0"/>
    <circle cx="32" cy="38" r="2" fill="#4f46e5"/>
  </g>
</svg>`

const issIcon = L.divIcon({
  className: 'iss-icon',
  html: issSvg,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
})

function FollowIss({ position, follow }) {
  const map = useMap()
  useEffect(() => {
    if (follow && position) map.panTo([position.latitude, position.longitude], { animate: true })
  }, [map, follow, position])
  return null
}

export default function IssMap({ position, segments, follow }) {
  return (
    <MapContainer center={[0, 0]} zoom={2} minZoom={1} worldCopyJump className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {segments.map((seg, i) =>
        splitAntimeridian(seg.points).map((line, j) => (
          <Polyline
            key={`${i}-${j}`}
            positions={line}
            pathOptions={
              seg.inferred
                ? { color: '#4f46e5', weight: 2.5, opacity: 0.8, dashArray: '6 8' }
                : { color: '#06b6d4', weight: 4, opacity: 0.95 }
            }
          />
        )),
      )}
      {position && (
        <Marker position={[position.latitude, position.longitude]} icon={issIcon}>
          <Tooltip direction="top" offset={[0, -24]}>
            ISS · {position.latitude.toFixed(3)}, {position.longitude.toFixed(3)}
          </Tooltip>
        </Marker>
      )}
      <FollowIss position={position} follow={follow} />
    </MapContainer>
  )
}
