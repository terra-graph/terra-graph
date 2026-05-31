import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Command, Flags } from '@oclif/core';
import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';
import {
  GraphRenderService,
  RenderCommandFlags,
  sharedRenderFlags,
  stripTransformerOptionFlags,
} from '../../services/GraphRenderService.js';
import { TerraformDiagramService } from '../../services/TerraformDiagramService.js';
import {
  TerraformExecutionError,
  TerraformExecutor,
} from '../../services/TerraformExecutor.js';

export default class DiagramFromDot extends Command {
  static override strict = false;

  static override description = 'Render a diagram from Terraform DOT input';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --dot-input ./graph.dot --runtimeConfigFile ./my-config.yml',
    '<%= config.bin %> <%= command.id %> --dot-input ./graph.dot --plan-file ./plan.tfplan --runtimeConfigFile ./my-config.yml',
    '<%= config.bin %> <%= command.id %> --dot-input ./graph.dot --plan-json-file ./plan.json --runtimeConfigFile ./my-config.yml',
    'terraform graph | <%= config.bin %> <%= command.id %> --runtimeConfigFile ./my-config.yml --transformer-dotcli-format png',
  ];

  static override flags = {
    ...sharedRenderFlags,
    'dot-input': Flags.string({
      required: false,
      description:
        'Path to a DOT file. If omitted, command reads DOT input from stdin.',
    }),
    'plan-file': Flags.string({
      required: false,
      description:
        'Optional path to a Terraform plan artifact (.tfplan). When provided, the command runs `terraform show -json` and applies plan-based decoration to the imported DOT graph.',
    }),
    'plan-json-file': Flags.string({
      required: false,
      description:
        'Optional path to pre-generated Terraform plan JSON from `terraform show -json`. When provided, the command applies plan-based decoration directly without invoking Terraform.',
    }),
  };

  protected createRenderService(): GraphRenderService {
    return new GraphRenderService();
  }

  protected createTerraformExecutor(): TerraformExecutor {
    return new TerraformExecutor();
  }

  protected createTerraformDiagramService(): TerraformDiagramService {
    return new TerraformDiagramService();
  }

  public async run(): Promise<void> {
    const rawArgv = [...this.argv];
    const argv = stripTransformerOptionFlags(rawArgv);
    const { flags } = await this.parse(DiagramFromDot, argv);
    if (flags['plan-file'] && flags['plan-json-file']) {
      this.error('Specify only one of --plan-file or --plan-json-file.');
    }

    const dot = flags['dot-input']
      ? await readFile(flags['dot-input'], 'utf8')
      : await this.readStdin();
    const planShowJson = flags['plan-json-file']
      ? await readFile(flags['plan-json-file'], 'utf8')
      : flags['plan-file']
        ? this.loadPlanShowJson(flags['plan-file'])
        : undefined;

    const importer = new TerraformDotImporter();
    const importedGraph = importer.fromString(dot);
    const tgGraph =
      await this.createTerraformDiagramService().decorateImportedGraph(
        importedGraph,
        planShowJson,
        (message) => this.warn(message),
      );

    await this.createRenderService().render({
      tgGraph,
      argv: rawArgv,
      flags: flags as unknown as RenderCommandFlags,
      log: (message) => this.log(message),
      fail: (error) => this.error(error),
    });
  }

  private async readStdin(): Promise<string> {
    let data = '';
    const rl = createInterface({
      input: process.stdin,
    });

    for await (const line of rl) {
      data += `${line}\n`;
    }

    return data;
  }

  private loadPlanShowJson(planFile: string): string {
    const resolvedPlanFile = resolve(planFile);

    try {
      return this.createTerraformExecutor().execute(
        ['show', '-json', resolvedPlanFile],
        dirname(resolvedPlanFile),
      );
    } catch (error) {
      if (error instanceof TerraformExecutionError) {
        this.error(error.message);
      }

      throw error;
    }
  }
}
