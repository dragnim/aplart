import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalProjectRepository } from '@/storage/LocalProjectRepository';
import { PROJECT_SCHEMA_VERSION, type Project } from '@/storage/ProjectRepository';
import { migrateProject } from '@/storage/storageMigrations';
import { defaultRenderOptions } from '@/renderer/renderOptions';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'preset:modular-bloom',
    sourcePresetId: 'modular-bloom',
    title: 'Modular Bloom',
    code: 'size←64\nmodulus←17\nmodulus|∘.×⍨⍳size',
    parameterValues: {},
    paletteId: 'neon',
    renderOptions: { ...defaultRenderOptions('neon'), invert: true, rotation: 90 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('migrateProject', () => {
  it('accepts a well-formed record', () => {
    const outcome = migrateProject(makeProject());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.project.code).toContain('modulus←17');
      expect(outcome.project.renderOptions.rotation).toBe(90);
    }
  });

  it('rejects anything that is not an object', () => {
    for (const value of [null, 42, 'text', [1, 2]]) {
      expect(migrateProject(value).ok).toBe(false);
    }
  });

  it('rejects a record missing its essentials', () => {
    expect(migrateProject({ id: 'x' }).ok).toBe(false);
    expect(migrateProject({ ...makeProject(), code: 123 }).ok).toBe(false);
  });

  it('rejects a record from a newer version rather than guessing at it', () => {
    const outcome = migrateProject({ ...makeProject(), schemaVersion: 99 });
    expect(outcome).toMatchObject({ ok: false, reason: expect.stringContaining('newer version') });
  });

  it('treats an unversioned record as the first version', () => {
    const { schemaVersion: _drop, ...rest } = makeProject();
    expect(migrateProject(rest).ok).toBe(true);
  });

  it('falls back to a real palette when the stored one is unknown', () => {
    const outcome = migrateProject(makeProject({ paletteId: 'not-a-palette' }));
    expect(outcome.ok && outcome.project.paletteId).toBe('ember');
  });

  it('discards a nonsense rotation', () => {
    const outcome = migrateProject({ ...makeProject(), renderOptions: { rotation: 45 } });
    expect(outcome.ok && outcome.project.renderOptions.rotation).toBe(0);
  });

  it('discards a matrix whose values do not match its shape', () => {
    const outcome = migrateProject({
      ...makeProject(),
      lastSuccessfulMatrix: { rows: 2, columns: 2, values: [1, 2, 3] },
    });
    expect(outcome.ok && outcome.project.lastSuccessfulMatrix).toBeUndefined();
  });

  it('keeps a matrix that is consistent', () => {
    const outcome = migrateProject({
      ...makeProject(),
      lastSuccessfulMatrix: { rows: 2, columns: 2, values: [1, 2, 3, 4] },
    });
    expect(outcome.ok && outcome.project.lastSuccessfulMatrix?.values).toEqual([1, 2, 3, 4]);
  });

  it('replaces an invalid timestamp rather than propagating it', () => {
    const outcome = migrateProject(makeProject({ updatedAt: 'not a date' }));
    expect(outcome.ok && Number.isNaN(Date.parse(outcome.project.updatedAt))).toBe(false);
  });
});

describe('LocalProjectRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and reads a project back', async () => {
    const repository = new LocalProjectRepository();
    await repository.save(makeProject());

    const loaded = await repository.get('preset:modular-bloom');
    expect(loaded?.code).toContain('modulus←17');
    expect(loaded?.paletteId).toBe('neon');
  });

  it('reads synchronously for first-render hydration', () => {
    const repository = new LocalProjectRepository();
    void repository.save(makeProject());
    expect(repository.getImmediate('preset:modular-bloom')?.code).toContain('modulus←17');
  });

  it('returns null for something never saved', async () => {
    expect(await new LocalProjectRepository().get('preset:nothing')).toBeNull();
  });

  it('lists what has been saved, most recent first', async () => {
    const repository = new LocalProjectRepository();
    await repository.save(makeProject({ id: 'a', sourcePresetId: 'a' }));
    await repository.save(makeProject({ id: 'b', sourcePresetId: 'b' }));

    const listed = await repository.list();
    expect(listed.map((entry) => entry.id)).toContain('a');
    expect(listed.map((entry) => entry.id)).toContain('b');
  });

  it('removes a project', async () => {
    const repository = new LocalProjectRepository();
    await repository.save(makeProject());
    await repository.remove('preset:modular-bloom');
    expect(await repository.get('preset:modular-bloom')).toBeNull();
  });

  it('clears everything it owns', async () => {
    const repository = new LocalProjectRepository();
    await repository.save(makeProject({ id: 'a' }));
    await repository.save(makeProject({ id: 'b' }));
    await repository.clear();
    expect(await repository.list()).toEqual([]);
  });

  it('drops a matrix too large to be worth storing', async () => {
    const repository = new LocalProjectRepository();
    await repository.save(
      makeProject({
        lastSuccessfulMatrix: { rows: 300, columns: 300, values: new Array(90_000).fill(1) },
      }),
    );
    expect((await repository.get('preset:modular-bloom'))?.lastSuccessfulMatrix).toBeUndefined();
  });

  it('discards a corrupted record instead of failing every load', async () => {
    localStorage.setItem('apl-art:projects', JSON.stringify(['broken']));
    localStorage.setItem('apl-art:project:broken', '{not json');

    const repository = new LocalProjectRepository();
    expect(await repository.get('broken')).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  describe('when storage is unavailable', () => {
    it('reports itself unavailable and still lets everything else work', async () => {
      // Private browsing and blocked third-party contexts throw on access
      // rather than returning null, which is the case that actually bites.
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const repository = new LocalProjectRepository();
      expect(repository.available).toBe(false);

      // None of these may throw; the artwork must keep working unsaved.
      await expect(repository.save(makeProject())).resolves.toMatchObject({ id: 'preset:modular-bloom' });
      await expect(repository.list()).resolves.toEqual([]);
      await expect(repository.get('preset:modular-bloom')).resolves.toBeNull();
      await expect(repository.remove('x')).resolves.toBeUndefined();
      await expect(repository.clear()).resolves.toBeUndefined();

      setItem.mockRestore();
    });
  });
});
