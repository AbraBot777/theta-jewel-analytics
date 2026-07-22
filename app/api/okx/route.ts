import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OKX_BASE = "https://www.okx.com";
const ALLOWED_BARS = new Set(["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "1D"]);

function cleanInstrument(value: string | null) {
  const instId = (value || "BTC-USDT").toUpperCase();
  if (!/^[A-Z0-9]{2,12}-USDT$/.test(instId)) return "BTC-USDT";
  return instId;
}

function cleanBar(value: string | null) {
  const bar = value || "5m";
  return ALLOWED_BARS.has(bar) ? bar : "5m";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const instId = cleanInstrument(params.get("instId"));
  const bar = cleanBar(params.get("bar"));
  const limit = Math.min(Math.max(Number(params.get("limit") || 120), 20), 200);

  const candlesUrl = `${OKX_BASE}/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${limit}`;
  const tickerUrl = `${OKX_BASE}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`;

  try {
    const [candlesResponse, tickerResponse] = await Promise.all([
      fetch(candlesUrl, { cache: "no-store" }),
      fetch(tickerUrl, { cache: "no-store" })
    ]);

    if (!candlesResponse.ok || !tickerResponse.ok) {
      return NextResponse.json(
        { error: "OKX public market-data request failed.", instId, bar },
        { status: 502 }
      );
    }

    const [candlesJson, tickerJson] = await Promise.all([
      candlesResponse.json(),
      tickerResponse.json()
    ]);

    if (candlesJson.code !== "0" || tickerJson.code !== "0") {
      return NextResponse.json(
        { error: "OKX returned an error.", instId, bar, okx: { candles: candlesJson, ticker: tickerJson } },
        { status: 502 }
      );
    }

    const candles = (candlesJson.data || [])
      .map((row: string[]) => ({
        ts: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        confirmed: row[8] === "1"
      }))
      .reverse();

    const ticker = tickerJson.data?.[0] || {};
    return NextResponse.json(
      {
        instId,
        bar,
        fetchedAt: new Date().toISOString(),
        ticker: {
          last: Number(ticker.last),
          bid: Number(ticker.bidPx),
          ask: Number(ticker.askPx),
          open24h: Number(ticker.open24h),
          high24h: Number(ticker.high24h),
          low24h: Number(ticker.low24h),
          volume24h: Number(ticker.vol24h)
        },
        candles
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown OKX fetch error.", instId, bar },
      { status: 500 }
    );
  }
}
