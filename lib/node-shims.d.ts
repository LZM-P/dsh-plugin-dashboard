/**
 * Minimal ambient types for the handful of Node built-ins this plugin imports.
 *
 * The package does not depend on `@types/node` — the Host runs these modules
 * directly, and pulling in the full Node typings just to type four functions
 * would make the type check depend on a devDependency the runtime never uses.
 * Declaring only what is imported keeps `tsc --checkJs` honest: if a new Node
 * API appears without a declaration here, the type check fails instead of
 * silently widening to `any`.
 */

declare module 'node:fs' {
  export interface Dirent {
    name: string
    isDirectory(): boolean
    isSymbolicLink(): boolean
    isFile(): boolean
  }

  export interface Stats {
    isDirectory(): boolean
    size: number
  }

  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[]
  export function readFileSync(path: string, options: 'utf8' | { encoding: 'utf8' }): string
  export function renameSync(from: string, to: string): void
  export function statSync(path: string): Stats
  export function writeFileSync(path: string, data: string, options?: 'utf8' | { encoding?: 'utf8' }): void
}

declare module 'node:os' {
  export function homedir(): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function resolve(...parts: string[]): string
  export function basename(path: string): string
  export function dirname(path: string): string
}

/** Node's Buffer, used only for byte counting. */
declare const Buffer: {
  byteLength(input: string, encoding?: string): number
}
