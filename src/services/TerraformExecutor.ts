import { execFileSync } from 'node:child_process';

export class TerraformExecutionError extends Error {
  constructor(
    public readonly args: string[],
    public readonly stderr: string,
    public readonly stdout: string,
  ) {
    super(
      `terraform ${args.join(' ')} failed${stderr ? `: ${stderr.trim()}` : ''}`,
    );
  }
}

export type TerraformExecFn = (
  file: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding: 'utf8';
    stdio: ['ignore', 'pipe', 'pipe'];
  },
) => string;

export class TerraformExecutor {
  constructor(private readonly execFn: TerraformExecFn = execFileSync) {}

  public execute(
    args: string[],
    cwd = process.cwd(),
    env?: NodeJS.ProcessEnv,
  ): string {
    try {
      return this.execFn('terraform', args, {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const stderr = this.resolveStream(error, 'stderr');
      const stdout = this.resolveStream(error, 'stdout');
      throw new TerraformExecutionError(args, stderr, stdout);
    }
  }

  private resolveStream(error: unknown, stream: 'stderr' | 'stdout'): string {
    if (
      error &&
      typeof error === 'object' &&
      stream in error &&
      typeof (error as Record<string, unknown>)[stream] === 'string'
    ) {
      return (error as Record<string, string>)[stream];
    }

    return '';
  }
}
