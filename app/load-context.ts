/**
 * App-wide augmentation of React Router's `AppLoadContext`.
 *
 * Add fields here when you need to surface per-request data from the Express
 * adapter (e.g. CSP nonce, auth claims) into loaders / actions / `entry.server`.
 */
declare module 'react-router' {
  interface AppLoadContext {
    cspNonce: string
  }
}

export {}
