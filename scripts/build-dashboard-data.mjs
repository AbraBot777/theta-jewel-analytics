import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workspaceRoot = path.resolve(appRoot, "..");
const thetaRoot = path.join(workspaceRoot, "trading-system-theta-gann");
const publicDataDir = path.join(appRoot, "public", "data");
const outFile = path.join(publicDataDir, "dashboard.json");

const lockedUniverse = ["TSLA", "QQQ", "SPY", "DIA", "NVDA", "AMD", "GOOGL"];

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(String(value).replace(/[%,$]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function percent(value) {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value : value * 100;
}

function isoFromUnix(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function displayTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function displayDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "short",
      day: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function splitMonitorKey(key) {
  const parts = key.split(":");
  return {
    source: parts[0] || "",
    rowIndex: parts[1] || "",
    openedAt: parts[2] || "",
    symbol: parts[3] || "",
    timeframe: parts[4] || "",
    direction: parts[5] || "",
    entry: toNumber(parts[6], null),
    stop: toNumber(parts[7], null),
    target: toNumber(parts[8], null)
  };
}

function tradeR(result, entry, stop, target) {
  if (result === "LOSS") return -1;
  if (result !== "WIN") return 0;
  const risk = Math.abs(Number(entry) - Number(stop));
  const reward = Math.abs(Number(target) - Number(entry));
  if (!risk || !Number.isFinite(risk) || !Number.isFinite(reward)) return 1;
  return Number((reward / risk).toFixed(2));
}

function buildClosedTrades(monitorState, ledgerRows) {
  const closed = [];
  const processed = monitorState?.processed || {};

  for (const [key, value] of Object.entries(processed)) {
    if (!["WIN", "LOSS"].includes(value?.result)) continue;
    const parsed = splitMonitorKey(key);
    if (!lockedUniverse.includes(parsed.symbol)) continue;

    const closedAt = isoFromUnix(value.details?.exit_ts) || value.checked_at || parsed.openedAt;
    const rMultiple = tradeR(value.result, parsed.entry, parsed.stop, parsed.target);
    closed.push({
      id: key,
      source: parsed.source,
      mode: "paper-monitored",
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      direction: parsed.direction,
      openedAt: parsed.openedAt,
      openedAtDisplay: displayTime(parsed.openedAt),
      closedAt,
      closedAtDisplay: displayTime(closedAt),
      result: value.result,
      resultLabel: value.result === "WIN" ? "Won" : "Lost",
      rMultiple,
      entry: parsed.entry,
      stop: parsed.stop,
      target: parsed.target,
      exit: toNumber(value.details?.exit, value.result === "WIN" ? parsed.target : parsed.stop),
      notes: value.details?.reason || "Closed by THETA win monitor."
    });
  }

  const seen = new Set(closed.map((trade) => trade.id));
  for (const row of ledgerRows) {
    if (!["WIN", "LOSS"].includes(row.outcome)) continue;
    if (!lockedUniverse.includes(row.symbol)) continue;
    const id = `${row.source}:${row.timestamp}:${row.symbol}:${row.timeframe}:${row.direction}:${row.entry}:${row.stop}:${row.target}`;
    if (seen.has(id)) continue;
    closed.push({
      id,
      source: row.source,
      mode: row.mode || "paper-ledger",
      symbol: row.symbol,
      timeframe: row.timeframe,
      direction: row.direction,
      openedAt: row.timestamp,
      openedAtDisplay: displayTime(row.timestamp),
      closedAt: row.timestamp,
      closedAtDisplay: displayTime(row.timestamp),
      result: row.outcome,
      resultLabel: row.outcome === "WIN" ? "Won" : "Lost",
      rMultiple: toNumber(row.r_multiple, row.outcome === "WIN" ? 1 : -1),
      entry: toNumber(row.entry, null),
      stop: toNumber(row.stop, null),
      target: toNumber(row.target, null),
      exit: null,
      notes: row.notes || "Closed ledger row."
    });
    seen.add(id);
  }

  return closed.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
}

function buildOpenTrades(ledgerRows) {
  const rows = ledgerRows
    .filter((row) => lockedUniverse.includes(row.symbol))
    .filter((row) => row.outcome === "OPEN" || /^STAGE/.test(row.status || ""))
    .filter((row) => row.entry && row.stop && row.target)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const seen = new Set();
  const open = [];
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}:${row.direction}:${row.entry}:${row.stop}:${row.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    open.push({
      id: key,
      source: row.source,
      mode: row.mode,
      symbol: row.symbol,
      timeframe: row.timeframe,
      direction: row.direction,
      openedAt: row.timestamp,
      openedAtDisplay: displayTime(row.timestamp),
      result: "OPEN",
      resultLabel: "Open / staged",
      rMultiple: 0,
      entry: toNumber(row.entry, null),
      stop: toNumber(row.stop, null),
      target: toNumber(row.target, null),
      trainingGrade: row.training_grade || "ungraded",
      setupFamily: row.setup_family || "",
      notes: row.notes || "Active paper/staged setup."
    });
    if (open.length >= 80) break;
  }
  return open;
}

function summarizeClosed(closedTrades) {
  const wins = closedTrades.filter((trade) => trade.result === "WIN").length;
  const losses = closedTrades.filter((trade) => trade.result === "LOSS").length;
  const totalR = closedTrades.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const trades = wins + losses;
  return {
    trades,
    wins,
    losses,
    winRate: trades ? wins / trades : 0,
    totalR: Number(totalR.toFixed(2)),
    avgR: trades ? Number((totalR / trades).toFixed(3)) : 0
  };
}

function symbolStats(closedTrades, profile) {
  return lockedUniverse.map((symbol) => {
    const rows = closedTrades.filter((trade) => trade.symbol === symbol);
    const wins = rows.filter((trade) => trade.result === "WIN").length;
    const losses = rows.filter((trade) => trade.result === "LOSS").length;
    const totalR = rows.reduce((sum, trade) => sum + trade.rMultiple, 0);
    const prof = profile?.symbols?.[symbol] || {};
    return {
      symbol,
      grade: prof.grade || "ungraded",
      monitoredTrades: rows.length,
      monitoredWins: wins,
      monitoredLosses: losses,
      monitoredWinRate: rows.length ? wins / rows.length : 0,
      monitoredR: Number(totalR.toFixed(2)),
      backtestTrades: prof.trades || 0,
      backtestWinRate: prof.win_rate || 0,
      backtestAvgR: prof.avg_r || 0,
      backtestTotalR: prof.total_r || 0,
      hit15R: prof.target_hit_rates?.["1.5"] || 0
    };
  });
}

function dailySeries(closedTrades) {
  const daily = new Map();
  const sorted = [...closedTrades].sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  let cumulativeR = 0;
  const profitCurve = [];

  for (const trade of sorted) {
    const day = displayDate(trade.closedAt);
    const bucket = daily.get(day) || { date: day, wins: 0, losses: 0, r: 0 };
    if (trade.result === "WIN") bucket.wins += 1;
    if (trade.result === "LOSS") bucket.losses += 1;
    bucket.r += trade.rMultiple;
    daily.set(day, bucket);
    cumulativeR += trade.rMultiple;
    profitCurve.push({
      label: displayDate(trade.closedAt),
      symbol: trade.symbol,
      result: trade.result,
      r: Number(trade.rMultiple.toFixed(2)),
      cumulativeR: Number(cumulativeR.toFixed(2))
    });
  }

  return {
    dailyOutcomes: [...daily.values()].map((row) => ({
      ...row,
      r: Number(row.r.toFixed(2))
    })),
    profitCurve
  };
}

function parseMdTable(text, marker = "| Source | Symbol | Trades") {
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const table = text.slice(start).split("\n").filter((line) => line.trim().startsWith("|"));
  const rows = [];
  for (const line of table.slice(2)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 10 || cells[0] === "---") continue;
    rows.push(cells);
  }
  return rows;
}

function parseBacktestReports() {
  const reportsDir = path.join(thetaRoot, "reports");
  const files = fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir).filter((file) => /^theta-history-backtest-\d{4}-\d{2}-\d{2}\.md$/.test(file)).sort()
    : [];

  const trend = [];
  for (const file of files) {
    const text = readText(path.join(reportsDir, file));
    const allRow = parseMdTable(text).find((row) => row[0] === "All" && row[1] === "ALL");
    if (!allRow) continue;
    const date = file.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || file;
    const winRate = toNumber(allRow[6]) / 100;
    const avgR = toNumber(allRow[8]);
    const learningScore = Math.round(percent(winRate) * 0.65 + Math.max(0, Math.min(avgR, 0.5)) * 100 * 0.35);
    trend.push({
      date,
      trades: toNumber(allRow[2]),
      wins: toNumber(allRow[3]),
      losses: toNumber(allRow[4]),
      timed: toNumber(allRow[5]),
      winRate,
      totalR: toNumber(allRow[7]),
      avgR,
      lunarTagged: toNumber(allRow[9]),
      lunarAvgR: toNumber(allRow[10]),
      learningScore
    });
  }
  return trend;
}

