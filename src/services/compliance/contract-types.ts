export const CONTRACT_TYPES = {
  AIA_A201_2017: {
    name: "AIA A201-2017",
    patterns: [
      "aia document a201",
      "a201-2017",
      "general conditions of the contract for construction",
    ],
  },
  AIA_A401_2017: {
    name: "AIA A401-2017",
    patterns: [
      "aia document a401",
      "a401-2017",
      "standard form of agreement between contractor and subcontractor",
    ],
  },
  CONSENSUSDOCS_750: {
    name: "ConsensusDocs 750",
    patterns: [
      "consensusdocs 750",
      "consensusdocs",
      "cost of the work plus a fee",
    ],
  },
  CUSTOM: {
    name: "Custom Contract",
    patterns: [],
  },
} as const;

export type ContractTypeKey = keyof typeof CONTRACT_TYPES;

export function detectContractType(contractText: string): ContractTypeKey {
  const lower = contractText.toLowerCase();

  for (const [key, config] of Object.entries(CONTRACT_TYPES)) {
    if (key === "CUSTOM") continue;
    for (const pattern of config.patterns) {
      if (lower.includes(pattern)) return key as ContractTypeKey;
    }
  }

  return "CUSTOM";
}
