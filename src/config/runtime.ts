import '@terra-graph/core/Graph/Rules/registerAll.js';
import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { GraphologyAdapter } from '@terra-graph/core/Graph/Adapters/GraphologyAdapter.js';
import { RuntimeCatalog } from '@terra-graph/core/Runtime/RuntimeCatalog.js';
import { RuntimeProvider } from '@terra-graph/core/Runtime/RuntimeProvider.js';

export const defaultRuntimeCatalog = RuntimeCatalog.from([]);

export const defaultRuntimeProvider: RuntimeProvider = {
  supportedAdapterOperationsRegistry: {
    DotAdapter,
    GraphologyAdapter,
  },
};
