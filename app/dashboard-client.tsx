"use client";

import { useEffect, useMemo, useState } from "react";

type AnyObject = Record<string, any>;

function fmtNumber(value: number, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("en-ZA", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function fmtPct(value: number, digits = 1) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Sparkline({ points, color = "var(--accent)" }: { points: number[]; color?: string }) {
  const clean = points.filter((point) => Number.isFinite(point));
  if (clean.length < 2) return <div className="empty-chart">Not enough data</div>;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const d = clean
    .map((point, index) => {
      const x = (index / (clean.length - 1)) * 100;
      const y = 88 - ((point - min) / span) * 76;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const zeroY = max <= 0 || min >= 0 ? null : 88 - ((0 - min) / span) * 76;

  return (
    <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {zeroY !== null ? <line x1="0" x2="100" y1={zeroY} y2={zeroY} className="zero-line" /> : null}
      <path d={d} style={{ stroke: color }} />
    </svg>
  );
}

function Bars({ rows, getValue, getLabel, tone }: { rows: AnyObject[]; getValue: (row: AnyObject) => number; getLabel: (row: AnyObject) => string; tone?: "win" | "loss" }) {
  const max = Math.max(...rows.map((row) => Math.abs(getValue(row))), 1);
  return (
    <div className="bar-list">
      {rows.map((row) => {
        const value = getValue(row);
        return (
          <div className="bar-row" key={getLabel(row)}>
            <span>{getLabel(row)}</span>
            <div className="bar-track">
              <div
                className={cls("bar-fill", tone === "win" && "is-win", tone === "loss" && "is-loss", value < 0 && "is-loss")}
                style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
              />
            </div>
            <strong>{fmtNumber(value, value % 1 === 0 ? 0 : 2)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function OkxLivePanel({ data }: { data: AnyObject }) {
  const instruments = data.okxLive?.instruments || [];
  const [selected, setSelected] = useState(instruments[0]?.instId || "BTC-USDT");
  const [bar, setBar] = useState(data.okxLive?.defaultBar || "5m");
  const [market, setMarket] = useState<AnyObject | null>(null);
  const [error, setError] = useState("");
  const trade = instruments.find((item: AnyObject) => item.instId === selected) || instruments[0] || {};

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/okx?instId=${encodeURIComponent(selected)}&bar=${encodeURIComponent(bar)}&limit=140`, {
          cache: "no-store"
        });
        const json = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(json.error || "OKX feed failed");
        setMarket(json);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "OKX feed failed");
      }
    }
    load();
    const timer = window.setInterval(load, (data.okxLive?.refreshSeconds || 15) * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selected, bar, data.okxLive?.refreshSeconds]);

  const candles = market?.candles || [];
  const closes = candles.map((candle: AnyObject) => candle.close);
  const last = market?.ticker?.last;
  const open24h = market?.ticker?.open24h;
  const change24h = last && open24h ? (last - open24h) / open24h : 0;

  return (
    <section className="panel okx-panel" id="okx-live">
      <div className="section-head">
        <div>
          <p className="eyebrow">OKX live feed</p>
          <h2>Live Price Action</h2>
        </div>
        <div className="toolbar">
          <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="OKX instrument">
            {instruments.map((item: AnyObject) => (
              <option value={item.instId} key={item.instId}>
                {item.instId}
              </option>
            ))}
          </select>
          <select value={bar} onChange={(event) => setBar(event.target.value)} aria-label="Candle interval">
            {["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"].map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="okx-grid">
        <div className="live-chart">
          <div className="chart-topline">
            <strong>{selected}</strong>
            <span className={cls("change", change24h >= 0 ? "positive" : "negative")}>{fmtPct(change24h)}</span>
          </div>
          {error ? <div className="feed-error">{error}</div> : <PriceChart candles={candles} trade={trade} />}
        </div>
        <div className="trade-ticket">
          <p className="micro">Current price</p>
          <strong className="live-price">{fmtNumber(last, selected.includes("DOGE") || selected.includes("XRP") ? 5 : 2)}</strong>
          <dl>
            <div><dt>Direction</dt><dd>{trade.direction || "Watch"}</dd></div>
            <div><dt>Entry</dt><dd>{trade.entry ? fmtNumber(trade.entry, 5) : "Not set"}</dd></div>
            <div><dt>Stop</dt><dd>{trade.stop ? fmtNumber(trade.stop, 5) : "Not set"}</dd></div>
            <div><dt>Target</dt><dd>{trade.target ? fmtNumber(trade.target, 5) : "Not set"}</dd></div>
            <div><dt>Status</dt><dd>{trade.status}</dd></div>
          </dl>
          <p className="privacy-note">{data.okxLive?.privacyNote}</p>
        </div>
      </div>
    </section>
  );
}

function PriceChart({ candles, trade }: { candles: AnyObject[]; trade: AnyObject }) {
  const values = candles.flatMap((candle) => [candle.high, candle.low]).filter(Number.isFinite);
  [trade.entry, trade.stop, trade.target].forEach((value) => {
    if (Number.isFinite(Number(value))) values.push(Number(value));
  });

  if (candles.length < 2 || !values.length) return <div className="empty-chart">Waiting for OKX candles</div>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xFor = (index: number) => 4 + (index / Math.max(candles.length - 1, 1)) * 92;
  const yFor = (value: number) => 88 - ((value - min) / span) * 76;
  const path = candles.map((candle, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(candle.close).toFixed(2)}`).join(" ");

  const overlays = [
    { label: "Entry", value: trade.entry, className: "entry-line" },
    { label: "Stop", value: trade.stop, className: "stop-line" },
    { label: "Target", value: trade.target, className: "target-line" }
  ].filter((line) => Number.isFinite(Number(line.value)));

  return (
    <svg className="price-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="OKX price action chart">
      <path d={path} className="price-path" />
      {overlays.map((line) => {
        const y = yFor(Number(line.value));
        return (
          <g key={line.label}>
            <line x1="4" x2="96" y1={y} y2={y} className={line.className} />
            <text x="5" y={Math.max(8, y - 2)} className="overlay-label">{line.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DashboardClient({ data }: { data: AnyObject }) {
  const monitored = data.kpis.monitored;
  const backtest = data.kpis.backtest;
  const profitPoints = data.charts.profitCurve.map((point: AnyObject) => point.cumulativeR);
  const learningPoints = data.charts.learningTrend.map((point: AnyObject) => point.learningScore);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");

  const filteredTrades = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.tradeHistory.filter((trade: AnyObject) => {
      const resultOk = filter === "ALL" || trade.result === filter;
      const queryOk = !q || [trade.symbol, trade.direction, trade.timeframe, trade.resultLabel, trade.notes].join(" ").toLowerCase().includes(q);
      return resultOk && queryOk;
    });
  }, [data.tradeHistory, query, filter]);

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Trading System Theta</p>
          <h1>Jewel Analytics Command</h1>
          <p className="hero-copy">Paper, demo, and historical learning dashboard for the locked Theta universe and OKX live price-action watch.</p>
        </div>
        <div className="hero-status">
          <span>Updated {data.generatedAtDisplay}</span>
          <span>{data.updateCadence}</span>
        </div>
      </section>

      <section className="kpi-grid">
        <div className="kpi"><span>Monitored W/L</span><strong>{monitored.wins}W / {monitored.losses}L</strong><small>{fmtPct(monitored.winRate)} win rate</small></div>
        <div className="kpi"><span>Monitored R</span><strong>{fmtNumber(monitored.totalR)}R</strong><small>{fmtNumber(monitored.avgR, 3)}R average</small></div>
        <div className="kpi"><span>Jewel Backtest</span><strong>{fmtPct(backtest.winRate)}</strong><small>{backtest.trades} trades, {fmtNumber(backtest.totalR)}R</small></div>
        <div className="kpi"><span>1.5R Reach</span><strong>{fmtPct(backtest.hit15R)}</strong><small>runner research after first profit</small></div>
      </section>

      <section className="dashboard-grid">
        <div className="panel wide">
          <div className="section-head"><div><p className="eyebrow">Profitability</p><h2>Cumulative R Curve</h2></div></div>
          <Sparkline points={profitPoints} color="var(--green)" />
        </div>
        <div className="panel">
          <div className="section-head"><div><p className="eyebrow">Learning</p><h2>System Improvement</h2></div></div>
          <Sparkline points={learningPoints} color="var(--accent)" />
        </div>
      </section>

      <OkxLivePanel data={data} />

      <section className="dashboard-grid">
        <div className="panel">
          <div className="section-head"><div><p className="eyebrow">Symbols</p><h2>Backtest Strength</h2></div></div>
          <Bars rows={data.symbolStats} getLabel={(row) => row.symbol} getValue={(row) => row.backtestAvgR} />
        </div>
        <div className="panel">
          <div className="section-head"><div><p className="eyebrow">Outcomes</p><h2>Daily Wins</h2></div></div>
          <Bars rows={data.charts.dailyOutcomes.slice(-10)} getLabel={(row) => row.date} getValue={(row) => row.wins - row.losses} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div><p className="eyebrow">Trading history</p><h2>Full Wins, Losses, Dates, Times, Stocks</h2></div>
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or note" />
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="WIN">Wins</option>
              <option value="LOSS">Losses</option>
              <option value="OPEN">Open</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Symbol</th>
                <th>Direction</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>R</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade: AnyObject) => (
                <tr key={trade.id}>
                  <td><span className={cls("pill", trade.result === "WIN" && "win", trade.result === "LOSS" && "loss")}>{trade.resultLabel}</span></td>
                  <td><strong>{trade.symbol}</strong></td>
                  <td>{trade.direction}</td>
                  <td>{trade.openedAtDisplay}</td>
                  <td>{trade.closedAtDisplay || "-"}</td>
                  <td>{trade.entry ? fmtNumber(trade.entry, 4) : "-"}</td>
                  <td>{trade.stop ? fmtNumber(trade.stop, 4) : "-"}</td>
                  <td>{trade.target ? fmtNumber(trade.target, 4) : "-"}</td>
                  <td>{fmtNumber(trade.rMultiple, 2)}</td>
                  <td className="notes-cell">{trade.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="section-head"><div><p className="eyebrow">Learning notes</p><h2>Optimization Log</h2></div></div>
          <ul className="note-list">
            {[...data.learningNotes.cycleRules, ...data.learningNotes.recent].slice(0, 10).map((note: string) => <li key={note}>{note}</li>)}
          </ul>
        </div>
        <div className="panel">
          <div className="section-head"><div><p className="eyebrow">Help needed</p><h2>Missing Learning Gaps</h2></div></div>
          <ul className="note-list">
            {data.dataQuality.howToHelp.map((note: string) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </section>
    </main>
  );
}
