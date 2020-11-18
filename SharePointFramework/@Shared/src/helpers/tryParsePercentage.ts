import { tryParseFloat } from './'

/**
 *
 * @param {string} str The string to parse
 * @param {boolean} addPostfix Add postix (%)
 * @param {string | number} fallback Fallback if parse fails
 */
export function tryParsePercentage(
  str: string,
  addPostfix: boolean = true,
  fallback: string | number
): number | string {
  const parsed = tryParseFloat(str, fallback)
  if (parsed === fallback) {
    return fallback
  }
  const percentage = (parsed as number) * 100
  return addPostfix ? `${percentage}%` : percentage
}
