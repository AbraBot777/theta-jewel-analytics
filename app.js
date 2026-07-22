const app = document.getElementById("app");

const fmtNumber = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-ZA", { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

const fmtPct = (value, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(digits)}%`;
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[ch]));

function sparkline(points, color = "var(--accent)") {
  const clean = points.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return `<div class="empty-chart">Not enough data</div>`;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const d = clean.map((point, index) => {
    const x = (index / (clean.length - 1)) * 100;
    const y = 88 - ((point - min) / span) * 76;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  const zero = max <= 0 || min >= 0 ? "" : `<line x1="0" x2="100" y1="${88 - ((0 - min) / span) * 76}" y2="${88 - ((0 - min) / span) * 76}" class="zero-line" />`;
  return `<svg class="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">${zero}<path d="${d}" style="stroke:${color}"></path></svg>`;
}

function bars(rows, getLabel, getValue) {
  const values = rows.map(getValue);
  const max = Math.max(...values.map(Math.abs), 1);
  return `<div class="bar-list">${rows.map((row) => {
    const value = getValue(row);
    return `<div class="bar-row">
      <span>${esc(getLabel(row))}</span>
      <div class="bar-track"><div class="bar-fill ${value < 0 ? "is-loss" : ""}" style="width:${Math.max(4, Math.abs(value) / max * 100)}%"></div></div>
      <strong>${fmtNumber(value, value % 1 === 0 ? 0 : 2)}</strong>
    </div>`;
  }).join("")}</div>`;
}

function priceChart(candles, trade) {
  const values = candles.flatMap((c) => [c.high, c.low]).filter(Number.isFinite);
  [trade.entry, trade.stop, trade.target].forEach((v) => Number.isFinite(Number(v)) && values.push(Number(v)));
  if (candles.length < 2 || !values.length) return `<div class="empty-chart">Waiting for OKX candles</div>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xFor = (index) => 4 + (index / Math.max(candles.length - 1, 1)) * 92;
  const yFor = (value) => 88 - ((value - min) / span) * 76;
  const path = candles.map((candle, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(candle.close).toFixed(2)}`).join(" ");
  const overlays = [
    ["Entry", trade.entry, "entry-line"],
    ["Stop", trade.stop, "stop-line"],
    ["Target", trade.target, "target-line"]
  ].filter((line) => Number.isFinite(Number(line[1]))).map(([label, value, className]) => {
    const y = yFor(Number(value));
    return `<line x1="4" x2="96" y1="${y}" y2="${y}" class="${className}"></line><text x="5" y="${Math.max(8, y - 2)}" class="overlay-label">${label}</text>`;
  }).join("");
  return `<svg class="price-chart" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" class="price-path"></path>${overlays}</svg>`;
}

async function loadOkx(instId, bar = "5m") {
  const [candlesRes, tickerRes] = await Promise.all([
    fetch(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=140`),
    fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`)
  ]);
  const [candlesJson, tickerJson] = await Promise.all([candlesRes.json(), tickerRes.json()]);
  if (candlesJson.code !== "0" || tickerJson.code !== "0") throw new Error("OKX public feed returned an error");
  return {
    ticker: tickerJson.data[0],
    candles: candlesJson.data.map((row) => ({
      ts: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      confirmed: row[8] === "1"
    })).reverse()
  };
}

function renderOkxShell(data) {
  const instruments = data.okxLive.instruments;
  return `<section class="panel okx-panel" id="okx-live">
    <div class="section-head">
      <div><p class="eyebrow">OKX live feed</p><h2>Live Price Action</h2></div>
      <div class="toolbar">
        <select id="okx-inst" aria-label="OKX instrument">${instruments.map((item) => `<option value="${esc(item.instId)}">${esc(item.instId)}</option>`).join("")}</select>
        <select id="okx-bar" aria-label="Candle interval">${["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"].map((bar) => `<option value="${bar}" ${bar === data.okxLive.defaultBar ? "selected" : ""}>${bar}</option>`).join("")}</select>
      </div>
    </div>
    <div class="okx-grid">
      <div class="live-chart" id="okx-chart"><div class="empty-chart">Loading OKX candles</div></div>
      <div class="trade-ticket" id="okx-ticket"></div>
    </div>
  </section>`;
}

