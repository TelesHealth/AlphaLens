export const BENZINGA_PLACEHOLDER = {
  configured: false,
  note: "Benzinga news sentiment integration — pending subscription setup",
  apiKeyEnvVar: "BENZINGA_API_KEY",
  estimatedCost: "$150/month",
  capabilities: [
    "Real-time market-moving news",
    "Per-ticker sentiment scoring (positive/negative/neutral)",
    "Earnings surprises and analyst ratings",
    "High signal-to-noise ratio vs general news feeds",
  ],
  integrationStatus: "planned",
  priority: "Phase 2 enhancement — implement after Finnhub is live",
};

export async function fetchBenzingaSentiment(): Promise<null> {
  console.warn("Benzinga integration not yet implemented — placeholder only");
  return null;
}
