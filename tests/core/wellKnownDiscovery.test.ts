import { afterEach, describe, expect, it, vi } from 'vitest';
import { WellKnownDiscovery } from '../../src/core/wellKnownDiscovery.js';

describe('WellKnownDiscovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports direct index URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      skills: [
        {
          name: 'review-helper',
          description: 'Review code',
          source: 'agentinit-labs/test-skills-repo/review-helper',
          version: '1.0.0',
          author: 'AgentInit',
        },
      ],
    })));
    vi.stubGlobal('fetch', fetchMock);

    const discovery = new WellKnownDiscovery();
    const result = await discovery.discover('https://example.com/catalog/index.json');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/catalog/index.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual([
      {
        name: 'review-helper',
        description: 'Review code',
        source: 'agentinit-labs/test-skills-repo/review-helper',
        version: '1.0.0',
        author: 'AgentInit',
      },
    ]);
  });

  it('falls back from the agent-skills well-known path to the generic skills path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        skills: [
          {
            name: 'docs-helper',
            source: './skills/docs-helper',
          },
        ],
      })));
    vi.stubGlobal('fetch', fetchMock);

    const discovery = new WellKnownDiscovery();
    const result = await discovery.discover('https://example.com');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/.well-known/agent-skills/index.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/.well-known/skills/index.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual([
      {
        name: 'docs-helper',
        source: './skills/docs-helper',
      },
    ]);
  });

  it('rejects malformed skill entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      skills: [
        {
          name: 'missing-source',
        },
      ],
    }))));

    const discovery = new WellKnownDiscovery();

    await expect(discovery.discover('https://example.com/index.json')).rejects.toThrow(
      'invalid response structure',
    );
  });
});
