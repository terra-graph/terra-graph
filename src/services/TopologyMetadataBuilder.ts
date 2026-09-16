export type TgGraphMetadata = {
  version?: {
    id?: string;
    parentId?: string;
  };
  environment?: {
    name?: string;
  };
  terraform?: {
    workspace?: string;
  };
  source?: {
    ref?: string;
    commit?: string;
    repository?: string;
  };
  labels?: Record<string, string>;
  tool?: {
    terraGraphCliVersion?: string;
    terraGraphCoreVersion?: string;
  };
};

export type TopologyMetadataInput = {
  version?: string;
  parentVersion?: string;
  environment?: string;
  terraformWorkspace?: string;
  sourceRef?: string;
  sourceCommit?: string;
  sourceRepository?: string;
  labels?: string[];
};

export class TopologyMetadataBuilder {
  public build(input: TopologyMetadataInput): TgGraphMetadata | undefined {
    const labels = this.parseLabels(input.labels ?? []);
    const metadata: TgGraphMetadata = {};

    if (input.version || input.parentVersion) {
      metadata.version = {
        ...(input.version ? { id: input.version } : {}),
        ...(input.parentVersion ? { parentId: input.parentVersion } : {}),
      };
    }
    if (input.environment) {
      metadata.environment = {
        name: input.environment,
      };
    }
    if (input.terraformWorkspace) {
      metadata.terraform = {
        workspace: input.terraformWorkspace,
      };
    }
    if (input.sourceRef || input.sourceCommit || input.sourceRepository) {
      metadata.source = {
        ...(input.sourceRef ? { ref: input.sourceRef } : {}),
        ...(input.sourceCommit ? { commit: input.sourceCommit } : {}),
        ...(input.sourceRepository
          ? { repository: input.sourceRepository }
          : {}),
      };
    }
    if (Object.keys(labels).length > 0) {
      metadata.labels = labels;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private parseLabels(values: string[]): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const value of values) {
      const separatorIndex = value.indexOf('=');
      if (separatorIndex <= 0) {
        throw new Error(
          `Invalid metadata label '${value}'. Expected format: key=value`,
        );
      }

      const key = value.slice(0, separatorIndex).trim();
      if (!key) {
        throw new Error(
          `Invalid metadata label '${value}'. Expected format: key=value`,
        );
      }

      labels[key] = value.slice(separatorIndex + 1);
    }
    return labels;
  }
}
