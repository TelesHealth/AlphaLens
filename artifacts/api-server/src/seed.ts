import { db } from "@workspace/db";
import { assetsTable, signalsTable, portfolioTable } from "@workspace/db/schema";

const SEED_ASSETS = [
  {
    name: "Bitcoin (BTC)",
    symbol: "BTC",
    sector: "crypto",
    currentPrice: 87450.0,
    priceChange24h: 2.34,
    marketProbability: 65,
    description: "Bitcoin — the largest cryptocurrency by market cap",
    sourceUrl: "https://coingecko.com/en/coins/bitcoin",
    region: "global",
    tags: ["crypto", "btc"],
  },
  {
    name: "Ethereum (ETH)",
    symbol: "ETH",
    sector: "crypto",
    currentPrice: 3120.0,
    priceChange24h: -1.15,
    marketProbability: 58,
    description: "Ethereum — smart contract platform and DeFi backbone",
    sourceUrl: "https://coingecko.com/en/coins/ethereum",
    region: "global",
    tags: ["crypto", "eth"],
  },
  {
    name: "Solana (SOL)",
    symbol: "SOL",
    sector: "crypto",
    currentPrice: 142.5,
    priceChange24h: 5.67,
    marketProbability: 62,
    description: "Solana — high-performance blockchain for DeFi and NFTs",
    sourceUrl: "https://coingecko.com/en/coins/solana",
    region: "global",
    tags: ["crypto", "sol"],
  },
  {
    name: "S&P 500 ETF (SPY)",
    symbol: "SPY",
    sector: "equities",
    currentPrice: 5890.0,
    priceChange24h: 0.45,
    marketProbability: 55,
    description: "SPDR S&P 500 ETF Trust — tracks the S&P 500 index",
    sourceUrl: "https://finance.yahoo.com/quote/SPY",
    region: "us",
    tags: ["equities", "spy"],
  },
  {
    name: "NASDAQ 100 ETF (QQQ)",
    symbol: "QQQ",
    sector: "equities",
    currentPrice: 510.0,
    priceChange24h: 0.82,
    marketProbability: 58,
    description: "Invesco QQQ Trust — tracks the NASDAQ-100 index",
    sourceUrl: "https://finance.yahoo.com/quote/QQQ",
    region: "us",
    tags: ["equities", "qqq"],
  },
  {
    name: "Gold (GLD)",
    symbol: "GLD",
    sector: "metals",
    currentPrice: 2345.0,
    priceChange24h: 0.12,
    marketProbability: 52,
    description: "SPDR Gold Shares — tracks the price of gold bullion",
    sourceUrl: "https://finance.yahoo.com/quote/GLD",
    region: "global",
    tags: ["metals", "gold"],
  },
  {
    name: "Crude Oil (USO)",
    symbol: "USO",
    sector: "energy",
    currentPrice: 78.5,
    priceChange24h: -0.95,
    marketProbability: 48,
    description: "United States Oil Fund — tracks West Texas Intermediate crude oil",
    sourceUrl: "https://finance.yahoo.com/quote/USO",
    region: "global",
    tags: ["energy", "oil"],
  },
  {
    name: "Fed Rate Cut by July 2026",
    symbol: "FED-CUT",
    sector: "prediction",
    currentPrice: 42,
    priceChange24h: -3.2,
    marketProbability: 42,
    description: "Will the Federal Reserve cut interest rates before July 2026?",
    sourceUrl: "https://polymarket.com",
    region: "us",
    tags: ["prediction", "macro", "fed"],
  },
  {
    name: "US Recession by End of 2026",
    symbol: "US-REC",
    sector: "prediction",
    currentPrice: 28,
    priceChange24h: 1.5,
    marketProbability: 28,
    description: "Will the US economy enter a recession (2 consecutive quarters of negative GDP growth) by December 2026?",
    sourceUrl: "https://polymarket.com",
    region: "us",
    tags: ["prediction", "macro"],
  },
  {
    name: "BTC Above $100K by Dec 2026",
    symbol: "BTC-100K",
    sector: "prediction",
    currentPrice: 72,
    priceChange24h: 4.1,
    marketProbability: 72,
    description: "Will Bitcoin trade above $100,000 at any point before December 31, 2026?",
    sourceUrl: "https://polymarket.com",
    region: "global",
    tags: ["prediction", "crypto"],
  },
  {
    name: "EUR/USD",
    symbol: "EURUSD",
    sector: "fx",
    currentPrice: 1.085,
    priceChange24h: -0.15,
    marketProbability: 50,
    description: "Euro to US Dollar exchange rate",
    region: "global",
    tags: ["fx", "euro"],
  },
  {
    name: "Natural Gas (UNG)",
    symbol: "UNG",
    sector: "energy",
    currentPrice: 3.45,
    priceChange24h: 2.1,
    marketProbability: 55,
    description: "United States Natural Gas Fund — tracks natural gas futures",
    sourceUrl: "https://finance.yahoo.com/quote/UNG",
    region: "us",
    tags: ["energy", "natgas"],
  },
];

