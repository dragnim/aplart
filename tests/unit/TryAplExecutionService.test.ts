import { describe, expect, it, vi } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { AplExecutionError } from '@/execution/errors';

const ENDPOINT = 'https://example.invalid/Exec';

/** A fetch that answers with a TryAPL-shaped response. */
function respondWith(outputLines: readonly string[], init: ResponseInit = {}): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(['state-blob', 4834, 'blob', outputLines]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
      }),
  ) as unknown as typeof fetch;
}

function service(fetchImpl: typeof fetch, overrides = {}) {
  return new TryAplExecutionService({ endpoint: ENDPOINT, fetchImpl, ...overrides });
}

async function expectFailure(promise: Promise<unknown>): Promise<AplExecutionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AplExecutionError) return error;
    throw new Error(`expected an AplExecutionError, got ${String(error)}`);
  }
  throw new Error('expected the call to fail, but it succeeded');
}

describe('TryAplExecutionService', () => {
  describe('the request it builds', () => {
    it('posts the state-array payload with the expression fourth', async () => {
      const fetchImpl = respondWith(['2']);
      await service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true });

      const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(ENDPOINT);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual(['', 0, '', '1+1']);
    });

    it('starts from a clean workspace every time', async () => {
      const fetchImpl = respondWith(['2']);
      const subject = service(fetchImpl);

      await subject.execute({ code: 'a←1', timeoutMs: 5000, freshWorkspace: true });
      await subject.execute({ code: 'a', timeoutMs: 5000, freshWorkspace: true });

      // The state slot stays empty, so one artwork can never see another's
      // variables even if the backend did preserve them.
      for (const call of vi.mocked(fetchImpl).mock.calls) {
        const body = JSON.parse(String((call[1] as RequestInit).body)) as unknown[];
        expect(body[0]).toBe('');
      }
    });

    it('sends no credentials', async () => {
      const fetchImpl = respondWith(['2']);
      await service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true });

      const init = vi.mocked(fetchImpl).mock.calls[0]?.[1] as RequestInit;
      expect(init.credentials).toBe('omit');
    });

    it('sends UTF-8, so APL glyphs survive the trip', async () => {
      const fetchImpl = respondWith(['1 2 3']);
      await service(fetchImpl).execute({ code: '⍳3', timeoutMs: 5000, freshWorkspace: true });

      const init = vi.mocked(fetchImpl).mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json; charset=utf-8' });
      expect(String(init.body)).toContain('⍳3');
    });
  });

  describe('the response it reads', () => {
    it('returns the output lines from the fourth item', async () => {
      const result = await service(respondWith(['1 2 3', '4 5 6'])).execute({
        code: '2 3⍴⍳6',
        timeoutMs: 5000,
        freshWorkspace: true,
      });

      expect(result.outputLines).toEqual(['1 2 3', '4 5 6']);
      expect(result.rawOutput).toBe('1 2 3\n4 5 6');
    });

    it('does not treat an APL error as a transport failure', async () => {
      // Errors arrive with HTTP 200; recognising them is the runner's job.
      const result = await service(respondWith(['LENGTH ERROR', ' 3 3⍴⍳8', '    ∧'])).execute({
        code: '3 3⍴⍳8',
        timeoutMs: 5000,
        freshWorkspace: true,
      });

      expect(result.outputLines[0]).toBe('LENGTH ERROR');
    });

    it('warns when the response reaches the line cap', async () => {
      const lines = Array.from({ length: 93 }, () => '1 2 3');
      const result = await service(respondWith(lines)).execute({
        code: 'x',
        timeoutMs: 5000,
        freshWorkspace: true,
      });

      expect(result.warnings.join(' ')).toContain('93 lines');
    });

    it('warns when a line reaches the length cap', async () => {
      const result = await service(respondWith(['1'.repeat(995)])).execute({
        code: 'x',
        timeoutMs: 5000,
        freshWorkspace: true,
      });

      expect(result.warnings.join(' ')).toContain('995 characters');
    });
  });

  describe('failures', () => {
    it('reports an HTTP error as the service being unavailable', async () => {
      const fetchImpl = vi.fn(async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;

      const error = await expectFailure(
        service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true }),
      );

      expect(error.kind).toBe('serverUnavailable');
      expect(error.detail).toContain('502');
    });

    it('reports a non-JSON body as a bad response', async () => {
      const fetchImpl = vi.fn(
        async () => new Response('<html>error</html>', { status: 200 }),
      ) as unknown as typeof fetch;

      const error = await expectFailure(
        service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true }),
      );

      expect(error.kind).toBe('badResponse');
    });

    it('reports a JSON body of the wrong shape as a bad response', async () => {
      const fetchImpl = vi.fn(async () => new Response('{"unexpected":true}')) as unknown as typeof fetch;

      const error = await expectFailure(
        service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true }),
      );

      expect(error.kind).toBe('badResponse');
      expect(error.detail).toContain('expected a JSON array');
    });

    it('reports a network failure as the service being unavailable', async () => {
      // fetch rejects with TypeError for DNS, refused connections and CORS
      // alike; the browser deliberately does not distinguish them.
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch;

      const error = await expectFailure(
        service(fetchImpl).execute({ code: '1+1', timeoutMs: 5000, freshWorkspace: true }),
      );

      expect(error.kind).toBe('serverUnavailable');
    });

    it('times out rather than waiting indefinitely', async () => {
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
      ) as unknown as typeof fetch;

      const error = await expectFailure(
        service(fetchImpl).execute({ code: '⍳1e9', timeoutMs: 20, freshWorkspace: true }),
      );

      expect(error.kind).toBe('timeout');
      expect(error.message).toBe('The code took too long to run and was stopped.');
    });

    it('reports a caller abort as cancelled, not as a timeout', async () => {
      const controller = new AbortController();
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
      ) as unknown as typeof fetch;

      const promise = service(fetchImpl).execute({
        code: 'x',
        timeoutMs: 10_000,
        freshWorkspace: true,
        signal: controller.signal,
      });
      controller.abort();

      expect((await expectFailure(promise)).kind).toBe('cancelled');
    });

    it('refuses code longer than the limit without calling the service', async () => {
      const fetchImpl = respondWith(['2']);

      const error = await expectFailure(
        service(fetchImpl, { maxCodeLength: 10 }).execute({
          code: '1234567890123',
          timeoutMs: 5000,
          freshWorkspace: true,
        }),
      );

      expect(error.kind).toBe('codeTooLong');
      expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
    });

    it('counts code length in characters, not UTF-16 units', async () => {
      const fetchImpl = respondWith(['1 2 3']);
      // Eight APL glyphs, well inside a limit of ten.
      await service(fetchImpl, { maxCodeLength: 10 }).execute({
        code: '⍳⍴⌽⊖⍉∘⍨⍤',
        timeoutMs: 5000,
        freshWorkspace: true,
      });

      expect(vi.mocked(fetchImpl)).toHaveBeenCalled();
    });

    it('refuses an oversized response', async () => {
      const fetchImpl = respondWith(['1 2 3'], {
        headers: { 'Content-Type': 'application/json', 'Content-Length': '9999999' },
      });

      const error = await expectFailure(
        service(fetchImpl, { maxResponseBytes: 1000 }).execute({
          code: 'x',
          timeoutMs: 5000,
          freshWorkspace: true,
        }),
      );

      expect(error.kind).toBe('tooLarge');
    });
  });

  describe('single-flight', () => {
    it('aborts the previous run when a new one starts', async () => {
      const aborted: boolean[] = [];
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted.push(true);
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            });
            setTimeout(() => resolve(new Response(JSON.stringify(['s', 0, '', ['2']]))), 50);
          }),
      ) as unknown as typeof fetch;

      const subject = service(fetchImpl);
      const first = subject.execute({ code: 'a', timeoutMs: 5000, freshWorkspace: true });
      const second = subject.execute({ code: 'b', timeoutMs: 5000, freshWorkspace: true });

      expect((await expectFailure(first)).kind).toBe('cancelled');
      await expect(second).resolves.toMatchObject({ outputLines: ['2'] });
      expect(aborted).toHaveLength(1);
    });

    it('is safe to cancel when nothing is running', () => {
      expect(() => service(respondWith(['2'])).cancel()).not.toThrow();
    });
  });
});
