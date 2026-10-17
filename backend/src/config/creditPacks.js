export const CREDIT_PACKS = [
  { id: "starter", name: "体验包", credits: 50, priceFen: 500 },
  { id: "standard", name: "标准包", credits: 200, priceFen: 1500 },
  { id: "premium", name: "专业包", credits: 500, priceFen: 3000 },
  { id: "ultimate", name: "旗舰包", credits: 1500, priceFen: 7500 }
];

export function getCreditPack(packId) {
  const id = String(packId || "").trim();
  return CREDIT_PACKS.find((p) => p.id === id) || null;
}
