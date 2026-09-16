import { TopologyMetadataBuilder } from './TopologyMetadataBuilder.js';

describe('TopologyMetadataBuilder.build', () => {
  it('shoud build graph metadata from explicit CLI-style inputs', () => {
    const metadata = new TopologyMetadataBuilder().build({
      version: 'run-2',
      parentVersion: 'run-1',
      environment: 'prod',
      terraformWorkspace: 'default',
      sourceRef: 'refs/heads/main',
      sourceCommit: 'abc123',
      sourceRepository: 'git@example.com:org/repo.git',
      labels: ['team=platform', 'service=payments'],
    });

    expect(metadata).toStrictEqual({
      version: {
        id: 'run-2',
        parentId: 'run-1',
      },
      environment: {
        name: 'prod',
      },
      terraform: {
        workspace: 'default',
      },
      source: {
        ref: 'refs/heads/main',
        commit: 'abc123',
        repository: 'git@example.com:org/repo.git',
      },
      labels: {
        team: 'platform',
        service: 'payments',
      },
    });
  });

  it('shoud return undefined when no metadata is provided', () => {
    expect(new TopologyMetadataBuilder().build({})).toBeUndefined();
  });

  it('shoud fail clearly when a metadata label is invalid', () => {
    expect(() =>
      new TopologyMetadataBuilder().build({
        labels: ['team'],
      }),
    ).toThrow("Invalid metadata label 'team'. Expected format: key=value");
  });
});
