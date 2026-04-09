import { createInterface } from 'node:readline';
import { Command, Flags } from '@oclif/core';
import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { GraphResolver } from '@terra-graph/core/Graph/GraphResolver.js';
import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';
import type { AdapterOperations } from '@terra-graph/core/Graph/Operations/Operations.js';
import type { Profile } from '@terra-graph/core/Graph/Profile.js';
import { ArtifactTransformer } from '@terra-graph/core/Output/ArtifactTransformer.js';
import { ArtifactTransformerFactory } from '@terra-graph/core/Output/ArtifactTransformerFactory.js';
import { DefaultArtifactTransformerFactory } from '@terra-graph/core/Output/ArtifactTransformerFactory/DefaultArtifactTransformerFactory.js';
import { OclifTransformerFlagParser } from '@terra-graph/core/Output/ArtifactTransformerFactory/OclifTransformerFlagParser.js';
import {
  ArtifactWriteInput,
  ArtifactWriter,
} from '@terra-graph/core/Output/ArtifactWriter.js';
import { FileArtifactWriter } from '@terra-graph/core/Output/ArtifactWriter/FileArtifactWriter.js';
import { StdoutArtifactWriter } from '@terra-graph/core/Output/ArtifactWriter/StdoutArtifactWriter.js';
import { RenderPipeline } from '@terra-graph/core/Output/RenderPipeline.js';
import { RuntimeCatalog } from '@terra-graph/core/Runtime/RuntimeCatalog.js';
import { RuntimeConfigLoader } from '@terra-graph/core/Runtime/RuntimeConfigLoader.js';
import { FileRuntimeConfigSource } from '@terra-graph/core/Runtime/RuntimeConfigSource/FileRuntimeConfigSource.js';
import { defaultRendererRegistry } from '../config/renderers.js';
import {
  defaultRuntimeCatalog,
  defaultRuntimeProvider,
} from '../config/runtime.js';

type OutputWriterMode = 'stdout' | 'file';

export default class Create extends Command {
  private stdin = '';
  private readonly pipeline = new RenderPipeline();
  private readonly transformerFactory: ArtifactTransformerFactory =
    new DefaultArtifactTransformerFactory();
  private readonly transformerFlagParser = new OclifTransformerFlagParser();

  static override strict = false;

