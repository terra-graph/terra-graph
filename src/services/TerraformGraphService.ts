import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TerraformExecutionError,
  TerraformExecutor,
} from './TerraformExecutor.js';

export type TerraformGraphServiceOptions = {
  cwd?: string;
  skipCleanup?: boolean;
  warn?: (message: string) => void;
};

export type TerraformDiagramRunInput = {
  cwd?: string;
  planFile?: string;
  skipCleanup: boolean;
  warn: (message: string) => void;
};

export type TerraformDiagramRunResult = {
  dot: string;
  planShowJson?: string;
};

export class TerraformGraphService {
  constructor(
    private readonly executor: TerraformExecutor = new TerraformExecutor(),
    private readonly removePath: (path: string) => void = (path: string) => {
      rmSync(path, {
        force: true,
        recursive: true,
      });
    },
    private readonly makeTempDir: (prefix: string) => string = (
      prefix: string,
    ) => mkdtempSync(prefix),
  ) {}

  public runDotOnly(options: TerraformGraphServiceOptions = {}): string {
    const session = this.createSession();

    try {
      const env = this.buildTerraformEnv(session.tfDataDir);
      this.executor.execute(
        ['init', '-backend=false', '-input=false'],
        options.cwd,
        env,
      );
      return this.executor.execute(['graph'], options.cwd, env);
    } finally {
      if (!options.skipCleanup) {
        this.removePath(session.sessionDir);
      } else {
        options.warn?.(
          `Terraform temporary workspace retained: ${session.sessionDir}`,
        );
      }
    }
  }

  public runDiagram(
    input: TerraformDiagramRunInput,
  ): TerraformDiagramRunResult {
    const session = this.createSession(input.planFile);
    const env = this.buildTerraformEnv(session.tfDataDir);
    this.executor.execute(
      ['init', '-backend=false', '-input=false'],
      input.cwd,
      env,
    );

    try {
      this.executor.execute(
        [
          'plan',
          '-refresh=false',
          '-lock=false',
          '-input=false',
          `-out=${session.planFile}`,
        ],
        input.cwd,
        env,
      );

      const dot = this.executor.execute(
        ['graph', `-plan=${session.planFile}`],
        input.cwd,
        env,
      );
      const planShowJson = this.executor.execute(
        ['show', '-json', session.planFile],
        input.cwd,
        env,
      );

      return {
        dot,
        planShowJson,
      };
    } catch (error) {
      const message =
        error instanceof TerraformExecutionError
          ? error.message
          : String(error);
      input.warn(
        `Plan-based Terraform diagram flow failed and will fall back to plain 'terraform graph': ${message}`,
      );

      return {
        dot: this.executor.execute(['graph'], input.cwd, env),
      };
    } finally {
      if (!input.skipCleanup) {
        if (session.removePlanFileOnCleanup) {
          this.removePath(session.planFile);
        }
        this.removePath(session.sessionDir);
      } else {
        input.warn(
          `Terraform temporary workspace retained: ${session.sessionDir}`,
        );
        if (session.removePlanFileOnCleanup) {
          input.warn(`Terraform plan artifact retained: ${session.planFile}`);
        }
      }
    }
  }

  private createSession(explicitPlanFile?: string): {
    sessionDir: string;
    tfDataDir: string;
    planFile: string;
    removePlanFileOnCleanup: boolean;
  } {
    const sessionDir = this.makeTempDir(join(tmpdir(), 'terra-graph-'));
    return {
      sessionDir,
      tfDataDir: join(sessionDir, 'tf-data'),
      planFile: explicitPlanFile ?? join(sessionDir, 'terra-graph.tfplan'),
      removePlanFileOnCleanup: explicitPlanFile !== undefined,
    };
  }

  private buildTerraformEnv(tfDataDir: string): NodeJS.ProcessEnv {
    return {
      TF_DATA_DIR: tfDataDir,
    };
  }
}
