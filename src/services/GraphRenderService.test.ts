import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asNodeId } from '@terra-graph/core/Graph/TgGraph.js';
import { GraphRenderService } from './GraphRenderService.js';

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

const throwFail = (error: Error | string): never => {
  throw typeof error === 'string' ? new Error(error) : error;
};

describe('GraphRenderService.render', () => {
  it('renders through the built-in file writer using writerOptions.target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'graph-render-service-'));
    const runtimeConfigPath = join(dir, 'runtime.json');
    const target = join(dir, 'diagram.json');

    await writeFile(
      runtimeConfigPath,
      JSON.stringify({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          outputs: [
            {
              renderer: 'json',
              writer: 'file',
              writerOptions: {
                target,
              },
            },
          ],
        },
      }),
      'utf8',
    );

    try {
      await new GraphRenderService().render({
        tgGraph: baseGraph,
        argv: [],
        flags: {
          verbose: false,
          continueOnError: false,
          runtimeConfigFile: runtimeConfigPath,
        },
        log: jest.fn(),
        fail: throwFail,
      });

      const written = JSON.parse(await readFile(target, 'utf8')) as {
        nodes: Record<string, unknown>;
      };
      expect(Object.keys(written.nodes)).toEqual(['n1']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renders through the built-in stdout writer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'graph-render-service-'));
    const runtimeConfigPath = join(dir, 'runtime.json');
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await writeFile(
      runtimeConfigPath,
      JSON.stringify({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          outputs: [
            {
              renderer: 'json',
              writer: 'stdout',
            },
          ],
        },
      }),
      'utf8',
    );

    try {
      await new GraphRenderService().render({
        tgGraph: baseGraph,
        argv: [],
        flags: {
          verbose: false,
          continueOnError: false,
          runtimeConfigFile: runtimeConfigPath,
        },
        log: jest.fn(),
        fail: throwFail,
      });

      expect(writeSpy).toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads external renderers and writers from runtime providers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'graph-render-service-'));
    const providerPath = join(dir, 'provider.cjs');
    const runtimeConfigPath = join(dir, 'runtime.json');
    const target = join(dir, 'external.json');
    const coreModulePath = JSON.stringify(
      join(process.cwd(), 'node_modules/@terra-graph/core/dist/cjs/index.js'),
    );

    await writeFile(
      providerPath,
      `const fs = require('node:fs/promises');
const { RendererRegistry, WriterRegistry } = require(${coreModulePath});
module.exports = () => ({
  renderers: new RendererRegistry({
    'summary': ({ adapter }) => ({
      render() {
        return {
          content: JSON.stringify({ nodeCount: adapter.nodeIds().length }),
          mediaType: 'application/json',
        };
      },
    }),
  }),
  writers: new WriterRegistry({
    'capture': ({ options }) => ({
      async write(input) {
        await fs.writeFile(options.target, input.artifact.content, 'utf8');
      },
    }),
  }),
});`,
      'utf8',
    );

    await writeFile(
      runtimeConfigPath,
      JSON.stringify({
        providers: ['./provider.cjs'],
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          outputs: [
            {
              renderer: 'summary',
              writer: 'capture',
              writerOptions: {
                target,
              },
            },
          ],
        },
      }),
      'utf8',
    );

    try {
      await new GraphRenderService().render({
        tgGraph: baseGraph,
        argv: [],
        flags: {
          verbose: false,
          continueOnError: false,
          runtimeConfigFile: runtimeConfigPath,
        },
        log: jest.fn(),
        fail: throwFail,
      });

      const written = JSON.parse(await readFile(target, 'utf8')) as {
        nodeCount: number;
      };
      expect(written).toEqual({ nodeCount: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when run.outputs are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'graph-render-service-'));
    const runtimeConfigPath = join(dir, 'runtime.json');

    await writeFile(
      runtimeConfigPath,
      JSON.stringify({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
        },
      }),
      'utf8',
    );

    try {
      await expect(
        new GraphRenderService().render({
          tgGraph: baseGraph,
          argv: [],
          flags: {
            verbose: false,
            continueOnError: false,
            runtimeConfigFile: runtimeConfigPath,
          },
          log: jest.fn(),
          fail: throwFail,
        }),
      ).rejects.toThrow(
        "No output resolved. Define 'run.outputs' in the runtime config file.",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
