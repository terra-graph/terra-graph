import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  RenderCommandFlags,
  sharedRenderFlags,
  stripTransformerOptionFlags,
} from '../services/GraphRenderService.js';
import { TerraformDiagramService } from '../services/TerraformDiagramService.js';

export default class Diagram extends Command {
  static override strict = false;

  static override description =
    'Generate and render a Terraform diagram in one command';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --profile my-profile --output "renderer=dot;outWriter=file;outFile=./diagram.dot"',
    '<%= config.bin %> <%= command.id %> --terraform-dir ./infra --profile my-profile --output "renderer=dot;transformers=dotcli;outWriter=file;outFile=./diagram.png" --transformer-dotcli-format png',
    '<%= config.bin %> <%= command.id %> --no-plan --profile my-profile --output "renderer=json;outWriter=file;outFile=./tggraph.json"',
    '<%= config.bin %> <%= command.id %> --runtimeConfigFile ./my-config.yml --output "renderer=dot;outWriter=file;outFile=./diagram.dot"',
    '<%= config.bin %> <%= command.id %> --plan-file ./my-debug.tfplan --skip-cleanup --output "renderer=dot;outWriter=file;outFile=./diagram.dot"',
  ];

  static override flags = {
    ...sharedRenderFlags,
    'no-plan': Flags.boolean({
      required: false,
      default: false,
      description:
        'Skip plan/show decoration and render from terraform graph only',
    }),
    'graph-only': Flags.boolean({
      required: false,
      default: false,
      description: "Alias for '--no-plan'",
    }),
    'terraform-dir': Flags.string({
      required: false,
      description:
        'Path to the Terraform project directory (defaults to current working directory)',
    }),
    'plan-file': Flags.string({
      required: false,
      description:
        'Optional custom path for Terraform plan artifact; defaults to an OS temp location',
    }),
    'skip-cleanup': Flags.boolean({
      required: false,
      default: false,
      description: 'Keep generated Terraform temp workspace after execution',
    }),
  };

  protected createTerraformDiagramService(): TerraformDiagramService {
    return new TerraformDiagramService();
  }

  public async run(): Promise<void> {
    const rawArgv = [...this.argv];
    const argv = stripTransformerOptionFlags(rawArgv);
    const { flags } = await this.parse(Diagram, argv);
    const terraformDir = this.resolveTerraformDir(flags['terraform-dir']);

    const usePlan = !(flags['no-plan'] || flags['graph-only']);
    await this.createTerraformDiagramService().run({
      argv: rawArgv,
      flags: flags as unknown as RenderCommandFlags,
      usePlan,
      cwd: terraformDir,
      planFile: flags['plan-file'],
      skipCleanup: flags['skip-cleanup'],
      log: (message) => this.log(message),
      warn: (message) => this.warn(message),
      fail: (error) => this.error(error),
    });
  }

  private resolveTerraformDir(terraformDir?: string): string {
    const target = resolve(terraformDir ?? process.cwd());

    try {
      if (!statSync(target).isDirectory()) {
        this.error(`'${target}' is not a directory.`);
      }
    } catch {
      this.error(`Terraform directory does not exist: '${target}'.`);
    }

    return target;
  }
}
