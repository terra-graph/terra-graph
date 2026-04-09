import { NamedRuleRegistry } from '@terra-graph/core/Graph/Rules/NamedRuleRegistry.js';
import { NodeDotProperties } from '@terra-graph/core/Graph/Rules/Node/NodeDotProperties.js';
import { RemoveNode } from '@terra-graph/core/Graph/Rules/Node/RemoveNode.js';
import { RemoveNodeAndReconnectEdges } from '@terra-graph/core/Graph/Rules/Node/RemoveNodeAndReconnectEdges.js';

export const namedRules = new NamedRuleRegistry({
  'remove.tfconfig': new RemoveNode({
    node: {
      or: [
        {
          attr: {
            key: 'terraform.kind',
            in: [
              // 'data',
              'local',
              'var',
              'terraform_data',
            ],
          },
        },
        {
          attr: {
            key: 'terraform.resource',
            in: ['null_resource', 'local_file'],
          },
        },
      ],
    },
  }),
  'reconnect.time_sleep': new RemoveNodeAndReconnectEdges({
    node: {
      attr: {
        key: 'terraform.resource',
        eq: 'time_sleep',
      },
    },
  }),
  'remove.childless_modules': new RemoveNode({
    node: {
      and: [
        { attr: { key: 'terraform.kind', eq: 'module' } },
        { children: { exists: false } },
      ],
    },
  }),
  'dot.normalise_modules': new NodeDotProperties({
    options: {
      peripheries: 0,
      label: '',
      height: 0,
      width: 0,
    },
    node: {
      attr: {
        key: 'terraform.kind',
        eq: 'module',
      },
    },
  }),
});
