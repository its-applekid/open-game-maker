export class AiurHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly daemon: string,
  ) {
    super(message);
    this.name = 'AiurHttpError';
  }
}

export class AiurContractError extends Error {
  constructor(
    readonly expected: string,
    readonly received: string,
    message = `Expected ${expected}, received ${received}`,
  ) {
    super(message);
    this.name = 'AiurContractError';
  }
}

export class AiurUnavailableError extends Error {
  constructor(
    readonly daemon: string,
    override readonly cause: unknown,
  ) {
    super(`Aiur daemon at ${daemon} is unavailable`, { cause });
    this.name = 'AiurUnavailableError';
  }
}

export class AiurConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiurConfigError';
  }
}

export class AiurEventFeedError extends Error {
  constructor(readonly code: string) {
    super(`Aiur event feed error: ${code}`);
    this.name = 'AiurEventFeedError';
  }
}
