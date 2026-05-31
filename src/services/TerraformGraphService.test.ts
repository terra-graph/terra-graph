import { TerraformExecutionError } from './TerraformExecutor.js';
import {
  TerraformDiagramRunInput,
  TerraformGraphService,
} from './TerraformGraphService.js';

const buildMissingVariableStderr = (variableName: string): string => {
  return `Error: No value for required variable

The root module input variable "${variableName}" is not set, and has no default value.
Use a -var or -var-file command line argument to provide a value for this
variable.
`;
};

const buildWrappedMissingVariableStderr = (
  ...variableNames: string[]
): string => {
  return variableNames
    .map(
      (variableName) => `Error: No value for required variable

\u2502 The root module input variable "${variableName}" is
\u2502 not set, and has no default value. Use a -var or -var-file command line
\u2502 argument to provide a value for this variable.
`,
    )
    .join('\n');
};

const buildService = (
  execute: jest.Mock,
  overrides: {
    readDirectory?: jest.Mock;
    readFile?: jest.Mock;
  } = {},
) => {
  const removePath = jest.fn();
  const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
  const copyPath = jest.fn();
  const writeFile = jest.fn();
  const readDirectory =
    overrides.readDirectory ?? jest.fn().mockReturnValue([]);
  const readFile = overrides.readFile ?? jest.fn();
  const service = new TerraformGraphService(
    {
      execute,
    } as never,
    removePath,
    makeTempDir,
    copyPath,
    writeFile,
    readFile,
    readDirectory,
  );

  return {
    service,
    removePath,
    makeTempDir,
    copyPath,
    writeFile,
    readDirectory,
    readFile,
  };
};

const buildInput = (
  overrides: Partial<TerraformDiagramRunInput> = {},
): TerraformDiagramRunInput => {
  return {
    cwd: '/tmp',
    planFile: undefined,
    skipCleanup: false,
    warn: jest.fn(),
    ...overrides,
  };
};

