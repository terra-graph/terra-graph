import { asNodeId } from '@terra-graph/core/Graph/TgGraph.js';
import { TerraformDiagramService } from './TerraformDiagramService.js';

const baseGraph = {
  schemaVersion: '1.0.0',
  nodes: {
    n1: {
      id: asNodeId('n1'),
    },
  },
  edges: [],
  description: {},
};

describe('TerraformDiagramService.run', () => {
  it('decorates graph when plan json is available and renders result', async () => {
    const importer = {
      fromString: jest.fn().mockReturnValue(baseGraph),
    };
    const decoratedGraph = {
      ...baseGraph,
      description: {
        decorated: 'yes',
      },
    };
    const decorator = {
      decorate: jest.fn().mockReturnValue(decoratedGraph),
    };
    const renderService = {
      render: jest.fn().mockResolvedValue(undefined),
    };
    const terraformGraphService = {
      runDiagram: jest.fn().mockReturnValue({
        dot: 'digraph {}',
        planShowJson: '{"planned_values":{"root_module":{"resources":[]}}}',
      }),
    };

    const service = new TerraformDiagramService(
      importer as never,
      renderService as never,
      terraformGraphService as never,
      async () => decorator as never,
    );

    await service.run({
      argv: ['--profile', 'x'],
      flags: {
        verbose: false,
        continueOnError: false,
      },
      usePlan: true,
      cwd: '/tmp',
      planFile: '.terraform/terra-graph.tfplan',
      skipCleanup: false,
      log: jest.fn(),
      warn: jest.fn(),
      fail: ((error: Error | string) => {
        throw error;
      }) as never,
    });

    expect(terraformGraphService.runDiagram).toHaveBeenCalledTimes(1);
    expect(importer.fromString).toHaveBeenCalledWith('digraph {}');
    expect(decorator.decorate).toHaveBeenCalledWith(
      baseGraph,
      '{"planned_values":{"root_module":{"resources":[]}}}',
    );
    expect(renderService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tgGraph: decoratedGraph,
      }),
    );
  });

  it('warns and continues with undecorated graph when plan decoration fails', async () => {
    const importer = {
      fromString: jest.fn().mockReturnValue(baseGraph),
    };
    const decorator = {
      decorate: jest.fn().mockImplementation(() => {
        throw new Error('bad plan');
      }),
    };
    const renderService = {
      render: jest.fn().mockResolvedValue(undefined),
    };
    const terraformGraphService = {
      runDiagram: jest.fn().mockReturnValue({
        dot: 'digraph {}',
        planShowJson: '{}',
      }),
    };
    const warn = jest.fn();

    const service = new TerraformDiagramService(
      importer as never,
      renderService as never,
      terraformGraphService as never,
      async () => decorator as never,
    );

    await service.run({
      argv: [],
      flags: {
        verbose: false,
        continueOnError: false,
      },
      usePlan: true,
      planFile: '.terraform/terra-graph.tfplan',
      skipCleanup: false,
      log: jest.fn(),
      warn,
      fail: ((error: Error | string) => {
        throw error;
      }) as never,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'could not be applied as node decoration',
    );
    expect(renderService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tgGraph: baseGraph,
      }),
    );
  });

  it('skips decoration when plan json is unavailable', async () => {
    const importer = {
      fromString: jest.fn().mockReturnValue(baseGraph),
    };
    const decorator = {
      decorate: jest.fn(),
    };
    const renderService = {
      render: jest.fn().mockResolvedValue(undefined),
    };
    const terraformGraphService = {
      runDiagram: jest.fn().mockReturnValue({
        dot: 'digraph {}',
      }),
    };

    const service = new TerraformDiagramService(
      importer as never,
      renderService as never,
      terraformGraphService as never,
      async () => decorator as never,
    );

    await service.run({
      argv: [],
      flags: {
        verbose: false,
        continueOnError: false,
      },
      usePlan: true,
      planFile: '.terraform/terra-graph.tfplan',
      skipCleanup: false,
      log: jest.fn(),
      warn: jest.fn(),
      fail: ((error: Error | string) => {
        throw error;
      }) as never,
    });

    expect(decorator.decorate).not.toHaveBeenCalled();
    expect(renderService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tgGraph: baseGraph,
      }),
    );
  });

  it('uses dot-only path when usePlan is false', async () => {
    const importer = {
      fromString: jest.fn().mockReturnValue(baseGraph),
    };
    const renderService = {
      render: jest.fn().mockResolvedValue(undefined),
    };
    const terraformGraphService = {
      runDotOnly: jest.fn().mockReturnValue('digraph {}'),
      runDiagram: jest.fn(),
    };
    const decorator = {
      decorate: jest.fn(),
    };

    const service = new TerraformDiagramService(
      importer as never,
      renderService as never,
      terraformGraphService as never,
      async () => decorator as never,
    );

    await service.run({
      argv: [],
      flags: {
        verbose: false,
        continueOnError: false,
      },
      usePlan: false,
      skipCleanup: false,
      log: jest.fn(),
      warn: jest.fn(),
      fail: ((error: Error | string) => {
        throw error;
      }) as never,
    });

    expect(terraformGraphService.runDotOnly).toHaveBeenCalledWith({
      cwd: undefined,
      skipCleanup: false,
      warn: expect.any(Function),
    });
    expect(terraformGraphService.runDiagram).not.toHaveBeenCalled();
    expect(decorator.decorate).not.toHaveBeenCalled();
    expect(renderService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tgGraph: baseGraph,
      }),
    );
  });
});

describe('TerraformDiagramService.decorateImportedGraph', () => {
  it('decorates an already-imported graph when plan json is provided', async () => {
    const decoratedGraph = {
      ...baseGraph,
      description: {
        decorated: 'yes',
      },
    };
    const decorator = {
      decorate: jest.fn().mockReturnValue(decoratedGraph),
    };

    const service = new TerraformDiagramService(
      undefined as never,
      undefined as never,
      undefined as never,
      async () => decorator as never,
    );

    const result = await service.decorateImportedGraph(
      baseGraph as never,
      '{"planned_values":{"root_module":{"resources":[]}}}',
      jest.fn(),
    );

    expect(decorator.decorate).toHaveBeenCalledWith(
      baseGraph,
      '{"planned_values":{"root_module":{"resources":[]}}}',
    );
    expect(result).toBe(decoratedGraph);
  });
});
