# Commands
  <!-- commands -->
* [`terra-graph diagram`](#terra-graph-diagram)
* [`terra-graph diagram:from-dot`](#terra-graph-diagramfrom-dot)
* [`terra-graph topology`](#terra-graph-topology)

## `terra-graph diagram`

Generate and render a Terraform diagram in one command

```
USAGE
  $ terra-graph diagram [--verbose] [--continueOnError] [--runtimeConfigFile <value>] [--profile <value>]
    [--no-plan] [--graph-only] [--terraform-dir <value>] [--plan-file <value>] [--skip-cleanup]

FLAGS
  --continueOnError            Continue to process graph and attenmpt to generate a diagram even if an error is
                               encountered
  --graph-only                 Alias for '--no-plan'
  --no-plan                    Skip plan/show decoration and render from terraform graph only
  --plan-file=<value>          Optional custom path for Terraform plan artifact; defaults to an OS temp location
  --profile=<value>            Profile name to resolve from the runtime catalog (overrides runtime config run.profile)
  --runtimeConfigFile=<value>  Runtime config path (.json/.yaml/.yml) used to load profiles/rules/rule sets
  --skip-cleanup               Keep generated Terraform temp workspace after execution
  --terraform-dir=<value>      Path to the Terraform project directory (defaults to current working directory)
  --verbose                    Print detailed outoput of each hook and filter applied to the graph

DESCRIPTION
  Generate and render a Terraform diagram in one command

EXAMPLES
  $ terra-graph diagram --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram --terraform-dir ./infra --runtimeConfigFile ./my-config.yml --transformer-dotcli-format png

  $ terra-graph diagram --no-plan --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram --profile my-profile --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram --plan-file ./my-debug.tfplan --skip-cleanup --runtimeConfigFile ./my-config.yml
```

_See code: [src/commands/diagram.ts](https://github.com/terra-graph/terra-graph/blob/v0.1.0/src/commands/diagram.ts)_

## `terra-graph diagram:from-dot`

Render a diagram from Terraform DOT input

```
USAGE
  $ terra-graph diagram:from-dot [--verbose] [--continueOnError] [--runtimeConfigFile <value>] [--profile <value>]
    [--dot-input <value>] [--plan-file <value>] [--plan-json-file <value>] [--change-plan-json-file <value>]

FLAGS
  --change-plan-json-file=<value>  Optional path to pre-generated Terraform plan JSON from `terraform show -json`.
                                   Resource changes are stored as graph-level change evidence.
  --continueOnError                Continue to process graph and attenmpt to generate a diagram even if an error is
                                   encountered
  --dot-input=<value>              Path to a DOT file. If omitted, command reads DOT input from stdin.
  --plan-file=<value>              Optional path to a Terraform plan artifact (.tfplan). When provided, the command runs
                                   `terraform show -json` and applies plan-based decoration to the imported DOT graph.
  --plan-json-file=<value>         Optional path to pre-generated Terraform plan JSON from `terraform show -json`. When
                                   provided, the command applies plan-based decoration directly without invoking
                                   Terraform.
  --profile=<value>                Profile name to resolve from the runtime catalog (overrides runtime config
                                   run.profile)
  --runtimeConfigFile=<value>      Runtime config path (.json/.yaml/.yml) used to load profiles/rules/rule sets
  --verbose                        Print detailed outoput of each hook and filter applied to the graph

DESCRIPTION
  Render a diagram from Terraform DOT input

EXAMPLES
  $ terra-graph diagram:from-dot --dot-input ./graph.dot --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram:from-dot --dot-input ./graph.dot --plan-file ./plan.tfplan --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram:from-dot --dot-input ./graph.dot --plan-json-file ./plan.json --runtimeConfigFile ./my-config.yml

  $ terra-graph diagram:from-dot --dot-input ./graph.dot --plan-json-file ./topology-plan.json --change-plan-json-file ./change-plan.json --runtimeConfigFile ./my-config.yml

  terraform graph | terra-graph diagram:from-dot --runtimeConfigFile ./my-config.yml --transformer-dotcli-format png
```

_See code: [src/commands/diagram/from-dot.ts](https://github.com/terra-graph/terra-graph/blob/v0.1.0/src/commands/diagram/from-dot.ts)_

## `terra-graph topology`

Generate and render a full Terraform topology with optional change evidence

```
USAGE
  $ terra-graph topology [--verbose] [--continueOnError] [--runtimeConfigFile <value>] [--profile <value>]
    [--terraform-dir <value>] [--change-plan-json-file <value>] [--metadata-version <value>] [--metadata-environment <value>] [--metadata-terraform-workspace <value>] [--metadata-source-ref <value>]
    [--metadata-source-commit <value>] [--metadata-source-repository <value>] [--metadata-label <value>...]

FLAGS
  --change-plan-json-file=<value>         Path to Terraform plan JSON from `terraform show -json`; resource_changes are
                                          stored as graph-level change evidence
  --continueOnError                       Continue to process graph and attenmpt to generate a diagram even if an error
                                          is encountered
  --metadata-environment=<value>          Deployment environment name for the topology metadata
  --metadata-label=<value>...             Additional metadata label in key=value format; may be provided multiple times
  --metadata-source-commit=<value>        Source control commit for the topology metadata
  --metadata-source-ref=<value>           Source control ref for the topology metadata
  --metadata-source-repository=<value>    Source repository for the topology metadata
  --metadata-terraform-workspace=<value>  Terraform workspace name for the topology metadata
  --metadata-version=<value>              Explicit TerraGraph topology version id
  --profile=<value>                       Profile name to resolve from the runtime catalog (overrides runtime config
                                          run.profile)
  --runtimeConfigFile=<value>             Runtime config path (.json/.yaml/.yml) used to load profiles/rules/rule sets
  --terraform-dir=<value>                 Path to the Terraform project directory (defaults to current working
                                          directory)
  --verbose                               Print detailed outoput of each hook and filter applied to the graph

DESCRIPTION
  Generate and render a full Terraform topology with optional change evidence

EXAMPLES
  $ terra-graph topology --runtimeConfigFile ./my-config.yml

  $ terra-graph topology --terraform-dir ./infra --runtimeConfigFile ./my-config.yml

  $ terra-graph topology --change-plan-json-file ./plan.json --metadata-environment prod --metadata-source-ref refs/heads/main --metadata-source-commit abc123 --runtimeConfigFile ./my-config.yml

  $ terra-graph topology --metadata-label team=platform --metadata-label service=payments --runtimeConfigFile ./my-config.yml
```

_See code: [src/commands/topology.ts](https://github.com/terra-graph/terra-graph/blob/v0.1.0/src/commands/topology.ts)_
<!-- commandsstop -->
