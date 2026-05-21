# Commands
  <!-- commands -->
* [`terra-graph diagram`](#terra-graph-diagram)
* [`terra-graph diagram:from-dot`](#terra-graph-diagramfrom-dot)

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

  $ terra-graph diagram --terraform-dir ./infra --runtimeConfigFile ./my-config.yml

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
    [--dot-input <value>]

FLAGS
  --continueOnError            Continue to process graph and attenmpt to generate a diagram even if an error is
                               encountered
  --dot-input=<value>          Path to a DOT file. If omitted, command reads DOT input from stdin.
  --profile=<value>            Profile name to resolve from the runtime catalog (overrides runtime config run.profile)
  --runtimeConfigFile=<value>  Runtime config path (.json/.yaml/.yml) used to load profiles/rules/rule sets
  --verbose                    Print detailed outoput of each hook and filter applied to the graph

DESCRIPTION
  Render a diagram from Terraform DOT input

EXAMPLES
  $ terra-graph diagram:from-dot --dot-input ./graph.dot --runtimeConfigFile ./my-config.yml

  terraform graph | terra-graph diagram:from-dot --runtimeConfigFile ./my-config.yml
```

_See code: [src/commands/diagram/from-dot.ts](https://github.com/terra-graph/terra-graph/blob/v0.1.0/src/commands/diagram/from-dot.ts)_
<!-- commandsstop -->
