import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  RenderCommandFlags,
  sharedRenderFlags,
  stripTransformerOptionFlags,
} from '../services/GraphRenderService.js';
import { TerraformDiagramService } from '../services/TerraformDiagramService.js';
import { TopologyMetadataBuilder } from '../services/TopologyMetadataBuilder.js';

export default class Topology extends Command {
  static override strict = false;

  static override description =
    'Generate and render a full Terraform topology with optional change evidence';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --runtimeConfigFile ./my-config.yml',
    '<%= config.bin %> <%= command.id %> --terraform-dir ./infra --runtimeConfigFile ./my-config.yml',
    '<%= config.bin %> <%= command.id %> --change-plan-json-file ./plan.json --metadata-environment prod --metadata-source-ref refs/heads/main --metadata-source-commit abc123 --runtimeConfigFile ./my-config.yml',
    '<%= config.bin %> <%= command.id %> --metadata-label team=platform --metadata-label service=payments --runtimeConfigFile ./my-config.yml',
  ];

  static override flags = {
    ...sharedRenderFlags,
    'terraform-dir': Flags.string({
      required: false,
      description:
        'Path to the Terraform project directory (defaults to current working directory)',
    }),
    'change-plan-json-file': Flags.string({
      required: false,
      description:
        'Path to Terraform plan JSON from `terraform show -json`; resource_changes are stored as graph-level change evidence',
    }),
    'metadata-version': Flags.string({
      required: false,
      description: 'Explicit TerraGraph topology version id',
    }),
    'metadata-parent-version': Flags.string({
      required: false,
      description: 'Explicit parent TerraGraph topology version id',
    }),
    'metadata-environment': Flags.string({
      required: false,
      description: 'Deployment environment name for the topology metadata',
    }),
    'metadata-terraform-workspace': Flags.string({
      required: false,
      description: 'Terraform workspace name for the topology metadata',
    }),
    'metadata-source-ref': Flags.string({
      required: false,
      description: 'Source control ref for the topology metadata',
    }),
    'metadata-source-commit': Flags.string({
      required: false,
      description: 'Source control commit for the topology metadata',
    }),
    'metadata-source-repository': Flags.string({
      required: false,
      description: 'Source repository for the topology metadata',
    }),
    'metadata-label': Flags.string({
      required: false,
      multiple: true,
      description:
        'Additional metadata label in key=value format; may be provided multiple times',
    }),
  };

  protected createTerraformDiagramService(): TerraformDiagramService {
    return new TerraformDiagramService();
  }

  protected createMetadataBuilder(): TopologyMetadataBuilder {
    return new TopologyMetadataBuilder();
  }

  public async run(): Promise<void> {
    const rawArgv = [...this.argv];
    const argv = stripTransformerOptionFlags(rawArgv);
    const { flags } = await this.parse(Topology, argv);
    const terraformDir = this.resolveTerraformDir(flags['terraform-dir']);
    const metadata = this.createMetadataBuilder().build({
      version: flags['metadata-version'],
      parentVersion: flags['metadata-parent-version'],
      environment: flags['metadata-environment'],
      terraformWorkspace: flags['metadata-terraform-workspace'],
      sourceRef: flags['metadata-source-ref'],
      sourceCommit: flags['metadata-source-commit'],
      sourceRepository: flags['metadata-source-repository'],
      labels: flags['metadata-label'],
    });
    const changePlanShowJson = flags['change-plan-json-file']
      ? await readFile(flags['change-plan-json-file'], 'utf8')
      : undefined;

    await this.createTerraformDiagramService().run({
      argv: rawArgv,
      flags: flags as unknown as RenderCommandFlags,
      usePlan: true,
      cwd: terraformDir,
      changePlanShowJson,
      metadata,
      skipCleanup: false,
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
