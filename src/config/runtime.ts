import '@terra-graph/core/Graph/Rules/registerAll.js';
import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { GraphologyAdapter } from '@terra-graph/core/Graph/Adapters/GraphologyAdapter.js';
// import { UiAdapter } from '@terra-graph/core/Graph/Adapters/UiAdapter.js';
import { ProfileRegistry } from '@terra-graph/core/Graph/ProfileRegistry.js';
import { NamedRuleRegistry } from '@terra-graph/core/Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '@terra-graph/core/Graph/Rules/NamedRuleSetRegistry.js';
import { RuntimeCatalog } from '@terra-graph/core/Runtime/RuntimeCatalog.js';
import { RuntimeProvider } from '@terra-graph/core/Runtime/RuntimeProvider.js';
import { overviewCore } from './profiles/base.js';
import { baseDotProfile } from './profiles/dot/base.js';
import { namedRules } from './rules.js';

export const defaultRuntimeCatalog = RuntimeCatalog.from([
  { namedRules: NamedRuleRegistry.from([namedRules]) },
  {
    namedRuleSets: NamedRuleSetRegistry.from([
      // namedRuleSets,
    ]),
  },
  {
    profiles: new ProfileRegistry({
      [overviewCore.name]: overviewCore,
      [baseDotProfile.name]: baseDotProfile,
    }),
  },
]);

export const defaultRuntimeProvider: RuntimeProvider = {
  namedRules: defaultRuntimeCatalog.namedRules,
  namedRuleSets: defaultRuntimeCatalog.namedRuleSets,
  profiles: defaultRuntimeCatalog.profiles,
  plugins: defaultRuntimeCatalog.plugins,
  supportedAdapterOperationsRegistry: {
    DotAdapter,
    GraphologyAdapter,
    // UiAdapter,
  },
};