function extractRecentLearningNotes() {
  const notesMd = readText(path.join(thetaRoot, "data", "theta-learnings.md"));
  const cycleMd = readText(path.join(thetaRoot, "reports", "theta-cycle-pattern-analysis-2026-07-22.md"));
  const replayMd = readText(path.join(thetaRoot, "reports", "theta-learning-replay-2026-07-21.md"));

  const learningNotes = notesMd
    .split("\n")
    .filter((line) => line.trim().startsWith("- "))
    .slice(-14)
    .map((line) => line.replace(/^- /, "").trim());

  const cycleRulesStart = cycleMd.indexOf("Learning Rules:");
  const cycleRules = cycleRulesStart >= 0
    ? cycleMd.slice(cycleRulesStart).split("\n").filter((line) => line.trim().startsWith("- ")).map((line) => line.replace(/^- /, "").trim())
    : [];

  const lossStart = replayMd.indexOf("## Repeated Loss Families");
  const repeatedLossFamilies = lossStart >= 0
    ? replayMd.slice(lossStart).split("\n").filter((line) => line.includes("|") && !line.includes("---") && !line.includes("Setup Family")).slice(0, 8).map((line) => {
        const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
        return {
          setup: cells[0],
          wins: toNumber(cells[1]),
          losses: toNumber(cells[2]),
          totalR: toNumber(cells[3]),
          winRate: toNumber(cells[4]) / 100
        };
      })
    : [];

  return {
    recent: learningNotes,
    cycleRules,
    repeatedLossFamilies
  };
}

