import { Profile } from '@terra-graph/core/Graph/Profile.js';

export const overviewCore = new Profile('overview.core', {
  phases: [
    {
      phase: 'pre',
      rules: [
        { namedRule: 'remove.tfconfig' },
        { namedRule: 'reconnect.time_sleep' },
        { namedRule: 'remove.childless_modules' },
      ],
    },
  ],
});
