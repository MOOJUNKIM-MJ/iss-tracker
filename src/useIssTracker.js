import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { savePosition, pruneOld, loadPositions, RETENTION_MS } from './db.js'
import { buildTrack, computeSpeedKmh } from './orbit.js'

const API_URL = 'http://api.open-notify.org/iss-now.json'
const MIN_INTERVAL = 5_000 // Polling 최소 간격 5초
const MAX_INTERVAL = 60_000
const RESPONSE_FACTOR = 10 // 응답시간의 10배를 폴링 간격으로 (최소 5초)
const EMA_ALPHA = 0.3
const REQUEST_TIMEOUT = 10_000

async function fetchIssPosition({ signal }) {
  const started = performance.now()
  const res = await fetch(API_URL, {
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT)]),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const responseMs = performance.now() - started
  if (json.message !== 'success') throw new Error('API 응답 오류')

  const position = {
    latitude: Number(json.iss_position.latitude),
    longitude: Number(json.iss_position.longitude),
    timestamp: json.timestamp * 1000,
  }
  await savePosition(position)
  await pruneOld()
  return { ...position, responseMs }
}

export function useIssTracker() {
  const queryClient = useQueryClient()
  const [polling, setPolling] = useState({ interval: MIN_INTERVAL, avgResponseMs: null, lastResponseMs: null })
  const emaRef = useRef(null)

  const issQuery = useQuery({
    queryKey: ['iss-now'],
    queryFn: fetchIssPosition,
    refetchInterval: polling.interval,
    refetchIntervalInBackground: true,
    retry: 1,
  })

  // 매 응답마다 응답속도를 측정해 Polling 간격을 재조정
  useEffect(() => {
    const data = issQuery.data
    if (!data || !issQuery.dataUpdatedAt) return
    emaRef.current = emaRef.current == null ? data.responseMs : EMA_ALPHA * data.responseMs + (1 - EMA_ALPHA) * emaRef.current
    const interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(emaRef.current * RESPONSE_FACTOR)))
    setPolling({ interval, avgResponseMs: emaRef.current, lastResponseMs: data.responseMs })
    queryClient.invalidateQueries({ queryKey: ['track'] })
  }, [issQuery.dataUpdatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // 오류 시 지수 백오프
  useEffect(() => {
    if (!issQuery.errorUpdatedAt) return
    setPolling((p) => ({ ...p, interval: Math.min(MAX_INTERVAL, p.interval * 2) }))
  }, [issQuery.errorUpdatedAt])

  // IndexedDB에 저장된 최근 4시간 좌표 (1분마다 만료 데이터 정리)
  const trackQuery = useQuery({
    queryKey: ['track'],
    queryFn: async () => {
      await pruneOld()
      return { points: await loadPositions(), now: Date.now() }
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })

  const points = trackQuery.data?.points ?? []
  const segments = useMemo(
    () => buildTrack(points, { now: trackQuery.data?.now ?? Date.now(), windowMs: RETENTION_MS }),
    [points, trackQuery.data?.now],
  )
  const speedKmh = useMemo(() => computeSpeedKmh(points), [points])

  return { issQuery, trackQuery, points, segments, speedKmh, polling }
}