describe('TerraformGraphService.runDotOnly', () => {
  it('copies Terraform into a temp workspace, reconfigures backend, and runs terraform graph', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph {}');
    const { service, removePath, makeTempDir, copyPath, writeFile } =
      buildService(execute);

    const dot = service.runDotOnly({ cwd: '/tmp' });

    expect(dot).toBe('digraph {}');
    expect(makeTempDir).toHaveBeenCalledTimes(1);
    expect(copyPath).toHaveBeenCalledWith(
      '/tmp',
      '/tmp/terra-graph-session/workspace',
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/terra-graph-session/workspace/terra-graph_override.tf',
      expect.stringContaining('backend "local"'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/terra-graph-session/workspace/terra-graph_override.tf',
      expect.stringContaining('terra-graph.tfstate'),
    );
    expect(execute).toHaveBeenNthCalledWith(
      1,
      ['init', '-reconfigure', '-input=false'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      ['graph'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenCalledWith('/tmp/terra-graph-session');
  });
});

describe('TerraformGraphService.runDiagram', () => {
  it('copies Terraform into a temp workspace and runs init, plan, graph -plan and show -json in order', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const warn = jest.fn();
    const { service, removePath, copyPath, writeFile } = buildService(execute);

    const result = service.runDiagram(
      buildInput({
        warn,
      }),
    );

    expect(result).toEqual({
      dot: 'digraph { planned }',
      planShowJson: '{"planned_values":{"root_module":{"resources":[]}}}',
    });
    expect(copyPath).toHaveBeenCalledWith(
      '/tmp',
      '/tmp/terra-graph-session/workspace',
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/terra-graph-session/workspace/terra-graph_override.tf',
      expect.any(String),
    );
    expect(execute).toHaveBeenNthCalledWith(
      1,
      ['init', '-reconfigure', '-input=false'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/terra-graph-session/terra-graph.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      ['graph', '-plan=/tmp/terra-graph-session/terra-graph.tfplan'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      4,
      ['show', '-json', '/tmp/terra-graph-session/terra-graph.tfplan'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenCalledTimes(1);
    expect(removePath).toHaveBeenCalledWith('/tmp/terra-graph-session');
    expect(warn).not.toHaveBeenCalled();
  });

  it('auto-generates placeholder tfvars in the temp workspace and retries plan when variables are missing', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new TerraformExecutionError(
          ['plan'],
          buildMissingVariableStderr('name'),
          '',
        );
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const warn = jest.fn();
    const readDirectory = jest.fn().mockReturnValue(['variables.tf']);
    const readFile = jest
      .fn()
      .mockReturnValue('variable "name" {\n  type = string\n}\n');
    const { service, writeFile } = buildService(execute, {
      readDirectory,
      readFile,
    });

    const result = service.runDiagram(
      buildInput({
        warn,
      }),
    );

    expect(result).toEqual({
      dot: 'digraph { planned }',
      planShowJson: '{"planned_values":{"root_module":{"resources":[]}}}',
    });
    expect(execute).toHaveBeenNthCalledWith(
      2,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/terra-graph-session/terra-graph.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/terra-graph-session/terra-graph.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/tmp/terra-graph-session/workspace/terra-graph.auto.tfvars.json',
      '{\n  "name": ""\n}\n',
    );
    expect(readDirectory).toHaveBeenCalledWith(
      '/tmp/terra-graph-session/workspace',
    );
    expect(readFile).toHaveBeenCalledWith(
      '/tmp/terra-graph-session/workspace/variables.tf',
    );
    expect(warn).toHaveBeenCalledWith(
      'Terraform variables were not set; generated placeholder values in temporary workspace for: name',
    );
  });

  it('keeps retrying plan when later Terraform runs surface additional wrapped missing variables', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new TerraformExecutionError(
          ['plan'],
          buildMissingVariableStderr('name'),
          '',
        );
      })
      .mockImplementationOnce(() => {
        throw new TerraformExecutionError(
          ['plan'],
          buildWrappedMissingVariableStderr(
            'secret_managed_esg_creds_reference_arn',
            'sqs_partition_consumer_schedule_state',
          ),
          '',
        );
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const warn = jest.fn();
    const readDirectory = jest.fn().mockReturnValue(['variables.tf']);
    const readFile = jest.fn().mockReturnValue(`variable "name" {
  type = string
}

variable "secret_managed_esg_creds_reference_arn" {
  type = string
}

variable "sqs_partition_consumer_schedule_state" {
  type = string
}
`);
    const { service, writeFile } = buildService(execute, {
      readDirectory,
      readFile,
    });

    const result = service.runDiagram(
      buildInput({
        warn,
      }),
    );

    expect(result).toEqual({
      dot: 'digraph { planned }',
      planShowJson: '{"planned_values":{"root_module":{"resources":[]}}}',
    });
    expect(execute).toHaveBeenNthCalledWith(
      4,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/terra-graph-session/terra-graph.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/tmp/terra-graph-session/workspace/terra-graph.auto.tfvars.json',
      '{\n  "name": ""\n}\n',
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      3,
      '/tmp/terra-graph-session/workspace/terra-graph.auto.tfvars.json',
      '{\n  "name": "",\n  "secret_managed_esg_creds_reference_arn": "",\n  "sqs_partition_consumer_schedule_state": ""\n}\n',
    );
    expect(warn).toHaveBeenNthCalledWith(
      1,
      'Terraform variables were not set; generated placeholder values in temporary workspace for: name',
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      'Terraform variables were not set; generated placeholder values in temporary workspace for: secret_managed_esg_creds_reference_arn, sqs_partition_consumer_schedule_state',
    );
  });

  it('falls back to plain terraform graph when plan flow fails', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new Error('plan failed');
      })
      .mockReturnValueOnce('digraph { fallback }');
    const warn = jest.fn();
    const { service, removePath } = buildService(execute);

    const result = service.runDiagram(
      buildInput({
        warn,
      }),
    );

    expect(result).toEqual({
      dot: 'digraph { fallback }',
    });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      ['init', '-reconfigure', '-input=false'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/terra-graph-session/terra-graph.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      ['graph'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenCalledWith('/tmp/terra-graph-session');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      "fall back to plain 'terraform graph'",
    );
  });

  it('does not remove plan file when skipCleanup is true', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new Error('plan failed');
      })
      .mockReturnValueOnce('digraph {}');
    const warn = jest.fn();
    const { service, removePath } = buildService(execute);

    service.runDiagram(
      buildInput({
        skipCleanup: true,
        warn,
      }),
    );

    expect(removePath).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Terraform temporary workspace retained: /tmp/terra-graph-session',
    );
  });

  it('cleans explicit plan file and temp workspace when cleanup is enabled', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const { service, removePath } = buildService(execute);

    service.runDiagram(
      buildInput({
        planFile: '/tmp/custom-plan.tfplan',
      }),
    );

    expect(execute).toHaveBeenNthCalledWith(
      2,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/custom-plan.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenNthCalledWith(1, '/tmp/custom-plan.tfplan');
    expect(removePath).toHaveBeenNthCalledWith(2, '/tmp/terra-graph-session');
  });

  it('resolves relative explicit plan files against the source Terraform directory', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const { service } = buildService(execute);

    service.runDiagram(
      buildInput({
        cwd: '/tmp/project',
        planFile: 'plans/custom.tfplan',
      }),
    );

    expect(execute).toHaveBeenNthCalledWith(
      2,
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=/tmp/project/plans/custom.tfplan',
      ],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
  });

  it('auto-generates placeholder tfvars and retries graph in dot-only mode', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new TerraformExecutionError(
          ['graph'],
          buildMissingVariableStderr('enabled'),
          '',
        );
      })
      .mockReturnValueOnce('digraph {}');
    const readDirectory = jest.fn().mockReturnValue(['variables.tf']);
    const readFile = jest
      .fn()
      .mockReturnValue('variable "enabled" {\n  type = bool\n}\n');
    const warn = jest.fn();
    const { service, writeFile } = buildService(execute, {
      readDirectory,
      readFile,
    });

    const dot = service.runDotOnly({
      cwd: '/tmp',
      warn,
    });

    expect(dot).toBe('digraph {}');
    expect(execute).toHaveBeenNthCalledWith(
      2,
      ['graph'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      ['graph'],
      '/tmp/terra-graph-session/workspace',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/tmp/terra-graph-session/workspace/terra-graph.auto.tfvars.json',
      '{\n  "enabled": false\n}\n',
    );
    expect(warn).toHaveBeenCalledWith(
      'Terraform variables were not set; generated placeholder values in temporary workspace for: enabled',
    );
  });
});
