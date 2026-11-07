export type DataMode = 'mock' | 'api'

function readMode(value: string | undefined, envKey: string): DataMode {
  if (value === 'api') return 'api'
  if (value === 'mock' || value === undefined || value === '') return 'mock'
  // Unrecognised value: warn and fall back to mock so the app stays functional.
  // The startup validator in src/config/env.ts also catches this during initialisation.
  console.warn(
    `[studymate config] ${envKey}="${value}" is not valid — expected "mock" or "api". ` +
    `Falling back to "mock".`,
  )
  return 'mock'
}

export function getDataMode(feature: string): DataMode {
  const key = `VITE_${feature.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}_DATA_MODE`
  const featureValue = import.meta.env[key] as string | undefined
  if (featureValue !== undefined && featureValue !== '') {
    return readMode(featureValue, key)
  }
  return readMode(import.meta.env.VITE_DATA_MODE as string | undefined, 'VITE_DATA_MODE')
}

export function selectService<T>(feature: string, mockService: T, apiService: T): T {
  return getDataMode(feature) === 'api' ? apiService : mockService
}
