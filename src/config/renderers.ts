import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { AdapterOperations } from '@terra-graph/core/Graph/Operations/Operations.js';
import type { Renderer } from '@terra-graph/core/Graph/Renderer.js';
import {
  DotRenderer,
  DotRendererOptions,
} from '@terra-graph/core/Graph/Renderers/DotRenderer.js';
import { JsonRenderer } from '@terra-graph/core/Graph/Renderers/JsonRenderer.js';
import { RendererRegistry } from '@terra-graph/core/Graph/Renderers/RendererRegistry.js';
// import { UiJsonRenderer } from '@terra-graph/core/Graph/Renderers/UiJsonRenderer.js';

export const defaultRendererRegistry = new RendererRegistry({
  dot: ({ adapter, options }) => {
    if (!(adapter instanceof DotAdapter)) {
      throw new Error("Renderer 'dot' requires DotAdapter");
    }
    return new DotRenderer(
      options as DotRendererOptions,
    ) as Renderer<AdapterOperations>;
  },
  json: () => new JsonRenderer<AdapterOperations>(),
  // 'ui-json': () => new UiJsonRenderer<AdapterOperations>(),
});
