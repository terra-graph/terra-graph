import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  TerraformExecutionError,
  TerraformExecutor,
} from './TerraformExecutor.js';

const BACKEND_OVERRIDE_FILENAME = 'terra-graph_override.tf';
const LOCAL_BACKEND_STATE_FILENAME = 'terra-graph.tfstate';
const AUTO_VARIABLES_FILENAME = 'terra-graph.auto.tfvars.json';

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

type TerraformSession = {
  sessionDir: string;
  workspaceDir: string;
  tfDataDir: string;
  planFile: string;
  autoVariableFile: string;
  removePlanFileOnCleanup: boolean;
};

type CopyPathFn = (sourcePath: string, destinationPath: string) => void;
type WriteFileFn = (path: string, contents: string) => void;
type ReadFileFn = (path: string) => string;
type ReadDirectoryFn = (path: string) => string[];
type AutoVariableValue =
  | null
  | boolean
  | number
  | string
  | AutoVariableValue[]
  | {
      [key: string]: AutoVariableValue;
    };

type VariableDefinition = {
  typeExpression?: string;
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
    private readonly copyPath: CopyPathFn = (
      sourcePath: string,
      destinationPath: string,
    ) => {
      cpSync(sourcePath, destinationPath, {
        recursive: true,
        filter: (path) => this.shouldCopyPath(path),
      });
    },
    private readonly writeFile: WriteFileFn = (
      path: string,
      contents: string,
    ) => {
      writeFileSync(path, contents, 'utf8');
    },
    private readonly readFile: ReadFileFn = (path: string) =>
      readFileSync(path, 'utf8'),
    private readonly readDirectory: ReadDirectoryFn = (path: string) =>
      readdirSync(path),
  ) {}

  public runDotOnly(options: TerraformGraphServiceOptions = {}): string {
    const sourceDir = this.resolveSourceDir(options.cwd);
    const session = this.createSession(sourceDir);

    try {
      this.prepareWorkspace(sourceDir, session.workspaceDir);
      const env = this.buildTerraformEnv(session.tfDataDir);
      this.executor.execute(
        ['init', '-reconfigure', '-input=false'],
        session.workspaceDir,
        env,
      );
      return this.executeWithAutomaticVariables(
        ['graph'],
        session,
        env,
        options.warn,
      );
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
    const sourceDir = this.resolveSourceDir(input.cwd);
    const session = this.createSession(sourceDir, input.planFile);
    const env = this.buildTerraformEnv(session.tfDataDir);

    try {
      this.prepareWorkspace(sourceDir, session.workspaceDir);
      this.executor.execute(
        ['init', '-reconfigure', '-input=false'],
        session.workspaceDir,
        env,
      );

      this.executeWithAutomaticVariables(
        this.buildPlanArgs(session.planFile),
        session,
        env,
        input.warn,
      );

      const dot = this.executor.execute(
        ['graph', `-plan=${session.planFile}`],
        session.workspaceDir,
        env,
      );
      const planShowJson = this.executor.execute(
        ['show', '-json', session.planFile],
        session.workspaceDir,
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
        dot: this.executeWithAutomaticVariables(
          ['graph'],
          session,
          env,
          input.warn,
        ),
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

  private createSession(
    sourceDir: string,
    explicitPlanFile?: string,
  ): TerraformSession {
    const sessionDir = this.makeTempDir(join(tmpdir(), 'terra-graph-'));
    return {
      sessionDir,
      workspaceDir: join(sessionDir, 'workspace'),
      tfDataDir: join(sessionDir, 'tf-data'),
      planFile: explicitPlanFile
        ? resolve(sourceDir, explicitPlanFile)
        : join(sessionDir, 'terra-graph.tfplan'),
      autoVariableFile: join(sessionDir, 'workspace', AUTO_VARIABLES_FILENAME),
      removePlanFileOnCleanup: explicitPlanFile !== undefined,
    };
  }

  private prepareWorkspace(sourceDir: string, workspaceDir: string): void {
    this.copyPath(sourceDir, workspaceDir);
    this.writeFile(
      join(workspaceDir, BACKEND_OVERRIDE_FILENAME),
      this.buildBackendOverrideFile(),
    );
  }

  private buildBackendOverrideFile(): string {
    return `terraform {
  backend "local" {
    path = "./${LOCAL_BACKEND_STATE_FILENAME}"
  }
}
`;
  }

  private executeWithAutomaticVariables(
    args: string[],
    session: TerraformSession,
    env: NodeJS.ProcessEnv,
    warn?: (message: string) => void,
  ): string {
    const autoVariables: Record<string, AutoVariableValue> = {};
    const variableDefinitions = this.loadVariableDefinitions(
      session.workspaceDir,
    );

    while (true) {
      try {
        return this.executor.execute(args, session.workspaceDir, env);
      } catch (error) {
        if (!(error instanceof TerraformExecutionError)) {
          throw error;
        }

        const generatedNames = this.generateAutomaticVariableValues(
          error.stderr,
          variableDefinitions,
          autoVariables,
        );

        if (generatedNames.length === 0) {
          throw error;
        }

        this.writeFile(
          session.autoVariableFile,
          `${JSON.stringify(autoVariables, null, 2)}\n`,
        );
        warn?.(
          `Terraform variables were not set; generated placeholder values in temporary workspace for: ${generatedNames.join(', ')}`,
        );
      }
    }
  }

  private buildPlanArgs(planFile: string): string[] {
    return [
      'plan',
      '-refresh=false',
      '-lock=false',
      '-input=false',
      `-out=${planFile}`,
    ];
  }

  private generateAutomaticVariableValues(
    stderr: string,
    variableDefinitions: Map<string, VariableDefinition>,
    autoVariables: Record<string, AutoVariableValue>,
  ): string[] {
    const generatedNames: string[] = [];

    for (const variableName of this.parseMissingVariableNames(stderr)) {
      if (variableName in autoVariables) {
        continue;
      }

      autoVariables[variableName] = this.buildPlaceholderValue(
        variableDefinitions.get(variableName),
      );
      generatedNames.push(variableName);
    }

    return generatedNames;
  }

  private parseMissingVariableNames(stderr: string): string[] {
    const normalized = this.normalizeTerraformDiagnosticText(stderr);
    const matches = normalized.matchAll(
      /The root module input variable "([^"]+)"\s+is\s+not set/g,
    );
    return [...new Set([...matches].map((match) => match[1]))];
  }

  private normalizeTerraformDiagnosticText(input: string): string {
    return this.stripAnsiEscapeCodes(input)
      .split('\n')
      .map((line) => this.stripTerraformLinePrefix(line))
      .join('\n');
  }

  private stripAnsiEscapeCodes(input: string): string {
    let normalized = '';

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];

      if (char === '\u001B' && input[index + 1] === '[') {
        index += 2;
        while (index < input.length && input[index] !== 'm') {
          index += 1;
        }
        continue;
      }

      normalized += char;
    }

    return normalized;
  }

  private stripTerraformLinePrefix(line: string): string {
    const trimmed = line.trimStart();
    const firstCharacter = trimmed[0];

    if (
      firstCharacter === '\u2502' ||
      firstCharacter === '\u2575' ||
      firstCharacter === '\u2577'
    ) {
      return trimmed.slice(1).trimStart();
    }

    return line;
  }

  private buildPlaceholderValue(
    definition?: VariableDefinition,
  ): AutoVariableValue {
    if (!definition?.typeExpression) {
      return '';
    }

    return this.buildPlaceholderValueFromType(definition.typeExpression);
  }

  private buildPlaceholderValueFromType(
    typeExpression: string,
  ): AutoVariableValue {
    const normalized = this.unwrapOptionalType(typeExpression.trim());

    if (normalized === 'string' || normalized === 'any') {
      return '';
    }

    if (normalized === 'number') {
      return 0;
    }

    if (normalized === 'bool') {
      return false;
    }

    if (normalized.startsWith('list(') || normalized.startsWith('set(')) {
      return [];
    }

    if (normalized.startsWith('map(')) {
      return {};
    }

    if (normalized.startsWith('tuple(')) {
      return this.buildTuplePlaceholder(normalized);
    }

    if (normalized.startsWith('object(')) {
      return this.buildObjectPlaceholder(normalized);
    }

    return '';
  }

  private buildTuplePlaceholder(typeExpression: string): AutoVariableValue[] {
    const inner = this.extractWrappedInner(typeExpression, 'tuple');
    if (!inner) {
      return [];
    }

    const entries = this.splitTopLevelEntries(
      this.unwrapDelimited(inner, '[', ']'),
    );
    return entries.map((entry) => this.buildPlaceholderValueFromType(entry));
  }

  private buildObjectPlaceholder(
    typeExpression: string,
  ): Record<string, AutoVariableValue> {
    const inner = this.extractWrappedInner(typeExpression, 'object');
    if (!inner) {
      return {};
    }

    const entries = this.splitTopLevelEntries(
      this.unwrapDelimited(inner, '{', '}'),
    );
    const placeholder: Record<string, AutoVariableValue> = {};

    for (const entry of entries) {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = entry.slice(0, separatorIndex).trim().replace(/^"|"$/g, '');
      const valueType = entry.slice(separatorIndex + 1).trim();

      if (!key) {
        continue;
      }

      placeholder[key] = this.buildPlaceholderValueFromType(valueType);
    }

    return placeholder;
  }

  private unwrapOptionalType(typeExpression: string): string {
    let current = typeExpression.trim();

    while (current.startsWith('optional(') && current.endsWith(')')) {
      const inner = this.extractWrappedInner(current, 'optional');
      if (!inner) {
        break;
      }

      const [firstArgument] = this.splitTopLevelEntries(inner, ',');
      if (!firstArgument) {
        break;
      }

      current = firstArgument.trim();
    }

    return current;
  }

  private extractWrappedInner(
    value: string,
    prefix: string,
  ): string | undefined {
    const trimmed = value.trim();
    const expectedPrefix = `${prefix}(`;

    if (!trimmed.startsWith(expectedPrefix) || !trimmed.endsWith(')')) {
      return undefined;
    }

    return trimmed.slice(expectedPrefix.length, -1).trim();
  }

  private unwrapDelimited(value: string, open: string, close: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(1, -1).trim();
    }

    return trimmed;
  }

  private splitTopLevelEntries(value: string, delimiter = ','): string[] {
    const entries: string[] = [];
    let depth = 0;
    let inString = false;
    let current = '';

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];

      if (char === '"' && value[index - 1] !== '\\') {
        inString = !inString;
      }

      if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth += 1;
        } else if (char === ')' || char === ']' || char === '}') {
          depth -= 1;
        }
      }

      const isEntryBreak =
        !inString &&
        depth === 0 &&
        (char === delimiter || (delimiter === ',' && char === '\n'));

      if (isEntryBreak) {
        const trimmed = current.trim();
        if (trimmed) {
          entries.push(trimmed);
        }
        current = '';
        continue;
      }

      current += char;
    }

    const trimmed = current.trim();
    if (trimmed) {
      entries.push(trimmed);
    }

    return entries;
  }

  private loadVariableDefinitions(
    workspaceDir: string,
  ): Map<string, VariableDefinition> {
    const definitions = new Map<string, VariableDefinition>();

    for (const fileName of this.readDirectory(workspaceDir)) {
      if (fileName.endsWith('.tf')) {
        this.readHclVariableDefinitions(
          join(workspaceDir, fileName),
          definitions,
        );
      } else if (fileName.endsWith('.tf.json')) {
        this.readJsonVariableDefinitions(
          join(workspaceDir, fileName),
          definitions,
        );
      }
    }

    return definitions;
  }

  private readHclVariableDefinitions(
    filePath: string,
    definitions: Map<string, VariableDefinition>,
  ): void {
    const content = this.readFile(filePath);
    const variableBlockPattern = /\bvariable\s+"([^"]+)"\s*\{/g;

    for (const match of content.matchAll(variableBlockPattern)) {
      const variableName = match[1];
      const blockStart = (match.index ?? 0) + match[0].length - 1;
      const blockEnd = this.findMatchingDelimiter(
        content,
        blockStart,
        '{',
        '}',
      );

      if (blockEnd === -1 || definitions.has(variableName)) {
        continue;
      }

      const body = content.slice(blockStart + 1, blockEnd);
      const typeExpression = this.readTopLevelAssignment(body, 'type');
      definitions.set(variableName, {
        typeExpression,
      });
    }
  }

  private readJsonVariableDefinitions(
    filePath: string,
    definitions: Map<string, VariableDefinition>,
  ): void {
    const content = this.readFile(filePath);
    const parsed = JSON.parse(content) as {
      variable?: Record<string, { type?: unknown }>;
    };

    for (const [variableName, definition] of Object.entries(
      parsed.variable ?? {},
    )) {
      if (definitions.has(variableName)) {
        continue;
      }

      definitions.set(variableName, {
        typeExpression: this.stringifyJsonType(definition.type),
      });
    }
  }

  private stringifyJsonType(typeValue: unknown): string | undefined {
    if (typeof typeValue === 'string') {
      return typeValue;
    }

    if (Array.isArray(typeValue)) {
      return JSON.stringify(typeValue);
    }

    if (typeValue && typeof typeValue === 'object') {
      return JSON.stringify(typeValue);
    }

    return undefined;
  }

  private readTopLevelAssignment(
    body: string,
    key: string,
  ): string | undefined {
    let index = 0;

    while (index < body.length) {
      index = this.skipWhitespaceAndComments(body, index);
      if (index >= body.length) {
        return undefined;
      }

      const identifierMatch = body.slice(index).match(/^([A-Za-z0-9_-]+)/);
      if (!identifierMatch) {
        index += 1;
        continue;
      }

      const identifier = identifierMatch[1];
      let cursor = index + identifier.length;
      cursor = this.skipInlineWhitespace(body, cursor);

      if (body[cursor] === '=') {
        const { value, endIndex } = this.readExpression(body, cursor + 1);
        if (identifier === key) {
          return value;
        }
        index = endIndex;
        continue;
      }

      if (body[cursor] === '{') {
        const blockEnd = this.findMatchingDelimiter(body, cursor, '{', '}');
        index = blockEnd === -1 ? body.length : blockEnd + 1;
        continue;
      }

      index = this.advanceToNextLine(body, cursor);
    }

    return undefined;
  }

  private readExpression(
    input: string,
    index: number,
  ): {
    value: string;
    endIndex: number;
  } {
    let cursor = this.skipInlineWhitespace(input, index);
    let depth = 0;
    let inString = false;
    let value = '';

    while (cursor < input.length) {
      const char = input[cursor];

      if (char === '"' && input[cursor - 1] !== '\\') {
        inString = !inString;
      }

      if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth += 1;
        } else if (char === ')' || char === ']' || char === '}') {
          depth -= 1;
        } else if (char === '\n' && depth === 0) {
          break;
        }
      }

      value += char;
      cursor += 1;
    }

    return {
      value: value.trim(),
      endIndex: cursor,
    };
  }

  private skipWhitespaceAndComments(input: string, index: number): number {
    let cursor = index;

    while (cursor < input.length) {
      if (/\s/.test(input[cursor])) {
        cursor += 1;
        continue;
      }

      if (input.startsWith('//', cursor) || input[cursor] === '#') {
        cursor = this.advanceToNextLine(input, cursor);
        continue;
      }

      return cursor;
    }

    return cursor;
  }

  private skipInlineWhitespace(input: string, index: number): number {
    let cursor = index;
    while (cursor < input.length && /[ \t]/.test(input[cursor])) {
      cursor += 1;
    }
    return cursor;
  }

  private advanceToNextLine(input: string, index: number): number {
    const nextNewline = input.indexOf('\n', index);
    return nextNewline === -1 ? input.length : nextNewline + 1;
  }

  private findMatchingDelimiter(
    input: string,
    startIndex: number,
    open: string,
    close: string,
  ): number {
    let depth = 0;
    let inString = false;

    for (let index = startIndex; index < input.length; index += 1) {
      const char = input[index];

      if (char === '"' && input[index - 1] !== '\\') {
        inString = !inString;
      }

      if (inString) {
        continue;
      }

      if (char === open) {
        depth += 1;
      } else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  private shouldCopyPath(path: string): boolean {
    const name = basename(path);

    if (name === '.terraform') {
      return false;
    }

    if (/^terraform\.tfstate(\..+)?$/.test(name)) {
      return false;
    }

    return !name.endsWith('.tfplan');
  }

  private resolveSourceDir(cwd?: string): string {
    return resolve(cwd ?? process.cwd());
  }

  private buildTerraformEnv(tfDataDir: string): NodeJS.ProcessEnv {
    return {
      TF_DATA_DIR: tfDataDir,
    };
  }
}
