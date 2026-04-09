import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { Profile } from '@terra-graph/core/Graph/Profile.js';
import { DotRendererOptions } from '@terra-graph/core/Graph/Renderers/DotRenderer.js';

export const baseDotProfile = new Profile<DotRendererOptions>('overview.dot', {
  supports: DotAdapter,
  render: {
    options: {
      graph: {
        rankdir: 'LR',
        ranksep: 2.5,
        nodesep: 0.6,
        pad: 1,
      },
    },
  },
  phases: [
    {
      phase: 'normalize',
      rules: [{ namedRule: 'dot.normalise_modules' }],
    },
  ],
});
