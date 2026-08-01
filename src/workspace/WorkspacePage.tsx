import { NotFoundPage } from '@/pages/NotFoundPage';
import { getPreset } from '@/presets/presets';

interface Props {
  readonly presetId: string;
  /** Compressed shared state from the `?s=` parameter, if the link carried one. */
  readonly sharedState: string | null;
}

export function WorkspacePage({ presetId }: Props) {
  const preset = getPreset(presetId);

  if (preset === undefined) {
    return <NotFoundPage what={`There is no artwork called “${presetId}”.`} />;
  }

  return <h1>{preset.title}</h1>;
}