const SEED_SIGNALS = [
  {
    assetId: 1,
    type: "technical",
    source: "Glassnode",
    headline: "Bitcoin exchange reserves hit 5-year low",
    detail: "BTC reserves on major exchanges dropped to 2.1M coins, the lowest since 2021. Historically, supply squeezes have preceded 20-40% rallies within 60 days.",
    impact: "high",
    direction: "bullish",
    confidence: 0.82,
  },
  {
    assetId: 1,
    type: "fundamental",
    source: "CoinShares",
    headline: "Institutional BTC inflows surge to $1.2B weekly",
    detail: "Digital asset funds saw $1.2B in net inflows last week, led by Bitcoin ETFs. This marks the 4th consecutive week of positive flows.",
    impact: "high",
    direction: "bullish",
    confidence: 0.88,
  },
  {
    assetId: 1,
    type: "geopolitical",
    source: "Reuters",
    headline: "G7 nations signal crypto regulatory framework progress",
    detail: "G7 finance ministers agreed on a common framework for cryptocurrency regulation, reducing uncertainty for institutional investors.",
    impact: "medium",
    direction: "bullish",
    confidence: 0.71,
  },
  {
    assetId: 4,
    type: "economic",
    source: "Bureau of Labor Statistics",
    headline: "US CPI comes in at 2.8%, below consensus",
    detail: "March 2026 CPI data shows inflation continuing to moderate, supporting the case for rate cuts. Core CPI at 3.0% vs 3.1% expected.",
    impact: "high",
    direction: "bullish",
    confidence: 0.91,
  },
  {
    assetId: 4,
    type: "sentiment",
    source: "AAII Sentiment Survey",
    headline: "Retail investor bullish sentiment at 52-week high",
    detail: "The AAII weekly survey shows 48.2% bullish sentiment, the highest reading since Q1 2024. Historically, extreme bullish readings can signal short-term tops.",
    impact: "medium",
    direction: "bearish",
    confidence: 0.65,
  },
  {
    assetId: 7,
    type: "geopolitical",
    source: "Bloomberg",
    headline: "OPEC+ extends production cuts through Q3 2026",
    detail: "The cartel announced an extension of 2.2M barrel/day voluntary cuts, tightening global supply. Brent crude response was muted due to demand concerns.",
    impact: "high",
    direction: "bullish",
    confidence: 0.78,
  },
  {
    assetId: 7,
    type: "fundamental",
    source: "EIA",
    headline: "US crude inventories draw down 4.2M barrels",
    detail: "Weekly EIA report shows a larger-than-expected drawdown in US crude stockpiles, indicating stronger demand or reduced imports.",
    impact: "medium",
    direction: "bullish",
    confidence: 0.74,
  },
  {
    assetId: 8,
    type: "economic",
    source: "CME FedWatch",
    headline: "CME FedWatch probability for July cut drops to 38%",
    detail: "Markets are pricing in a lower probability of a July rate cut after strong employment data. The September meeting is now the consensus target.",
    impact: "high",
    direction: "bearish",
    confidence: 0.85,
  },
  {
    assetId: 6,
    type: "geopolitical",
    source: "World Gold Council",
    headline: "Central bank gold purchases accelerate in Q1 2026",
    detail: "Central banks added 290 tonnes of gold in Q1 2026, led by China and India. This is the strongest Q1 buying pace on record.",
    impact: "high",
    direction: "bullish",
    confidence: 0.87,
  },
  {
    assetId: 2,
    type: "fundamental",
    source: "DeFi Llama",
    headline: "Ethereum TVL surges past $80B on restaking wave",
    detail: "Total value locked in Ethereum DeFi protocols hit $80B, driven by EigenLayer restaking adoption and new L2 deployments.",
    impact: "medium",
    direction: "bullish",
    confidence: 0.76,
  },
  {
    assetId: 3,
    type: "technical",
    source: "Messari",
    headline: "Solana DEX volume overtakes Ethereum for 3rd consecutive month",
    detail: "Solana's decentralized exchange volume reached $48B in March, surpassing Ethereum's $42B. This trend is driven by memecoin trading and Raydium growth.",
    impact: "medium",
    direction: "bullish",
    confidence: 0.73,
  },
];

async function seed() {
  try {
    const existing = await db.select().from(assetsTable).limit(1);
    if (existing.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database with sample market data...");

    for (const asset of SEED_ASSETS) {
      await db.insert(assetsTable).values(asset as any);
    }
    console.log(`  Inserted ${SEED_ASSETS.length} assets`);

    for (const signal of SEED_SIGNALS) {
      await db.insert(signalsTable).values(signal as any);
    }
    console.log(`  Inserted ${SEED_SIGNALS.length} signals`);

    await db.insert(portfolioTable).values({
      balance: 10000,
      initialBalance: 10000,
    });
    console.log("  Created portfolio with $10,000 balance");

    console.log("Database seeding complete!");
  } catch (e: any) {
    console.error("Seeding error:", e.message);
  }
}

seed();
