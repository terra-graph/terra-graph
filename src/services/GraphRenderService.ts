import { Flags } from '@oclif/core';
import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { GraphResolver } from '@terra-graph/core/Graph/GraphResolver.js';
import type { AdapterOperations } from '@terra-graph/core/Graph/Operations/Operations.js';
import type { Profile } from '@terra-graph/core/Graph/Profile.js';
import type { RenderArtifact } from '@terra-graph/core/Graph/Renderer.js';
import type { TgGraph } from '@terra-graph/core/Graph/TgGraph.js';
import { ArtifactTransformer } from '@terra-graph/core/Output/ArtifactTransformer.js';
import { ArtifactTransformerFactory } from '@terra-graph/core/Output/ArtifactTransformerFactory.js';
import { DefaultArtifactTransformerFactory } from '@terra-graph/core/Output/ArtifactTransformerFactory/DefaultArtifactTransformerFactory.js';
import { OclifTransformerFlagParser } from '@terra-graph/core/Output/ArtifactTransformerFactory/OclifTransformerFlagParser.js';
import { RenderPipeline } from '@terra-graph/core/Output/RenderPipeline.js';
import { RuntimeCatalog } from '@terra-graph/core/Runtime/RuntimeCatalog.js';
import { RuntimeConfigLoader } from '@terra-graph/core/Runtime/RuntimeConfigLoader.js';
import { FileRuntimeConfigSource } from '@terra-graph/core/Runtime/RuntimeConfigSource/FileRuntimeConfigSource.js';
import {
  defaultRuntimeCatalog,
  defaultRuntimeProvider,
} from '../config/runtime.js';

export type RenderCommandFlags = {
  verbose: boolean;
  continueOnError: boolean;
  runtimeConfigFile?: string;
  profile?: string;
};

type RenderOutputPlan = {
  rendererName?: string;
  rendererOptions?: Record<string, unknown>;
  transformerNames: string[];
  writerName: string;
  writerOptions?: Record<string, unknown>;
};

type RuntimeRenderOutputConfig = {
  renderer?: string;
  options?: Record<string, unknown>;
  transformers?: string[];
  writer: string;
  writerOptions?: Record<string, unknown>;
};

export const sharedRenderFlags = {
  verbose: Flags.boolean({
    required: false,
    default: false,
    description:
      'Print detailed outoput of each hook and filter applied to the graph',
  }),
  continueOnError: Flags.boolean({
    required: false,
    default: false,
    description:
      'Continue to process graph and attenmpt to generate a diagram even if an error is encountered',
  }),
  runtimeConfigFile: Flags.string({
    required: false,
    description:
      'Runtime config path (.json/.yaml/.yml) used to load profiles/rules/rule sets',
  }),
  profile: Flags.string({
    required: false,
    description:
      'Profile name to resolve from the runtime catalog (overrides runtime config run.profile)',
  }),
};

export const stripTransformerOptionFlags = (argv: string[]): string[] => {
  return new OclifTransformerFlagParser().stripOptionFlags(argv);
};

export type GraphRenderRequest = {
  tgGraph: TgGraph;
  argv: string[];
  flags: RenderCommandFlags;
  log: (message: string) => void;
  fail: (error: Error | string) => never;
};

export class GraphRenderService {
  constructor(
    private readonly pipeline: RenderPipeline = new RenderPipeline(),
    private readonly transformerFactory: ArtifactTransformerFactory = new DefaultArtifactTransformerFactory(),
    private readonly transformerFlagParser = new OclifTransformerFlagParser(),
  ) {}

  public async render(request: GraphRenderRequest): Promise<void> {
    const transformerOptionsByName = this.transformerFlagParser.parse(
      request.argv,
    );

    let catalog: RuntimeCatalog = defaultRuntimeCatalog;
    let runtimeRunProfile: string | undefined;
    let runtimeRunOutputs: RuntimeRenderOutputConfig[] | undefined;

    if (request.flags.runtimeConfigFile) {
      const runtimeConfigLoader = new RuntimeConfigLoader({
        baseProviders: [defaultRuntimeProvider],
      });
      const loaded = await runtimeConfigLoader.load({
        source: new FileRuntimeConfigSource(request.flags.runtimeConfigFile),
      });
      catalog = loaded.catalog;
      runtimeRunProfile = loaded.config.run?.profile;
      runtimeRunOutputs = loaded.config.run?.outputs;
    }

    const profileName = request.flags.profile ?? runtimeRunProfile;
    if (!profileName) {
      request.fail(
        "No profile resolved. Provide '--profile' or set 'run.profile' in the runtime config file.",
      );
    }

    const profile = catalog.resolveProfile(profileName);
    const adapter = this.resolveAdapter(profile, profileName);
    const resolver = new GraphResolver(adapter, {
      errorHandler: this.errorFactory(
        request.flags.continueOnError,
        request.fail,
      ),
      logger: this.loggerFactory(request.flags.verbose, request.log),
    });

    const resolved = resolver.resolve({
      graph: request.tgGraph,
      phases: catalog.resolveProfilePhases(profileName),
    });

    const profileRendererOptions =
      catalog.resolveProfileRendererOptions<Record<string, unknown>>(
        profileName,
      );

    const outputPlans = this.resolveOutputPlans(runtimeRunOutputs);
    const renderedArtifactByRenderer = new Map<string, RenderArtifact>();

    for (const outputPlan of outputPlans) {
      const resolvedRendererName = this.resolveRendererName(
        outputPlan.rendererName,
        profile.resolveRenderer(),
      );
      const rendererOptions = this.resolveRendererOptions(
        profileRendererOptions,
        outputPlan.rendererOptions,
      );
      const renderKey = this.buildRenderKey(
        resolvedRendererName,
        rendererOptions,
      );

      let artifact = renderedArtifactByRenderer.get(renderKey);
      if (!artifact) {
        const renderer = resolvedRendererName
          ? catalog.resolveRenderer(
              resolvedRendererName,
              resolved,
              rendererOptions as Record<string, unknown> | undefined,
            )
          : resolved.getRenderer(
              rendererOptions as Record<string, unknown> | undefined,
            );

        artifact = renderer.render(resolved);
        renderedArtifactByRenderer.set(renderKey, artifact);
      }

      const transformers = this.resolveTransformers(
        outputPlan.transformerNames,
        transformerOptionsByName,
      );

      const writer = catalog.resolveWriter(
        outputPlan.writerName,
        outputPlan.writerOptions,
      );

      await this.pipeline.execute({
        artifact,
        writer,
        write: {},
        transformers,
      });
    }
  }

