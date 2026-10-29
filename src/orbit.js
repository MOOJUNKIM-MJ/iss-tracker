// ISS 궤도 계산 / 유추 (원 궤도 근사 모델)
const DEG = Math.PI / 180
const INCLINATION = 51.64 * DEG // 궤도 경사각
const PERIOD_S = 92.68 * 60 // 공전 주기(초)
const MEAN_MOTION = (2 * Math.PI) / PERIOD_S // rad/s
const EARTH_ROT = (2 * Math.PI) / 86164.1 // 지구 자전 각속도(rad/s, 항성일)
const NODE_PRECESSION = (-5.0 * DEG) / 86400 // J2 섭동에 의한 승교점 이동(rad/s)
export const EARTH_RADIUS_KM = 6371
export const ISS_ALTITUDE_KM = 420

const wrapLon = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180

// 관측 지점(lat, lon)과 진행 방향으로 궤도 상태(위도 인수 u, 승교점 경도 Ω)를 구한다
function orbitState(p, ascending) {
  const s = Math.max(-1, Math.min(1, Math.sin(p.latitude * DEG) / Math.sin(INCLINATION)))
  let u = Math.asin(s)
  if (!ascending) u = Math.PI - u
  const node = p.longitude * DEG - Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u))
  return { u, node, t: p.timestamp }
}

function propagate(state, t) {
  const dt = (t - state.t) / 1000
  const u = state.u + MEAN_MOTION * dt
  const lat = Math.asin(Math.sin(INCLINATION) * Math.sin(u)) / DEG
  const lon =
    (state.node + Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u)) + (NODE_PRECESSION - EARTH_ROT) * dt) /
    DEG
  return { latitude: lat, longitude: wrapLon(lon), timestamp: t }
}

const isAscending = (a, b) => b.latitude >= a.latitude

// 두 지점 사이를 앞/뒤 양방향 전파 후 시간 가중 평균으로 보간 → 양 끝이 실측점과 정확히 이어진다
function bridge(a, aPrev, b, bNext, stepMs) {
  const sa = orbitState(a, aPrev ? isAscending(aPrev, a) : isAscending(a, b))
  const sb = orbitState(b, bNext ? isAscending(b, bNext) : isAscending(a, b))
  const out = [a]
  for (let t = a.timestamp + stepMs; t < b.timestamp; t += stepMs) {
    const pa = propagate(sa, t)
    const pb = propagate(sb, t)
    const w = (t - a.timestamp) / (b.timestamp - a.timestamp)
    const dLon = wrapLon(pb.longitude - pa.longitude)
    out.push({
      latitude: pa.latitude * (1 - w) + pb.latitude * w,
      longitude: wrapLon(pa.longitude + dLon * w),
      timestamp: t,
    })
  }
  out.push(b)
  return out
}

/**
 * 저장된 실측 좌표로부터 궤적 세그먼트 목록을 만든다.
 * - 실측 구간: { inferred: false }
 * - 단절 구간 / 수집 이전 4시간 구간: { inferred: true } (점선 표시)
 */
export function buildTrack(points, { now = Date.now(), windowMs, gapMs = 90_000, stepMs = 30_000 }) {
  const pts = [...points].sort((a, b) => a.timestamp - b.timestamp)
  if (pts.length === 0) return []
  const segments = []
  const start = now - windowMs

  // 1) 가장 오래된 실측점 이전 ~ 4시간 전까지 역산
  if (pts.length >= 2 && pts[0].timestamp - start > gapMs) {
    const st = orbitState(pts[0], isAscending(pts[0], pts[1]))
    const back = []
    for (let t = start; t < pts[0].timestamp; t += stepMs) back.push(propagate(st, t))
    back.push(pts[0])
    segments.push({ inferred: true, points: back })
  }

  // 2) 실측 구간과 단절 구간 분리
  let current = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (b.timestamp - a.timestamp > gapMs) {
      segments.push({ inferred: false, points: current })
      segments.push({ inferred: true, points: bridge(a, pts[i - 2], b, pts[i + 1], stepMs) })
      current = [b]
    } else {
      current.push(b)
    }
  }
  segments.push({ inferred: false, points: current })
  return segments.filter((s) => s.points.length >= 2 || !s.inferred)
}

// 날짜 변경선(±180°)을 넘는 구간을 끊어서 지도에 가로줄이 생기지 않게 한다
export function splitAntimeridian(points) {
  const lines = []
  let line = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (line.length && Math.abs(p.longitude - points[i - 1].longitude) > 180) {
      lines.push(line)
      line = []
    }
    line.push([p.latitude, p.longitude])
  }
  if (line.length) lines.push(line)
  return lines
}

// 대원 거리(궤도 반경 기준, km)
export function orbitalDistanceKm(a, b) {
  const R = EARTH_RADIUS_KM + ISS_ALTITUDE_KM
  const dLat = (b.latitude - a.latitude) * DEG
  const dLon = (b.longitude - a.longitude) * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 최근 실측점들로 이동 속도(km/h) 계산
export function computeSpeedKmh(points) {
  const pts = [...points].sort((a, b) => a.timestamp - b.timestamp)
  if (pts.length < 2) return null
  const b = pts[pts.length - 1]
  // 타임스탬프 해상도(1초) 오차를 줄이기 위해 최소 20초 이상 떨어진 점을 사용
  let a = pts[pts.length - 2]
  for (let i = pts.length - 2; i >= 0; i--) {
    if (b.timestamp - pts[i].timestamp > 120_000) break
    a = pts[i]
    if (b.timestamp - a.timestamp >= 20_000) break
  }
  const dtH = (b.timestamp - a.timestamp) / 3_600_000
  if (dtH <= 0 || b.timestamp - a.timestamp > 120_000) return null
  return orbitalDistanceKm(a, b) / dtH
}
