# Runtime configuration

Current commands load JSON or YAML runtime configuration with `--runtimeConfigFile`. Select a profile with `--profile`, or set `run.profile` in the file; the CLI flag takes precedence. Without a runtime file, only built-in providers are available. There is no automatic `terra-graph.js` discovery in this implementation.

```sh
terra-graph diagram --terraform-dir ./infra --runtimeConfigFile ./terra-graph.runtime.yml
terra-graph diagram:from-dot --dot-input ./graph.dot --runtimeConfigFile ./terra-graph.runtime.yml
```

## Providers, profiles, and execution

- `providers` loads installed runtime provider packages or local provider modules. Provider packages supply named profiles, rules, rule sets, plugins, and output capabilities.
- `profiles` defines named profiles. Profiles can compose other profiles with `usesProfiles` and configure plugins, phases, rendering, and metadata.
- Phase entries select `pre`, `main`, `projection`, or `final` and contain serialized rules, named rule references, or named rule-set references.
- `run.profile` selects the profile; `run.outputs` selects renderers, transformations, writers, and destinations.
- Resolve provider references using their registered names. Keep serializable configuration separate from provider implementation code.

For example, when the conventions packages are installed:

```yaml
providers:
  - '@terra-graph/conventions-core'
  - '@terra-graph/conventions-aws'

run:
  profile: '@terra-graph/conventions-aws:profile:base.dataflow'
  outputs:
    - renderer: json
      writer: file
      writerOptions:
        target: ./graph.tggraph.json
```

See the provider package documentation for its exported profile IDs. Built-in parsers accept `.json`, `.yaml`, and `.yml` files. Configurations are validated before profile execution.

## Metadata

### Runtime `metadata`

Runtime config files can attach explicit topology metadata at either profile or run level. Run metadata overrides profile metadata, and CLI `--metadata-*` flags override both. Labels are shallow-merged.

```yaml
profiles:
  aws.dataflow:
    metadata:
      environment:
        name: prod
      labels:
        team: platform

run:
  profile: aws.dataflow
  metadata:
    version:
      id: build-123
    terraform:
      workspace: default
    source:
      ref: refs/heads/main
      commit: abc123
      repository: git@example.com:org/repo.git
```

## Cloud project association

`--project-id <UUID>` overrides renderer `options.projectId` for cloud-associated imports. Cloud project identity is not added to canonical graph metadata. The cloud importer owns snapshot UUIDs and profile-version digests.

## Historical configuration

Earlier CLI documentation described `--configFile`, JavaScript globals named `TerraGraph`, and hooks such as `meta.before` and `graph.filter`. Those mechanisms are historical and are not the runtime configuration contract of this checkout. Use provider plugins, phase rules, and the query DSL for current extensions.