function activeWatchlistFromCycle() {
  const latestReport = readText(path.join(thetaRoot, "reports", "theta-cycle-pattern-analysis-2026-07-22.md"));
  const rows = parseMdTable(latestReport, "| Symbol | Grade | Pattern");
  return rows.map((row) => ({
    symbol: row[0],
    grade: row[1],
    pattern: row[2],
    action: row[3],
    close: toNumber(row[4]),
    trend: row[5],
    so9: row[6],
    distanceAtr: toNumber(row[7]),
    pivotCycle: toNumber(row[8]),
    barsSincePivot: toNumber(row[9]),
    compression: toNumber(row[10]),
    lunar: row[11],
    avgR: toNumber(row[12]),
    hit15R: toNumber(row[13]) / 100
  }));
}

function okxInstrumentFrom(value) {
  if (!value) return [];
  const matches = String(value).toUpperCase().match(/[A-Z0-9]+-USDT/g) || [];
  return [...new Set(matches)];
}

function parseOkxJournal() {
  const journalRows = parseCsv(readText(path.join(workspaceRoot, "okx-demo-trading-journal.csv")));
  const fallback = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "ADA-USDT", "AVAX-USDT", "LINK-USDT", "SUI-USDT", "DOGE-USDT"];
  const active = [];
  const seen = new Set();

  const rowTime = (row) => {
    const match = String(row.date_time || "").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) return 0;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 2, Number(match[5]));
  };
  const rows = [...journalRows].sort((a, b) => rowTime(b) - rowTime(a));
  for (const row of rows) {
    const statusText = `${row.actual_exit || ""} ${row.actual_R || ""} ${row.order_type_plan || ""} ${row.tp_sl_oco_plan || ""}`;
    const isActive =
      /OPEN|live|filled exposure|target remains|target sell .* remains/i.test(statusText) &&
      !/no trade|no active|open orders empty|closed loss|closed planned|closed after|no new order; .*open orders empty/i.test(statusText);
    if (!isActive) continue;

    const instIds = [
      ...okxInstrumentFrom(row.market),
      ...okxInstrumentFrom(row.asset),
      ...okxInstrumentFrom(row.order_type_plan),
      ...okxInstrumentFrom(row.tp_sl_oco_plan)
    ];

    for (const instId of instIds) {
      const coin = instId.replace("-USDT", "");
      if (new RegExp(`${coin}\\s+closed`, "i").test(statusText)) continue;
      if (seen.has(instId)) continue;
      const levelsBelongToInstrument = instIds.length === 1;
      seen.add(instId);
      active.push({
        instId,
        label: instId.replace("-USDT", ""),
        source: "OKX Demo journal",
        dateTime: row.date_time,
        dateTimeDisplay: row.date_time,
        direction: /short|sell/i.test(row.setup_type || row.order_type_plan || "") ? "Short" : "Long",
        timeframe: row.timeframe || "5m",
        entry: levelsBelongToInstrument ? toNumber(row.entry, null) : null,
        stop: levelsBelongToInstrument ? toNumber(row.stop, null) : null,
        target: levelsBelongToInstrument ? toNumber(row.target, null) : null,
        status: row.actual_exit || row.actual_R || "Open / monitored",
        notes: row.mistake_lesson || row.setup_type || "Active OKX demo/paper instrument."
      });
    }
    if (active.length >= 9) break;
  }

  if (!active.length) {
    return fallback.map((instId) => ({
      instId,
      label: instId.replace("-USDT", ""),
      source: "OKX public watch basket",
      dateTime: null,
      dateTimeDisplay: "Fallback watchlist",
      direction: "Watch",
      timeframe: "5m",
      entry: null,
      stop: null,
      target: null,
      status: "No active OKX trade detected locally; showing public watch feed.",
      notes: "Live price action only. No private account data is exposed."
    }));
  }

  return active;
}

