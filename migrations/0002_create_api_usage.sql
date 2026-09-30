-- Appels a l'API par jour, endpoint et famille de User-Agent (premier mot, jamais le User-Agent complet, jamais d'IP).
CREATE TABLE IF NOT EXISTS api_usage (
  day TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  ua_family TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, endpoint, ua_family)
);
