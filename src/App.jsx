import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import IssMap from './IssMap.jsx'
import { useIssTracker } from './useIssTracker.js'
import { clearPositions } from './db.js'

const fmt = (n, digits = 0) => (n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }))
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('ko-KR') : '—')

export default function App() {
  const queryClient = useQueryClient()
  const { issQuery, points, segments, speedKmh, polling } = useIssTracker()
  const [follow, setFollow] = useState(true)
  const position = issQuery.data
  const inferredCount = segments.filter((s) => s.inferred).length

  const handleClear = async () => {
    await clearPositions()
    queryClient.invalidateQueries({ queryKey: ['track'] })
  }

  return (
    <>
      <div className="topbar">
        <span className="brand">🛰️ ISS Tracker</span>
        <nav>
          <a href="#map">실시간 지도</a>
          <a href="#stats">속도 · Polling</a>
          <a href="#about">궤적 계산</a>
        </nav>
      </div>

      <header className="hero">
        <span className="badge">Open Notify API · React 19 · TanStack Query · IndexedDB</span>
        <h1>국제 우주 정거장 실시간 추적</h1>
        <p>ISS의 현재 위치와 최근 4시간의 궤적을 지도 위에 표시합니다. 수집되지 않은 구간은 궤도 모델로 계산해 점선으로 그립니다.</p>
      </header>

      <main>
        <section id="map">
          <div className="section-head">
            <span className="chip">LIVE</span>
            <h2>현재 위치와 4시간 궤적</h2>
          </div>

          <div className="card map-card">
            <div className="map-toolbar">
              <div className="legend">
                <span><i className="line solid" />실측 궤적</span>
                <span><i className="line dashed" />계산/유추 궤적</span>
              </div>
              <div className="actions">
                <label>
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> ISS 따라가기
                </label>
                <button type="button" onClick={handleClear}>기록 초기화</button>
              </div>
            </div>
            <IssMap position={position} segments={segments} follow={follow} />
            {issQuery.isError && <p className="error">⚠️ API 요청 실패: {issQuery.error.message} — 잠시 후 다시 시도합니다.</p>}
          </div>
        </section>

        <section id="stats">
          <div className="section-head">
            <span className="chip">STATUS</span>
            <h2>이동 속도 · Polling 상태</h2>
          </div>

          <div className="card">
            <div className="status-grid">
              <div className="status s3">
                <b>{fmt(speedKmh)} km/h</b>ISS 이동 속도
                <small>{speedKmh ? `≈ ${fmt(speedKmh / 3600, 2)} km/s` : '측정 중…'}</small>
              </div>
              <div className="status s2">
                <b>{fmt(polling.interval / 1000, 1)} 초</b>API Polling 간격
                <small>최소 5초 · 응답속도 기반 자동 조절</small>
              </div>
              <div className="status s4">
                <b>{fmt(polling.lastResponseMs)} ms</b>API 응답 속도
                <small>평균(EMA) {fmt(polling.avgResponseMs)} ms</small>
              </div>
              <div className="status s5">
                <b>{points.length.toLocaleString('ko-KR')} 개</b>IndexedDB 저장 좌표
                <small>추정 구간 {inferredCount}개</small>
              </div>
            </div>
            <table>
              <tbody>
                <tr><th>위도</th><td><code>{position ? position.latitude.toFixed(4) : '—'}</code></td></tr>
                <tr><th>경도</th><td><code>{position ? position.longitude.toFixed(4) : '—'}</code></td></tr>
                <tr><th>위치 기준 시각</th><td>{fmtTime(position?.timestamp)}</td></tr>
                <tr><th>마지막 수신</th><td>{fmtTime(issQuery.dataUpdatedAt)} {issQuery.isFetching && <span className="fetching">요청 중…</span>}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="about">
          <div className="section-head">
            <span className="chip">INFO</span>
            <h2>궤적은 어떻게 계산되나요?</h2>
          </div>
          <div className="card">
            <h3>🧮 궤적 계산 / 유추 규칙</h3>
            <ol className="steps">
              <li>수신한 좌표는 브라우저 IndexedDB에 저장되며, 4시간이 지난 좌표는 자동으로 삭제됩니다.</li>
              <li>저장된 좌표 사이에 90초 이상 끊긴 구간이 있으면 양 끝 좌표에서 궤도를 앞뒤로 전파해 이어 붙입니다.</li>
              <li>4시간 이내 기록이 부족하면 가장 오래된 수집 좌표에서 4시간 전까지 궤도를 역산합니다.</li>
              <li>궤도 모델: 경사각 51.64°, 주기 92.68분의 원 궤도 + 지구 자전 + 승교점 세차(J2).</li>
              <li>Polling 간격 = max(5초, 평균 응답시간 × 10), 오류 발생 시 간격을 2배로 늘립니다(최대 60초).</li>
            </ol>
          </div>
        </section>
      </main>

      <footer>
        데이터 출처: <a href="http://open-notify.org/" target="_blank" rel="noreferrer">Open Notify</a> · 지도: OpenStreetMap
      </footer>
    </>
  )
}
