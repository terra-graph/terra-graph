import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Command, Flags } from '@oclif/core';
import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';
import {
  GraphRenderService,
  RenderCommandFlags,
  sharedRenderFlags,
  stripTransformerOptionFlags,
} from '../../services/GraphRenderService.js';

export default class DiagramFromDot extends Command {
  private stdin = '';

  static override strict = false;

  static override description = 'Render a diagram from Terraform DOT input';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --dot-input ./graph.dot --runtimeConfigFile ./my-config.yml',
    'terraform graph | <%= config.bin %> <%= command.id %> --runtimeConfigFile ./my-config.yml --transformer-dotcli-format png',
  ];

  static override flags = {
    ...sharedRenderFlags,
    'dot-input': Flags.string({
      required: false,
      description:
        'Path to a DOT file. If omitted, command reads DOT input from stdin.',
    }),
  };

  protected createRenderService(): GraphRenderService {
    return new GraphRenderService();
  }

  public async init(): Promise<void> {
    this.stdin = await this.readStdin();
  }

  public async run(): Promise<void> {
    const rawArgv = [...this.argv];
    const argv = stripTransformerOptionFlags(rawArgv);
    const { flags } = await this.parse(DiagramFromDot, argv);
    const dot = flags['dot-input']
      ? await readFile(flags['dot-input'], 'utf8')
      : this.stdin;

    const importer = new TerraformDotImporter();
    const tgGraph = importer.fromString(dot);

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
}
