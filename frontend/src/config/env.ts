/**
 * Environment configuration validation.
 *
 * Rules enforced:
 *  - VITE_DATA_MODE must be "mock" or "api" (or absent, which defaults to "mock").
 *  - Per-feature overrides follow the same rule.
 *  - VITE_API_BASE_URL must be provided in production whenever any feature is in
 *    api mode. In development, an empty URL is allowed — the Vite dev-server proxy
 *    forwards /api/* to localhost:8000, so no base URL is needed.
 *  - VITE_API_BASE_URL must start with http:// or https:// when non-empty.
 *  - VITE_API_BASE_URL must not be a localhost URL in production.
 *
 * Security notes:
 *  - VITE_* variables are embedded in the browser bundle. Never put backend
 *    secrets, Groq credentials, database URIs or private tokens here.
 *  - Only the public API origin belongs in VITE_API_BASE_URL.
 */

export type DataMode = 'mock' | 'api'

export type EnvConfig = {
  apiBaseUrl: string
  dataMode: DataMode
  featureOverrides: Partial<Record<KnownFeature, DataMode>>
  isProduction: boolean
}

export type EnvValidationResult = {
  config: EnvConfig
  warnings: string[]
  /** Non-empty only for a critical misconfiguration that blocks safe operation. */
  criticalError?: string
}

export type KnownFeature =
  | 'auth'
  | 'profile'
  | 'courses'
  | 'documents'
  | 'study-sessions'
  | 'progress'
  | 'roadmaps'
  | 'exams'
  | 'dashboard'
  | 'chat'
  | 'study-tools'

const KNOWN_FEATURES: KnownFeature[] = [
  'auth',
  'profile',
  'courses',
  'documents',
  'study-sessions',
  'progress',
  'roadmaps',
  'exams',
  'dashboard',
  'chat',
  'study-tools',
]

function featureEnvKey(feature: KnownFeature): string {
  return `VITE_${feature.toUpperCase().replaceAll('-', '_')}_DATA_MODE`
}

function readMode(value: string | undefined, envKey: string, warnings: string[]): DataMode | undefined {
  if (value === undefined || value === '') return undefined
  if (value === 'mock' || value === 'api') return value
  warnings.push(
    `${envKey}="${value}" is not a recognised value. Expected "mock" or "api". ` +
    `This variable will be ignored and the global VITE_DATA_MODE will apply.`,
  )
  return undefined
}

export function validateEnv(): EnvValidationResult {
  const warnings: string[] = []
  const isProduction = import.meta.env.PROD === true

  // -------------------------------------------------------------------------
  // Global data mode
  // -------------------------------------------------------------------------
  const rawDataMode = import.meta.env.VITE_DATA_MODE as string | undefined
  const dataMode: DataMode = readMode(rawDataMode, 'VITE_DATA_MODE', warnings) ?? 'mock'

  // -------------------------------------------------------------------------
  // Per-feature overrides
  // -------------------------------------------------------------------------
  const featureOverrides: Partial<Record<KnownFeature, DataMode>> = {}
  for (const feature of KNOWN_FEATURES) {
    const key = featureEnvKey(feature)
    const val = import.meta.env[key] as string | undefined
    const parsed = readMode(val, key, warnings)
    if (parsed !== undefined) featureOverrides[feature] = parsed
  }

  // -------------------------------------------------------------------------
  // API base URL
  // -------------------------------------------------------------------------
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  const apiBaseUrl = rawBaseUrl?.trim() ?? ''

  const anyApiMode =
    dataMode === 'api' || Object.values(featureOverrides).some((m) => m === 'api')

  let criticalError: string | undefined

  if (anyApiMode) {
    if (!apiBaseUrl) {
      if (isProduction) {
        // In production there is no Vite proxy — an empty base URL means all
        // /api/* requests go to the same origin as the bundle, which will 404.
        criticalError =
          'VITE_API_BASE_URL is not set but one or more features are in api mode. ' +
          'Set VITE_API_BASE_URL to your production API origin (e.g. https://api.example.com). ' +
          'See .env.example for details.'
      } else {
        // Development: the Vite proxy forwards /api/* to localhost:8000 so an
        // empty base URL is intentional.
        warnings.push(
          'VITE_API_BASE_URL is not set. In development the Vite proxy will forward ' +
          '/api/* to http://localhost:8000. If your FastAPI server is on a different port, ' +
          'set VITE_API_BASE_URL=http://localhost:<port> or update the proxy in vite.config.ts.',
        )
      }
    } else {
      if (!/^https?:\/\//i.test(apiBaseUrl)) {
        warnings.push(
          `VITE_API_BASE_URL="${apiBaseUrl}" does not look like a URL. ` +
          `It should start with http:// or https://.`,
        )
      }
      if (isProduction && /localhost|127\.0\.0\.1/i.test(apiBaseUrl)) {
        warnings.push(
          `VITE_API_BASE_URL="${apiBaseUrl}" contains a localhost address but ` +
          `the app is in production mode. Update it to your production API URL.`,
        )
      }
    }
  }

  const config: EnvConfig = { apiBaseUrl, dataMode, featureOverrides, isProduction }
  return { config, warnings, criticalError }
}
