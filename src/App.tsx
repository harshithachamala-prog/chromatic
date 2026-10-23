
import { useEffect, useState } from 'react'
import {
  Palette,
  ArrowUpRight,
  Heart,
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  Cell,
} from 'recharts'
import { supabase } from './lib/supabase'
import './App.css'

const colors = [
  { name: 'Blue', hex: '#5278E8', votes: 0, group: 'Cool' },
  { name: 'Purple', hex: '#9868DC', votes: 0, group: 'Cool' },
  { name: 'Green', hex: '#45A879', votes: 0, group: 'Nature' },
  { name: 'Pink', hex: '#ED8DB6', votes: 0, group: 'Warm' },
  { name: 'Black', hex: '#292929', votes: 0, group: 'Neutral' },
  { name: 'Orange', hex: '#F39A52', votes: 0, group: 'Warm' },
  { name: 'Red', hex: '#E45D63', votes: 0, group: 'Warm' },
  { name: 'Yellow', hex: '#E8C84A', votes: 0, group: 'Warm' },
]

type Color = (typeof colors)[number]
type RankedColor = {
  name: string
  hex: string
  votes: number
  lastVoteAt: string
}

export default function App() {
  const [selected, setSelected] = useState('')
  const [selectedHex, setSelectedHex] = useState('#5278E8')
  const [hexInput, setHexInput] = useState('#5278E8')
  const [colorStudioOpen, setColorStudioOpen] = useState(false)
  const [hue, setHue] = useState(220)
  const [saturation, setSaturation] = useState(78)
  const [brightness, setBrightness] = useState(91)
  const [category, setCategory] = useState('All colors')
  const [votes, setVotes] = useState<Color[]>(colors)
  const [rankedColors, setRankedColors] = useState<RankedColor[]>([])
  const [voted, setVoted] = useState(false)
  const [submittingVote, setSubmittingVote] = useState(false)
  const [loadingVotes, setLoadingVotes] = useState(true)
  const [voteError, setVoteError] = useState('')
  const [query, setQuery] = useState('')

  async function loadVotes() {
    const { data, error } = await supabase
      .from('color_votes')
      .select('color_name, color_hex, created_at')
      .eq('category', 'favorite')

    if (error) {
      console.error('Failed to load votes:', error.message)
      setVoteError('Unable to load community votes. Please try again.')
      setLoadingVotes(false)
      return false
    }

    const presetCounts: Record<string, number> = {}
    const byHex = new Map<string, RankedColor>()

    for (const vote of data ?? []) {
      const rawHex = typeof vote.color_hex === 'string' ? vote.color_hex : ''
      const matchingPreset = colors.find(
        (color) => color.name === vote.color_name || color.hex.toLowerCase() === rawHex.toLowerCase(),
      )
      if (matchingPreset) {
        presetCounts[matchingPreset.name] = (presetCounts[matchingPreset.name] ?? 0) + 1
      }

      // Older rows may not have a HEX value, so fall back to the preset color.
      const hex = /^#[0-9a-fA-F]{6}$/.test(rawHex)
        ? rawHex.toUpperCase()
        : matchingPreset?.hex
      if (!hex) continue

      const key = hex.toUpperCase()
      const existing = byHex.get(key)
      const createdAt = vote.created_at ?? ''
      const displayName = matchingPreset?.name ?? (vote.color_name && vote.color_name !== 'Custom' ? vote.color_name : key)

      if (existing) {
        existing.votes += 1
        if (createdAt > existing.lastVoteAt) existing.lastVoteAt = createdAt
      } else {
        byHex.set(key, { name: displayName, hex: key, votes: 1, lastVoteAt: createdAt })
      }
    }

    setVotes(colors.map((color) => ({ ...color, votes: presetCounts[color.name] ?? 0 })))
    setRankedColors(
      [...byHex.values()].sort((a, b) => b.votes - a.votes || b.lastVoteAt.localeCompare(a.lastVoteAt) || a.hex.localeCompare(b.hex)),
    )
    setVoteError('')
    setLoadingVotes(false)
    return true
  }

  useEffect(() => {
    void loadVotes()

    // Refresh immediately when Supabase broadcasts a new vote.
    const channel = supabase
      .channel('chromatic-color-votes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'color_votes', filter: 'category=eq.favorite' },
        () => { void loadVotes() },
      )
      .subscribe()

    // Fallback refresh keeps rankings current if Realtime isn't enabled in Supabase.
    const refreshInterval = window.setInterval(() => { void loadVotes() }, 15000)

    return () => {
      window.clearInterval(refreshInterval)
      void supabase.removeChannel(channel)
    }
  }, [])

  const total = rankedColors.reduce((sum, color) => sum + color.votes, 0)
  const maxVotes = Math.max(1, ...votes.map((color) => color.votes))
  const ranked = [...votes].sort((a, b) => b.votes - a.votes)
  const topFive = rankedColors.slice(0, 5)

  const filtered = votes.filter((color) => {
    const matchesSearch = color.name
      .toLowerCase()
      .includes(query.toLowerCase())

    const matchesCategory =
      category === 'All colors' ||
      (category === 'Warm tones' && color.group === 'Warm') ||
      (category === 'Cool tones' && color.group === 'Cool') ||
      (category === 'Nature' && color.group === 'Nature')

    return matchesSearch && matchesCategory
  })

  const chartData = topFive

  function hsvToHex(h: number, s: number, v: number) {
    const sv = s / 100
    const bv = v / 100
    const chroma = bv * sv
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = bv - chroma
    let rgb: [number, number, number]

    if (h < 60) rgb = [chroma, x, 0]
    else if (h < 120) rgb = [x, chroma, 0]
    else if (h < 180) rgb = [0, chroma, x]
    else if (h < 240) rgb = [0, x, chroma]
    else if (h < 300) rgb = [x, 0, chroma]
    else rgb = [chroma, 0, x]

    return '#' + rgb.map((part) =>
      Math.round((part + m) * 255).toString(16).padStart(2, '0'),
    ).join('').toUpperCase()
  }

  function applyHsv(nextHue: number, nextSaturation: number, nextBrightness: number) {
    const hex = hsvToHex(nextHue, nextSaturation, nextBrightness)
    setSelectedHex(hex)
    setHexInput(hex)
    setSelected(hex)
  }

  function updateHex(value: string) {
    setHexInput(value)
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      const normalized = value.toUpperCase()
      setSelectedHex(normalized)
      setSelected(normalized)
    }
  }

  async function castVote() {
    if (!selected || voted || submittingVote || loadingVotes) return

    setSubmittingVote(true)
    setVoteError('')

    try {
      const { error } = await supabase
        .from('color_votes')
        .insert({
          color_name: colors.find((color) => color.name === selected)?.name ?? 'Custom',
          color_hex: selectedHex,
          category: 'favorite',
        })

      if (error) {
        console.error('Failed to submit vote:', error.message)
        setVoteError('Your vote could not be saved. Please try again.')
        return
      }

      setVoted(true)
      await loadVotes()
    } catch (error) {
      console.error('Unexpected voting error:', error)
      setVoteError('Something went wrong. Please try again.')
    } finally {
      setSubmittingVote(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Palette size={21} />
          </span>
          chromatic<span className="brand-dot">.</span>
        </a>

        <nav>
          <a className="nav-active" href="#explore">Explore</a>
          <a href="#rankings">Rankings</a>
          <a href="#vote">Cast your vote</a>
        </nav>

        <div className="live-pill">
          <span />
          Community colors
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={14} />
              THE COLOR POPULARITY INDEX
            </div>

            <h1>
              Color is personal.
              <br />
              <span>Popularity is measurable.</span>
            </h1>

            <p>
              Discover the shades people love, explore the rankings,
              and make your favorite count.
            </p>

            <a className="primary-button" href="#vote">
              Find your color <ArrowUpRight size={17} />
            </a>
          </div>

          <div className="hero-art" aria-label="Color palette illustration">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="color-orb orb-blue" />
            <div className="color-orb orb-pink" />
            <div className="color-orb orb-yellow" />
            <div className="color-orb orb-green" />
            <div className="art-caption">
              A world of color <span>✳</span>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">COLORS TRACKED</span>
            <strong>{String(colors.length).padStart(2, '0')}</strong>
            <span className="stat-note">Across the palette</span>
          </article>

          <article className="stat-card">
            <span className="stat-label">TOTAL COMMUNITY VOTES</span>
            <strong>{total.toLocaleString()}</strong>
            <span className="stat-note">
              <TrendingUp size={14} />
              Recorded database votes
            </span>
          </article>

          <article className="stat-card featured-stat">
            <span className="stat-label">CURRENT FAVORITE</span>
            <div className="favorite-line">
              <span style={{ background: topFive[0]?.hex ?? '#ddd' }} />
              <strong>{total > 0 ? topFive[0]?.name : 'No votes yet'}</strong>
            </div>
            <span className="stat-note">
              {total > 0
                ? `${((ranked[0].votes / total) * 100).toFixed(1)}% of recorded votes`
                : 'Be the first to vote'}
            </span>
          </article>
        </section>

        <section className="content-section" id="explore">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR NEXT FAVORITE</span>
              <h2>
                Explore the palette<span>.</span>
              </h2>
              <p>Every shade has a story. Which one feels like you?</p>
            </div>

            <label className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a color..."
              />
            </label>
          </div>

          <div className="filter-row">
            {['All colors', 'Warm tones', 'Cool tones', 'Nature'].map((item) => (
              <button
                key={item}
                className={category === item ? 'filter active-filter' : 'filter'}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="custom-color-picker">
            <div className="picker-heading">
              <div>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h3>Find your exact shade<span>.</span></h3>
                <p>Open the color studio to explore hue, saturation and brightness.</p>
              </div>
              <div className="custom-color-preview" style={{ background: selectedHex }}>
                <span>{selectedHex}</span>
              </div>
            </div>

            <button
              type="button"
              className="open-color-studio"
              onClick={() => setColorStudioOpen((open) => !open)}
              aria-expanded={colorStudioOpen}
            >
              <span className="studio-button-swatch" style={{ background: selectedHex }} />
              {colorStudioOpen ? 'Close color studio' : 'Choose a custom color'}
              <span className="studio-button-arrow">{colorStudioOpen ? '−' : '+'}</span>
            </button>

            {colorStudioOpen && (
              <div className="color-studio">
                <div className="studio-color-preview" style={{ background: selectedHex }}>
                  <span>Live preview</span>
                  <strong>{selectedHex}</strong>
                </div>

                <label className="studio-control">
                  <span>Hue</span>
                  <input type="range" min="0" max="360" value={hue}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setHue(value)
                      applyHsv(value, saturation, brightness)
                    }} aria-label="Adjust hue" className="hue-slider" />
                </label>

                <label className="studio-control">
                  <span>Saturation</span>
                  <input type="range" min="0" max="100" value={saturation}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setSaturation(value)
                      applyHsv(hue, value, brightness)
                    }} aria-label="Adjust saturation" />
                </label>

                <label className="studio-control">
                  <span>Brightness</span>
                  <input type="range" min="0" max="100" value={brightness}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setBrightness(value)
                      applyHsv(hue, saturation, value)
                    }} aria-label="Adjust brightness" />
                </label>

                <div className="studio-actions">
                  <label className="hex-input-control">
                    <span className="color-input-label">HEX (optional)</span>
                    <input value={hexInput} maxLength={7} placeholder="#5278E8"
                      onChange={(event) => updateHex(event.target.value)}
                      aria-label="Enter HEX value" />
                  </label>
                  <button type="button" className="apply-color-button"
                    onClick={() => {
                      if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) updateHex(hexInput)
                      setColorStudioOpen(false)
                    }}>
                    Use this color
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="color-grid">
            {filtered.map((color) => (
              <button
                key={color.name}
                className={`color-card ${selected === color.name ? 'selected-card' : ''}`}
                onClick={() => { setSelected(color.name); setSelectedHex(color.hex); setHexInput(color.hex) }}
                aria-pressed={selected === color.name}
              >
                <div className="swatch" style={{ background: color.hex }}>
                  {color.name === ranked[0]?.name && total > 0 && (
                    <span className="swatch-tag">POPULAR</span>
                  )}

                  {selected === color.name && (
                    <span className="selected-check">✓</span>
                  )}

                  <span className="swatch-code">{color.hex}</span>
                </div>

                <div className="color-meta">
                  <div>
                    <strong>{color.name}</strong>
                    <span>{color.group}</span>
                  </div>
                  <Heart
                    size={17}
                    fill={selected === color.name ? color.hex : 'none'}
                    color={selected === color.name ? color.hex : '#999'}
                  />
                </div>

                <div className="vote-progress">
                  <span
                    style={{
                      width: `${(color.votes / maxVotes) * 100}%`,
                      background: color.hex,
                    }}
                  />
                </div>

                <div className="vote-count">
                  {color.votes.toLocaleString()} votes
                  <span>
                    {total > 0
                      ? `${((color.votes / total) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 && <p>No colors match your search.</p>}
        </section>

        <section className="dashboard-section" id="rankings">
          <div className="chart-panel">
            <span className="eyebrow">THE LEADERBOARD</span>
            <h2>
              Community rankings<span>.</span>
            </h2>
            <p className="panel-description">
              Colors ranked by votes recorded on Chromatic.
            </p>

            <div className="chart-wrap">
              {loadingVotes ? (
                <p className="ranking-empty">Loading live rankings…</p>
              ) : chartData.length === 0 ? (
                <p className="ranking-empty">No votes yet. Be the first to make a color popular.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 12, right: 8, left: -22, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#777', fontSize: 12 }}
                    />
                    <Tooltip cursor={{ fill: '#f0eee9' }} />
                    <Bar dataKey="votes" radius={[7, 7, 0, 0]} isAnimationActive>
                      {chartData.map((color) => (
                        <Cell key={color.hex} fill={color.hex} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="ranking-panel">
            <span className="eyebrow">THE TOP FIVE</span>
            <h2>
              Most-loved colors<span>.</span>
            </h2>

            <div className="ranking-list">
              {loadingVotes ? (
                <p className="ranking-empty">Loading live rankings…</p>
              ) : topFive.length === 0 ? (
                <p className="ranking-empty">No votes yet. Your vote can start the rankings.</p>
              ) : topFive.map((color, index) => (
                <div className="ranking-item" key={color.hex}>
                  <span className="rank-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="rank-swatch"
                    style={{ background: color.hex }}
                  />
                  <div className="rank-info">
                    <strong>{color.name}</strong>
                    <span>{color.votes.toLocaleString()} votes</span>
                  </div>
                  <strong className="rank-percent">
                    {total > 0
                      ? `${((color.votes / total) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="vote-banner" id="vote">
          <div className="vote-banner-copy">
            <span className="eyebrow">
              <Sparkles size={14} />
              YOUR VOICE, YOUR COLOR
            </span>
            <h2>
              Make your favorite
              <br />
              part of the picture.
            </h2>
            <p>
              Pick a shade above, then cast your vote.
              Every vote changes the leaderboard.
            </p>
          </div>

          <div className="vote-action">
            <div className="vote-selection">
              <span
                className="selection-dot"
                style={{
                  background:
                    votes.find((color) => color.name === selected)?.hex || '#ddd',
                }}
              />
              <div>
                <span>Your selection</span>
                <strong>{selected ? selectedHex : 'Choose a color above'}</strong>
              </div>
            </div>

            <button
              className="vote-button"
              disabled={
                !selected || voted || loadingVotes || submittingVote
              }
              onClick={castVote}
            >
              {submittingVote
                ? 'Submitting...'
                : voted
                  ? 'Vote recorded ✓'
                  : 'Cast my vote'}
              <ArrowUpRight size={17} />
            </button>

            {loadingVotes && (
              <p className="privacy-note">Loading community votes...</p>
            )}

            {voteError && (
              <p className="error-message" role="alert">
                {voteError}
              </p>
            )}

            {voted && (
              <p className="success-message">
                <CheckCircle2 size={14} />
                Your vote has been saved.
              </p>
            )}

            <p className="privacy-note">
              Community results · Votes stored in Supabase
            </p>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#">
          <span className="brand-icon">
            <Palette size={18} />
          </span>
          chromatic<span className="brand-dot">.</span>
        </a>
        <span>Color, counted. Made for the curious.</span>
        <a href="#explore">Back to palette ↑</a>
      </footer>
    </div>
  )
}