function initOkx(data) {
  const inst = document.getElementById("okx-inst");
  const bar = document.getElementById("okx-bar");
  const chart = document.getElementById("okx-chart");
  const ticket = document.getElementById("okx-ticket");

  async function refresh() {
    const trade = data.okxLive.instruments.find((item) => item.instId === inst.value) || data.okxLive.instruments[0];
    chart.innerHTML = `<div class="empty-chart">Loading ${esc(inst.value)}</div>`;
    try {
      const market = await loadOkx(inst.value, bar.value);
      const last = Number(market.ticker.last);
      const open24h = Number(market.ticker.open24h);
      const change = last && open24h ? (last - open24h) / open24h : 0;
      chart.innerHTML = `<div class="chart-topline"><strong>${esc(inst.value)}</strong><span class="change ${change >= 0 ? "positive" : "negative"}">${fmtPct(change)}</span></div>${priceChart(market.candles, trade)}`;
      ticket.innerHTML = `<p class="micro">Current price</p><strong class="live-price">${fmtNumber(last, inst.value.includes("DOGE") || inst.value.includes("XRP") ? 5 : 2)}</strong>
        <dl>
          <div><dt>Direction</dt><dd>${esc(trade.direction || "Watch")}</dd></div>
          <div><dt>Entry</dt><dd>${trade.entry ? fmtNumber(trade.entry, 5) : "Not set"}</dd></div>
          <div><dt>Stop</dt><dd>${trade.stop ? fmtNumber(trade.stop, 5) : "Not set"}</dd></div>
          <div><dt>Target</dt><dd>${trade.target ? fmtNumber(trade.target, 5) : "Not set"}</dd></div>
          <div><dt>Status</dt><dd>${esc(trade.status)}</dd></div>
        </dl>
        <p class="privacy-note">${esc(data.okxLive.privacyNote)}</p>`;
    } catch (error) {
      chart.innerHTML = `<div class="feed-error">${esc(error.message || "OKX feed failed")}</div>`;
    }
  }

  inst.addEventListener("change", refresh);
  bar.addEventListener("change", refresh);
  refresh();
  window.setInterval(refresh, (data.okxLive.refreshSeconds || 15) * 1000);
}

function tradeTable(data) {
  return `<section class="panel">
    <div class="section-head">
      <div><p class="eyebrow">Trading history</p><h2>Full Wins, Losses, Dates, Times, Stocks</h2></div>
      <div class="toolbar"><input id="trade-query" placeholder="Search symbol or note" /><select id="trade-filter"><option value="ALL">All</option><option value="WIN">Wins</option><option value="LOSS">Losses</option><option value="OPEN">Open</option></select></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Status</th><th>Symbol</th><th>Direction</th><th>Opened</th><th>Closed</th><th>Entry</th><th>Stop</th><th>Target</th><th>R</th><th>Notes</th></tr></thead><tbody id="trade-body"></tbody></table></div>
  </section>`;
}