  static override description =
    'Create a diagram from the piped output of `terraform graph`';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --runtimeConfigFile ./src/config/runtime.default.yaml',
    '<%= config.bin %> <%= command.id %> --profile edf.aws.dot',
    '<%= config.bin %> <%= command.id %> --profile edf.aws.dot --transformer dotcli --transformer-dotcli-format svg',
    '<%= config.bin %> <%= command.id %> --profile edf.aws.dot --transformer dotcli --transformer-dotcli-format png --transformer-dotcli-Gdpi 200',
    '<%= config.bin %> <%= command.id %> --profile edf.aws.dot --transformer dotcli --transformer-dotcli-format png --outWriter file --outFile ./test-graph/sequencer.png',
  ];

  static override flags = {
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
    transformer: Flags.string({
      required: false,
      multiple: true,
      description:
        "Transformer id to apply after render (repeatable). Options use '--transformer-<id>-<option>=<value>'.",
    }),
    renderer: Flags.string({
      required: false,
      description:
        'Renderer id to use (overrides profile and runtime config render settings)',
    }),
    outWriter: Flags.string({
      required: false,
      default: 'stdout',
      options: ['stdout', 'file'],
      description: 'Output destination writer (stdout or file)',
    }),
    outFile: Flags.string({
      required: false,
      description: "Target file path used when '--outWriter=file' is selected",
    }),
  };

  async init() {
    const readStdin = async () => {
      let data = '';
      const rl = createInterface({
        input: process.stdin,
      });

      for await (const line of rl) {
        data += `${line}\n`;
      }
      return data;
    };
    this.stdin = await readStdin();
  }

  public async run(): Promise<void> {
    const transformerOptionsByName = this.transformerFlagParser.parse(
      this.argv,
    );
    const argv = this.transformerFlagParser.stripOptionFlags(this.argv);
    const { flags } = await this.parse(Create, argv);

    const imoprter = new TerraformDotImporter();
    const tgGraph = imoprter.fromString(this.stdin);

    let catalog: RuntimeCatalog = defaultRuntimeCatalog;
    let runtimeRunProfile: string | undefined;
    let runtimeRunRenderOptions: Record<string, unknown> | undefined;
    let runtimeRunRenderer: string | undefined;
    if (flags.runtimeConfigFile) {
      const runtimeConfigLoader = new RuntimeConfigLoader({
        baseProviders: [defaultRuntimeProvider],
      });
      const loaded = await runtimeConfigLoader.load({
        source: new FileRuntimeConfigSource(flags.runtimeConfigFile),
      });
      catalog = loaded.catalog;
      runtimeRunProfile = loaded.config.run?.profile;
      runtimeRunRenderer = loaded.config.run?.render?.renderer;
      runtimeRunRenderOptions = loaded.config.run?.render?.options;
    }

    const profileName = flags.profile ?? runtimeRunProfile;
    if (!profileName) {
      this.error(
        "No profile resolved. Provide '--profile' or set 'run.profile' in the runtime config file.",
      );
    }

    const profile = catalog.resolveProfile(profileName);
    const adapter = this.resolveAdapter(profile, profileName);
    const resolver = new GraphResolver(adapter, {
      errorHandler: this.errorFactory(flags.continueOnError),
      logger: this.loggerFactory(flags.verbose),
    });

    const resolved = resolver.resolve({
      graph: tgGraph,
      phases: catalog.resolveProfilePhases(profileName),
    });
    // console.log(JSON.stringify(resolved.toTgGraph()));

    // yarn build:nolint && cat ../terra-graph-test-project/test-graph/sequencer.dot | node ./bin/run.js create --runtimeConfigFile ../terra-graph-test-project/edf.yml --transformer dotcli --transformer-dotcli-format png --outWriter file --outFile ../terra-graph-test-project/test-graph/sequencer.png > ../terra-graph-test-project/test-graph/processed.json
    // cat ./test-graph/sequencer.dot | node ./bin/run.js create \
    // --runtimeConfigFile=../terra-graph-test-project/edf.yml
    // --outputWriter=file \
    // --outFile=../terra-graph-ui/public/graphs/latest.json
    // yarn build:nolint && cat ../terra-graph-test-project/test-graph/sequencer.dot | node ./bin/run.js create --runtimeConfigFile ../terra-graph-test-project/edf.yml --outWriter file --outFile ../terra-graph-ui/public/graphs/latest.json
    // yarn build:nolint && cat ../terra-graph-test-project/test-graph/sdlc-metrics.dot | node ./bin/run.js create --runtimeConfigFile ../terra-graph-test-project/edf.yml --outWriter file --outFile ../terra-graph-ui/public/graphs/latest-sdlc-metrics.json

    // yarn build:nolint && cat ../../../terra-graph-test-project/test-graph/sdlc-metrics.dot | node ./bin/run.js create --runtimeConfigFile ../../../terra-graph-test-project/edf.yml --transformer dotcli --transformer-dotcli-format png --outWriter file --outFile ../../../terra-graph-test-project/test-graph/sdlc-metrics.png
    const rendererOptions = this.resolveRendererOptions(
      catalog.resolveProfileRendererOptions<Record<string, unknown>>(
        profileName,
      ),
      runtimeRunRenderOptions,
    );

    const rendererName = this.resolveRendererName(
      this.resolveOptionalStringFlag(flags.renderer),
      runtimeRunRenderer,
      profile.resolveRenderer(),
    );
    const renderer = rendererName
      ? defaultRendererRegistry.resolve(rendererName, resolved, rendererOptions)
      : resolved.getRenderer(rendererOptions);
    const artifact = renderer.render(resolved);
    const transformerNames = this.resolveStringArrayFlag(flags.transformer);
    let transformers: ArtifactTransformer[] = [];
    if (transformerNames.length > 0) {
      transformers = this.resolveTransformers(
        transformerNames,
        transformerOptionsByName,
      );
    }

    const outputWriter = this.resolveOutputWriterMode(flags.outWriter);
    const output = this.resolveOutputWriter(
      outputWriter,
      this.resolveOptionalStringFlag(flags.outFile),
    );

    await this.pipeline.execute({
      artifact,
      writer: output.writer,
      write: output.write,
      transformers,
    });

    // TODO: create proper default catalog stuff (excluding aws)
    // TODO: move this experimental.ts to new proper command (or old create.ts)
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

    return Create.mergeOptions(profileOptions, runtimeRunOptions);
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
      if (Create.isObjectRecord(current) && Create.isObjectRecord(value)) {
        merged[key] = Create.mergeOptions(current, value);
        continue;
      }

      merged[key] = value;
    }

    return merged;
  }

  private resolveRendererName(
    cliRenderer?: string,
    runtimeRenderer?: string,
    profileRenderer?: string,
  ): string | undefined {
    if (cliRenderer) {
      return cliRenderer;
    }
    if (runtimeRenderer) {
      return runtimeRenderer;
    }
    return profileRenderer;
  }

  private static isObjectRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

  private resolveOutputWriterMode(value: unknown): OutputWriterMode {
    if (value === 'stdout' || value === 'file') {
      return value;
    }

    this.error(
      "Invalid '--outWriter' value. Allowed values are 'stdout' and 'file'.",
    );
  }

  private resolveStringArrayFlag(value: unknown): string[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
      return [value];
    }

    return [];
  }

  private resolveOptionalStringFlag(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    return undefined;
  }

  private resolveOutputWriter(
    outputWriter: OutputWriterMode,
    outFile?: string,
  ): {
    writer: ArtifactWriter;
    write: Omit<ArtifactWriteInput, 'artifact'>;
  } {
    if (outputWriter === 'file') {
      if (!outFile) {
        this.error(
          "Missing '--outFile'. Provide a file path when '--outWriter=file' is used.",
        );
      }

      return {
        writer: new FileArtifactWriter(),
        write: {
          target: outFile,
        },
      };
    }

    return {
      writer: new StdoutArtifactWriter(),
      write: {},
    };
  }

  private loggerFactory(verbose: boolean): Command['log'] {
    const logger = (message: string) => {
      this.log(message);
    };
    if (verbose) {
      return logger;
    }
    return () => {};
  }

  private errorFactory(continueOnError: boolean): Command['error'] {
    const errorHandler = (error: Error) => {
      this.error(error);
    };
    if (!continueOnError) {
      return errorHandler;
    }
    return ((error: Error) => {
      console.error(error);
    }) as Create['error'];
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
