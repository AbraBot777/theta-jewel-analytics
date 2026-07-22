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

function tradingViewUrl(symbol, interval) {
  const params = new URLSearchParams({
    symbol,
    interval,
    theme: "dark",
    style: "1",
    timezone: "Africa/Johannesburg",
    withdateranges: "1",
    hide_side_toolbar: "0",
    allow_symbol_change: "0",
    save_image: "0",
    calendar: "0",
    studies: "[]",
    support_host: "https://www.tradingview.com"
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}

function renderStockLiveShell(data) {
  const instruments = data.stockLive.instruments;
  return `<section class="panel okx-panel" id="stock-live">
    <div class="section-head">
      <div><p class="eyebrow">TradingView live feed</p><h2>Live Stock Price Action</h2></div>
      <div class="toolbar">
        <select id="stock-symbol" aria-label="Stock symbol">${instruments.map((item) => `<option value="${esc(item.symbol)}">${esc(item.symbol)}</option>`).join("")}</select>
        <select id="stock-interval" aria-label="Candle interval">${[
          ["1", "1m"],
          ["5", "5m"],
          ["15", "15m"],
          ["30", "30m"],
          ["60", "1H"],
          ["240", "4H"],
          ["D", "1D"]
        ].map(([value, label]) => `<option value="${value}" ${value === data.stockLive.defaultInterval ? "selected" : ""}>${label}</option>`).join("")}</select>
      </div>
    </div>
    <div class="okx-grid">
      <div class="live-chart" id="stock-chart"></div>
      <div class="trade-ticket" id="stock-ticket"></div>
    </div>
  </section>`;
}

function initStockLive(data) {
  const symbolSelect = document.getElementById("stock-symbol");
  const intervalSelect = document.getElementById("stock-interval");
  const chart = document.getElementById("stock-chart");
  const ticket = document.getElementById("stock-ticket");

  function render() {
    const stock = data.stockLive.instruments.find((item) => item.symbol === symbolSelect.value) || data.stockLive.instruments[0];
    const edgeClass = Number(stock.thetaEdge) >= 0 ? "positive" : "negative";
    chart.innerHTML = `<iframe class="tv-frame" title="${esc(stock.symbol)} live TradingView chart" src="${esc(tradingViewUrl(stock.tvSymbol, intervalSelect.value))}" loading="eager" referrerpolicy="origin"></iframe>`;
    ticket.innerHTML = `<p class="micro">Theta live edge</p><strong class="live-price ${edgeClass}">${fmtNumber(stock.thetaEdge, 2)}R</strong>
      <dl>
        <div><dt>Symbol</dt><dd>${esc(stock.symbol)}</dd></div>
        <div><dt>TradingView</dt><dd>${esc(stock.tvSymbol)}</dd></div>
        <div><dt>Interval</dt><dd>${esc(intervalSelect.options[intervalSelect.selectedIndex].text)}</dd></div>
        <div><dt>Universe</dt><dd>Theta stocks only</dd></div>
      </dl>
      <p class="privacy-note">${esc(data.stockLive.privacyNote)}</p>`;
  }

  symbolSelect.addEventListener("change", render);
  intervalSelect.addEventListener("change", render);
  render();
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
      <div><p class="eyebrow">Trading System Theta</p><h1>Jewel Analytics Command</h1><p class="hero-copy">Paper, demo, and historical learning dashboard for the locked Theta stock universe and TradingView live price-action watch.</p></div>
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
    ${renderStockLiveShell(data)}
    <section class="dashboard-grid">
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Symbols</p><h2>Backtest Strength</h2></div></div>${bars(data.symbolStats, (r) => r.symbol, (r) => r.backtestAvgR)}</div>
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Outcomes</p><h2>Daily Wins</h2></div></div>${bars(data.charts.dailyOutcomes.slice(-10), (r) => r.date, (r) => r.wins - r.losses)}</div>
    </section>
    ${tradeTable(data)}
    <section class="dashboard-grid">
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Learning notes</p><h2>Optimization Log</h2></div></div><ul class="note-list">${[...data.learningNotes.cycleRules, ...data.learningNotes.recent].slice(0, 10).map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
      <div class="panel"><div class="section-head"><div><p class="eyebrow">Help needed</p><h2>Missing Learning Gaps</h2></div></div><ul class="note-list">${data.dataQuality.howToHelp.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
    </section>`;
  initStockLive(data);
  initTradeTable(data);
}

fetch("data/dashboard.json", { cache: "no-store" })
  .then((response) => response.json())
  .then(renderDashboard)
  .catch((error) => {
    app.innerHTML = `<section class="panel"><h1>Dashboard data failed to load</h1><p>${esc(error.message)}</p></section>`;
  });
