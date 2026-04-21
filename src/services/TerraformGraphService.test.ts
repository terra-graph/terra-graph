import {
  TerraformDiagramRunInput,
  TerraformGraphService,
} from './TerraformGraphService.js';

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
  it('runs init with backend disabled and then terraform graph', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph {}');
    const removePath = jest.fn();
    const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
    const service = new TerraformGraphService(
      {
        execute,
      } as never,
      removePath,
      makeTempDir,
    );

    const dot = service.runDotOnly({ cwd: '/tmp' });

    expect(dot).toBe('digraph {}');
    expect(makeTempDir).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenNthCalledWith(
      1,
      ['init', '-backend=false', '-input=false'],
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(2, ['graph'], '/tmp', {
      TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
    });
    expect(removePath).toHaveBeenCalledWith('/tmp/terra-graph-session');
  });
});

describe('TerraformGraphService.runDiagram', () => {
  it('runs init, plan, graph -plan and show -json in order', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('digraph { planned }')
      .mockReturnValueOnce(
        '{"planned_values":{"root_module":{"resources":[]}}}',
      );
    const removePath = jest.fn();
    const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
    const warn = jest.fn();

    const service = new TerraformGraphService(
      {
        execute,
      } as never,
      removePath,
      makeTempDir,
    );

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
      1,
      ['init', '-backend=false', '-input=false'],
      '/tmp',
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
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      ['graph', '-plan=/tmp/terra-graph-session/terra-graph.tfplan'],
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(
      4,
      ['show', '-json', '/tmp/terra-graph-session/terra-graph.tfplan'],
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenCalledTimes(1);
    expect(removePath).toHaveBeenCalledWith('/tmp/terra-graph-session');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to plain terraform graph when plan flow fails', () => {
    const execute = jest
      .fn()
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new Error('plan failed');
      })
      .mockReturnValueOnce('digraph { fallback }');
    const removePath = jest.fn();
    const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
    const warn = jest.fn();

    const service = new TerraformGraphService(
      {
        execute,
      } as never,
      removePath,
      makeTempDir,
    );

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
      ['init', '-backend=false', '-input=false'],
      '/tmp',
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
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(execute).toHaveBeenNthCalledWith(3, ['graph'], '/tmp', {
      TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
    });
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
    const removePath = jest.fn();
    const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
    const warn = jest.fn();
    const service = new TerraformGraphService(
      {
        execute,
      } as never,
      removePath,
      makeTempDir,
    );

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
    const removePath = jest.fn();
    const makeTempDir = jest.fn().mockReturnValue('/tmp/terra-graph-session');
    const service = new TerraformGraphService(
      {
        execute,
      } as never,
      removePath,
      makeTempDir,
    );

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
      '/tmp',
      {
        TF_DATA_DIR: '/tmp/terra-graph-session/tf-data',
      },
    );
    expect(removePath).toHaveBeenNthCalledWith(1, '/tmp/custom-plan.tfplan');
    expect(removePath).toHaveBeenNthCalledWith(2, '/tmp/terra-graph-session');
  });
});