const profile = readJson(path.join(thetaRoot, "data", "theta-jewel-training-profile.json"), {});
const monitorState = readJson(path.join(thetaRoot, "data", "theta-win-monitor-state.json"), {});
const ledgerRows = parseCsv(readText(path.join(thetaRoot, "data", "theta-learning-ledger.csv")));
const closedTrades = buildClosedTrades(monitorState, ledgerRows);
const openTrades = buildOpenTrades(ledgerRows);
const summary = summarizeClosed(closedTrades);
const series = dailySeries(closedTrades);
const learningTrend = parseBacktestReports();
const learningNotes = extractRecentLearningNotes();
const latestLearning = learningTrend.at(-1) || {};

const dashboard = {
  generatedAt: new Date().toISOString(),
  generatedAtDisplay: displayTime(new Date().toISOString()),
  timezone: "Africa/Johannesburg",
  updateCadence: "Every 8 hours from 08:00 SAST: 08:00, 16:00, 00:00.",
  sourceFiles: [
    "trading-system-theta-gann/data/theta-learning-ledger.csv",
    "trading-system-theta-gann/data/theta-win-monitor-state.json",
    "trading-system-theta-gann/data/theta-jewel-training-profile.json",
    "trading-system-theta-gann/data/theta-learnings.md",
    "trading-system-theta-gann/reports/theta-history-backtest-*.md",
    "trading-system-theta-gann/reports/theta-cycle-pattern-analysis-2026-07-22.md",
    "trading-system-theta-gann/reports/theta-learning-replay-2026-07-21.md"
  ],
  stance: {
    name: "Trading System Theta + Jewel",
    universe: lockedUniverse,
    boundary: "Paper/research only. No real-money orders without exact explicit approval.",
    rules: profile.operating_rules || []
  },
  kpis: {
    monitored: summary,
    backtest: {
      trades: profile?.totals?.trades || latestLearning.trades || 0,
      winRate: profile?.totals?.win_rate || latestLearning.winRate || 0,
      totalR: Number((profile?.totals?.total_r || latestLearning.totalR || 0).toFixed?.(2) ?? 0),
      avgR: profile?.totals?.avg_r || latestLearning.avgR || 0,
      hit15R: profile?.totals?.target_hit_rates?.["1.5"] || 0,
      hit2R: profile?.totals?.target_hit_rates?.["2"] || 0
    },
    openTrades: openTrades.length,
    ledgerRows: ledgerRows.length,
    lastMonitorRun: monitorState?.last_run || null,
    lastMonitorRunDisplay: displayTime(monitorState?.last_run)
  },
  charts: {
    dailyOutcomes: series.dailyOutcomes,
    profitCurve: series.profitCurve,
    learningTrend
  },
  symbolStats: symbolStats(closedTrades, profile),
  tradeHistory: [...closedTrades, ...openTrades]
    .sort((a, b) => new Date(b.closedAt || b.openedAt) - new Date(a.closedAt || a.openedAt))
    .slice(0, 500),
  learningNotes,
  activeWatchlist: activeWatchlistFromCycle(),
  okxLive: {
    refreshSeconds: 15,
    defaultBar: "5m",
    instruments: parseOkxJournal(),
    privacyNote: "Live OKX graph uses public market candles and tickers only. Private demo account balances, orders, API keys, and secrets are never sent to the browser."
  },
  dataQuality: {
    missingGaps: [
      "TradingView confirmation is still usually recorded as not-recorded in the learning ledger.",
      "The historical backtest notes still say the proprietary blue/white intraday schedule is missing.",
      "Screenshots or chart snapshots around entries and exits would improve post-trade labeling.",
      "Manual tags for why a setup was accepted or rejected would help separate good losses from rule mistakes."
    ],
    howToHelp: [
      "Send screenshots at entry, stop/target hit, and the next scheduled Theta signal.",
      "Record the exact local time, symbol, timeframe, direction, entry, stop, target, and whether it was paper or real observation.",
      "Tag whether the setup matched the 120 EMA, Jewel SO9 boundary, lunar window, compression, and price-action confirmation rules.",
      "Flag any trade you think should not have been taken so it can be added to repeated-loss family research.",
      "Keep real-money decisions separate until paper stats clearly show wins exceeding losses and risk is explicitly approved."
    ]
  }
};

fs.mkdirSync(publicDataDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`Wrote ${path.relative(appRoot, outFile)} with ${dashboard.tradeHistory.length} trade rows.`);