  private resolveRendererOptions(
    profileOptions?: Record<string, unknown>,
    runtimeRunOptions?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!profileOptions) {
      return runtimeRunOptions;
    }

    if (!runtimeRunOptions) {
      return profileOptions;
    }

    return GraphRenderService.mergeOptions(profileOptions, runtimeRunOptions);
  }

  private static mergeOptions(
    base: Record<string, unknown>,
    override: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      ...base,
    };

    for (const [key, value] of Object.entries(override)) {
      const current = merged[key];
      if (
        GraphRenderService.isObjectRecord(current) &&
        GraphRenderService.isObjectRecord(value)
      ) {
        merged[key] = GraphRenderService.mergeOptions(current, value);
        continue;
      }

      merged[key] = value;
    }

    return merged;
  }

  private static isObjectRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private resolveRendererName(
    explicitRenderer?: string,
    profileRenderer?: string,
  ): string | undefined {
    if (explicitRenderer) {
      return explicitRenderer;
    }
    return profileRenderer;
  }

  private resolveTransformers(
    transformerNames?: string[],
    transformerOptionsByName: Record<
      string,
      Record<string, string | string[]>
    > = {},
  ): ArtifactTransformer[] {
    return (transformerNames ?? []).map((name) =>
      this.transformerFactory.create({
        name,
        options: transformerOptionsByName[name],
      }),
    );
  }

  private resolveOutputPlans(
    runtimeOutputs?: RuntimeRenderOutputConfig[],
  ): RenderOutputPlan[] {
    if (runtimeOutputs && runtimeOutputs.length > 0) {
      return runtimeOutputs.map((output, index) =>
        this.normalizeRuntimeOutputPlan(output, index + 1),
      );
    }

    throw new Error(
      "No output resolved. Define 'run.outputs' in the runtime config file.",
    );
  }

  private normalizeRuntimeOutputPlan(
    output: RuntimeRenderOutputConfig,
    index: number,
  ): RenderOutputPlan {
    const writerName = output.writer.trim();
    if (!writerName) {
      throw new Error(
        `Runtime run.outputs[${index}] must define a non-empty writer.`,
      );
    }

    return {
      rendererName: output.renderer,
      rendererOptions: output.options,
      transformerNames: output.transformers ?? [],
      writerName,
      writerOptions: output.writerOptions,
    };
  }

  private buildRenderKey(
    rendererName: string | undefined,
    rendererOptions: Record<string, unknown> | undefined,
  ): string {
    return `${rendererName ?? '__profile_default__'}|${this.stableStringify(
      rendererOptions ?? {},
    )}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );

    return `{${entries
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`,
      )
      .join(',')}}`;
  }

  private loggerFactory(
    verbose: boolean,
    log: (message: string) => void,
  ): GraphRenderRequest['log'] {
    if (!verbose) {
      return () => {};
    }

    return (message: string) => {
      log(message);
    };
  }

  private errorFactory(
    continueOnError: boolean,
    fail: (error: Error | string) => never,
  ): (error: Error) => void {
    if (!continueOnError) {
      return (error: Error) => {
        fail(error);
      };
    }

    return (error: Error) => {
      console.error(error);
    };
  }

  private resolveAdapter(
    profile: Profile,
    profileName: string,
  ): AdapterOperations {
    if (!profile.supports) {
      return new DotAdapter();
    }

    const AdapterCtor = profile.supports;
    try {
      return new AdapterCtor();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Profile '${profileName}' resolved adapter '${AdapterCtor.name}', but CLI failed to initialize it: ${message}`,
      );
    }
  }
}
