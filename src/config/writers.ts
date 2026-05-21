import {
  FileArtifactWriter,
  FileArtifactWriterOptions,
} from '@terra-graph/core/Output/ArtifactWriter/FileArtifactWriter.js';
import { StdoutArtifactWriter } from '@terra-graph/core/Output/ArtifactWriter/StdoutArtifactWriter.js';
import type { WriterFactoryInput } from '@terra-graph/core/Output/Writers/WriterRegistry.js';
import { WriterRegistry } from '@terra-graph/core/Output/Writers/WriterRegistry.js';

const readFileWriterOptions = (
  input: WriterFactoryInput,
): FileArtifactWriterOptions => {
  const options = input.options;
  if (!options) {
    return {};
  }

  const target =
    typeof options.target === 'string' && options.target.trim().length > 0
      ? options.target
      : undefined;
  const createDirectories =
    typeof options.createDirectories === 'boolean'
      ? options.createDirectories
      : undefined;

  return {
    target,
    createDirectories,
  };
};

export const defaultWriterRegistry = new WriterRegistry({
  file: (input) => new FileArtifactWriter(readFileWriterOptions(input)),
  stdout: () => new StdoutArtifactWriter(),
});
