import { CommitResult, type CommitOp } from '@ogm/contracts';

export interface CommitClient {
  execute(operation: CommitOp): Promise<CommitResult>;
}

export class CommitUnavailable extends Error {
  constructor(message = 'commit service unavailable') {
    super(message);
    this.name = 'CommitUnavailable';
  }
}

export class HttpCommitClient implements CommitClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async execute(operation: CommitOp): Promise<CommitResult> {
    try {
      const response = await this.fetcher(new URL('/internal/commit', this.baseUrl), {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(operation),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new CommitUnavailable(`commit service returned ${response.status}`);
      return CommitResult.parse(await response.json());
    } catch (error) {
      if (error instanceof CommitUnavailable) throw error;
      throw new CommitUnavailable((error as Error).message);
    }
  }
}