function initTradeTable(data) {
  const body = document.getElementById("trade-body");
  const query = document.getElementById("trade-query");
  const filter = document.getElementById("trade-filter");
  function render() {
    const q = query.value.trim().toLowerCase();
    const status = filter.value;
    body.innerHTML = data.tradeHistory.filter((trade) => {
      const resultOk = status === "ALL" || trade.result === status;
      const queryOk = !q || [trade.symbol, trade.direction, trade.timeframe, trade.resultLabel, trade.notes].join(" ").toLowerCase().includes(q);
      return resultOk && queryOk;
    }).map((trade) => `<tr>
      <td><span class="pill ${trade.result === "WIN" ? "win" : trade.result === "LOSS" ? "loss" : ""}">${esc(trade.resultLabel)}</span></td>
      <td><strong>${esc(trade.symbol)}</strong></td><td>${esc(trade.direction)}</td><td>${esc(trade.openedAtDisplay)}</td><td>${esc(trade.closedAtDisplay || "-")}</td>
      <td>${trade.entry ? fmtNumber(trade.entry, 4) : "-"}</td><td>${trade.stop ? fmtNumber(trade.stop, 4) : "-"}</td><td>${trade.target ? fmtNumber(trade.target, 4) : "-"}</td>
      <td>${fmtNumber(trade.rMultiple, 2)}</td><td class="notes-cell">${esc(trade.notes)}</td>
    </tr>`).join("");
  }
  query.addEventListener("input", render);
  filter.addEventListener("change", render);
  render();
}

function renderDashboard(data) {
  const monitored = data.kpis.monitored;
  const backtest = data.kpis.backtest;
  app.innerHTML = `
    <section class="hero">
      <div><p class="eyebrow">Trading System Theta</p><h1>Jewel Analytics Command</h1><p class="hero-copy">Paper, demo, and historical learning dashboard for the locked Theta universe and OKX live price-action watch.</p></div>
      <div class="hero-status"><span>Updated ${esc(data.generatedAtDisplay)}</span><span>${esc(data.updateCadence)}</span></div>
    </section>
    <section class="kpi-grid">
      <div class="kpi"><span>Monitored W/L</span><strong>${monitored.wins}W / ${monitored.losses}L</strong><small>${fmtPct(monitored.winRate)} win rate</small></div>
      <div class="kpi"><span>Monitored R</span><strong>${fmtNumber(monitored.totalR)}R</strong><small>${fmtNumber(monitored.avgR, 3)}R average</small></div>
      <div class="kpi"><span>Jewel Backtest</span><strong>${fmtPct(backtest.winRate)}</strong><small>${backtest.trades} trades, ${fmtNumber(backtest.totalR)}R</small></div>
      <div class="kpi"><span>1.5R Reach</span><strong>${fmtPct(backtest.hit15R)}</strong><small>runner research after first profit</small></div>
    </section>
    <section class="dashboard-grid">
      <div class="panel wide"><div class="section-head"><div><p class="eyebrow">Profitability</p><h2>Cumulative R Curve</h2></div></div>${sparkline(data.charts.profitCurve.map((p) => p.cumulativeR), "var(--green)")}</div>
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Learning</p><h2>System Improvement</h2></div></div>${sparkline(data.charts.learningTrend.map((p) => p.learningScore), "var(--accent)")}</div>
    </section>
    ${renderOkxShell(data)}
    <section class="dashboard-grid">
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Symbols</p><h2>Backtest Strength</h2></div></div>${bars(data.symbolStats, (r) => r.symbol, (r) => r.backtestAvgR)}</div>
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Outcomes</p><h2>Daily Wins</h2></div></div>${bars(data.charts.dailyOutcomes.slice(-10), (r) => r.date, (r) => r.wins - r.losses)}</div>
    </section>
    ${tradeTable(data)}
    <section class="dashboard-grid">
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Learning notes</p><h2>Optimization Log</h2></div></div><ul class="note-list">${[...data.learningNotes.cycleRules, ...data.learningNotes.recent].slice(0, 10).map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Help needed</p><h2>Missing Learning Gaps</h2></div></div><ul class="note-list">${data.dataQuality.howToHelp.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
    </section>`;
  initOkx(data);
  initTradeTable(data);
}

fetch("/data/dashboard.json", { cache: "no-store" })
  .then((response) => response.json())
  .then(renderDashboard)
  .catch((error) => {
    app.innerHTML = `<section class="panel"><h1>Dashboard data failed to load</h1><p>${esc(error.message)}</p></section>`;
  });
