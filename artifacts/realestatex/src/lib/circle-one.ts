/** Local scenario calculation: inputs are user assumptions, not verified market data. */
export const CIRCLE_ONE_MIN_YIELD = 7.5;
export const CIRCLE_ONE_AIRCO_KW = 5;

export interface CircleOneInput {
  region: 'gorinchem' | 'gooi' | 'outside';
  radiusKm: number;
  distanceKm: number;
  purchasePrice: number;
  acquisitionCosts: number;
  renovationCosts: number;
  aircoCosts: number;
  pvCosts: number;
  panelCount: number;
  panelWp: number;
  monthlyRent: number;
  vacancyPercent: number;
  annualOperatingCosts: number;
}

export const circleOneExample: CircleOneInput = {
  region: 'gorinchem', radiusKm: 70, distanceKm: 42,
  purchasePrice: 200000, acquisitionCosts: 20000, renovationCosts: 20000,
  aircoCosts: 5000, pvCosts: 7000, panelCount: 10, panelWp: 450,
  monthlyRent: 1900, vacancyPercent: 5, annualOperatingCosts: 2400,
};

export function calculateCircleOne(input: CircleOneInput) {
  const errors: string[] = [];
  const numericKeys = [
    'radiusKm', 'distanceKm', 'purchasePrice', 'acquisitionCosts', 'renovationCosts',
    'aircoCosts', 'pvCosts', 'panelCount', 'panelWp', 'monthlyRent',
    'vacancyPercent', 'annualOperatingCosts',
  ] as const;
  if (numericKeys.some((key) => !Number.isFinite(input[key]) || input[key] < 0)) {
    errors.push('Vul voor alle bedragen en specificaties geldige, niet-negatieve getallen in.');
  }
  if (!['gorinchem', 'gooi', 'outside'].includes(input.region)) errors.push('Kies een geldige regio.');
  if (input.radiusKm < 50 || input.radiusKm > 70) errors.push('De zoekstraal moet tussen 50 en 70 km liggen.');
  if (input.purchasePrice <= 0) errors.push('De aankoopprijs moet hoger zijn dan nul.');
  if (input.aircoCosts <= 0 || input.pvCosts <= 0) errors.push('Neem positieve kosten voor zowel de 5 kW-airco als de glas-glas-PV-kit op.');
  if (!Number.isInteger(input.panelCount) || input.panelCount <= 0 || input.panelWp <= 0) {
    errors.push('Vul een geheel, positief aantal panelen en een positief vermogen per paneel in.');
  }
  if (input.vacancyPercent > 100) errors.push('Leegstand moet tussen 0 en 100% liggen.');
  if (errors.length) return { valid: false as const, errors };

  const kitInvestment = input.aircoCosts + input.pvCosts;
  const totalInvestment = input.purchasePrice + input.acquisitionCosts + input.renovationCosts + kitInvestment;
  const grossAnnualRent = input.monthlyRent * 12;
  const vacancyLoss = grossAnnualRent * input.vacancyPercent / 100;
  const effectiveAnnualRent = grossAnnualRent - vacancyLoss;
  const netAnnualRent = effectiveAnnualRent - input.annualOperatingCosts;
  const netYieldPercent = netAnnualRent / totalInvestment * 100;
  const grossYieldPercent = grossAnnualRent / totalInvestment * 100;
  const regionEligible = input.region === 'gooi'
    || (input.region === 'gorinchem' && input.distanceKm <= input.radiusKm);
  // Compare the unrounded cash flows: a displayed 7.50% must not hide a failing 7.499% case.
  const yieldEligible = netAnnualRent >= totalInvestment * CIRCLE_ONE_MIN_YIELD / 100;
  const requiredMonthlyRent = input.vacancyPercent === 100 ? null
    : Math.ceil((totalInvestment * CIRCLE_ONE_MIN_YIELD / 100 + input.annualOperatingCosts)
      / (12 * (1 - input.vacancyPercent / 100)) * 100) / 100;
  const pvKwp = input.panelCount * input.panelWp / 1000;
  if ([kitInvestment, totalInvestment, grossAnnualRent, vacancyLoss, effectiveAnnualRent,
    netAnnualRent, netYieldPercent, grossYieldPercent, pvKwp,
    ...(requiredMonthlyRent === null ? [] : [requiredMonthlyRent])].some((value) => !Number.isFinite(value))) {
    return { valid: false as const, errors: ['De invoer is te groot om veilig te berekenen. Gebruik kleinere bedragen en specificaties.'] };
  }
  return {
    valid: true as const, errors: [], kitInvestment, totalInvestment,
    grossAnnualRent, vacancyLoss, effectiveAnnualRent, netAnnualRent,
    netYieldPercent, grossYieldPercent, regionEligible, yieldEligible,
    eligible: regionEligible && yieldEligible,
    requiredMonthlyRent, pvKwp,
  };
}
