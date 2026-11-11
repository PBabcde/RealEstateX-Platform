/** Avoid silently interpreting Dutch thousands separators as small decimal amounts. */
export function parseCircleOneNumber(raw: string, integer = false): { value?: number; error?: string } {
  const valueText = (raw ?? '').trim();
  if (!valueText) return { error: 'Verplicht veld: leeg telt niet als nul.' };
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(valueText)) {
    return { error: 'Gebruik geen duizendtalscheiding en maximaal 2 decimalen, bijvoorbeeld 1900,50.' };
  }
  const value = Number(valueText.replace(',', '.'));
  if (!Number.isFinite(value)) return { error: 'Ongeldig getal.' };
  if (integer && !Number.isInteger(value)) return { error: 'Gebruik een geheel getal.' };
  return { value };
}
