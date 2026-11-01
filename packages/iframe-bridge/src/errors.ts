export type BridgeErrorCode = 'too_large' | 'timeout' | 'closed' | 'not_ready';
// prettier-ignore
export class BridgeError extends Error {
  constructor(readonly code: BridgeErrorCode) { super(code); this.name = 'BridgeError'; }
}
