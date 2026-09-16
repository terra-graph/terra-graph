import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';
import type { TgGraph } from '@terra-graph/core/Graph/TgGraph.js';
import {
  GraphRenderService,
  RenderCommandFlags,
} from './GraphRenderService.js';
import {
  TerraformDiagramRunResult,
  TerraformGraphService,
} from './TerraformGraphService.js';
import type { TgGraphMetadata } from './TopologyMetadataBuilder.js';

type TerraformPlanDecorator = {
  decorate(graph: Readonly<TgGraph>, input: string): TgGraph;
};

type TerraformPlanDecoratorFactory = () => Promise<TerraformPlanDecorator>;
type TerraformPlanChangesDecoratorFactory =
  () => Promise<TerraformPlanDecorator>;

export type TerraformDiagramServiceRequest = {
  argv: string[];
  flags: RenderCommandFlags;
  usePlan: boolean;
  cwd?: string;
  planFile?: string;
  changePlanShowJson?: string;
  metadata?: TgGraphMetadata;
  skipCleanup: boolean;
  log: (message: string) => void;
  warn: (message: string) => void;
  fail: (error: Error | string) => never;
};

export class TerraformDiagramService {
  constructor(
    private readonly importer = new TerraformDotImporter(),
    private readonly renderService = new GraphRenderService(),
    private readonly terraformGraphService = new TerraformGraphService(),
    private readonly createPlanDecorator: TerraformPlanDecoratorFactory = async () => {
      const modulePath =
        '@terra-graph/core/Graph/Decorators/TfPlanDecorator.js';
      const loaded = (await import(modulePath)) as {
        TfPlanDecorator?: new () => TerraformPlanDecorator;
      };

      if (!loaded.TfPlanDecorator) {
        throw new Error(
          `Core module '${modulePath}' did not export TfPlanDecorator`,
        );
      }

      return new loaded.TfPlanDecorator();
    },
    private readonly createPlanChangesDecorator: TerraformPlanChangesDecoratorFactory = async () => {
      const modulePath =
        '@terra-graph/core/Graph/Decorators/TfPlanChangesDecorator.js';
      const loaded = (await import(modulePath)) as {
        TfPlanChangesDecorator?: new () => TerraformPlanDecorator;
      };

      if (!loaded.TfPlanChangesDecorator) {
        throw new Error(
          `Core module '${modulePath}' did not export TfPlanChangesDecorator`,
        );
      }

      return new loaded.TfPlanChangesDecorator();
    },
  ) {}

  public async run(request: TerraformDiagramServiceRequest): Promise<void> {
    const result = request.usePlan
      ? this.terraformGraphService.runDiagram({
          cwd: request.cwd,
          planFile: request.planFile,
          skipCleanup: request.skipCleanup,
          warn: request.warn,
        })
      : {
          dot: this.terraformGraphService.runDotOnly({
            cwd: request.cwd,
            skipCleanup: request.skipCleanup,
            warn: request.warn,
          }),
        };

    const tgGraph = await this.decorateGraph(
      result,
      request.changePlanShowJson,
      request.warn,
    );
    await this.renderService.render({
      tgGraph,
      argv: request.argv,
      flags: request.flags,
      metadata: request.metadata,
      log: request.log,
      fail: request.fail,
    });
  }

  private async decorateGraph(
    result: TerraformDiagramRunResult,
    changePlanShowJson: string | undefined,
    warn: (message: string) => void,
  ): Promise<TgGraph> {
    const tgGraph = this.importer.fromString(result.dot);
    return this.decorateImportedGraph(
      tgGraph,
      result.planShowJson,
      warn,
      changePlanShowJson,
    );
  }

  public async decorateImportedGraph(
    tgGraph: TgGraph,
    planShowJson: string | undefined,
    warn: (message: string) => void,
    changePlanShowJson?: string,
  ): Promise<TgGraph> {
    let decoratedGraph = tgGraph;

    if (planShowJson) {
      try {
        const decorator = await this.createPlanDecorator();
        decoratedGraph = decorator.decorate(decoratedGraph, planShowJson);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(
          `Terraform plan output could not be applied as node decoration; continuing with DOT-only graph: ${message}`,
        );
      }
    }

    if (!changePlanShowJson) {
      return decoratedGraph;
    }

    try {
      const decorator = await this.createPlanChangesDecorator();
      return decorator.decorate(decoratedGraph, changePlanShowJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(
        `Terraform change plan output could not be applied as graph change evidence; continuing without change evidence: ${message}`,
      );
      return decoratedGraph;
    }
  }
}
