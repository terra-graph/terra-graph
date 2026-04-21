# Terra Graph

Auto-generated arhitecture diagrams from your terraform code.

## Requirements

`terra-graph` manipulates the output from the `terraform graph` command and turns it into something useable and sensible which can then be rendered to an image. To do this the following things are required:

- `terraform` - duh!
- `graphviz` - the output from `terraform graph` is in the `dot` format which is readable by graphviz and used by graphviz to generate a graphical representation of the graph. [Graphviz can be found here](https://graphviz.org/download/)

## Installation

Install via npm:

```bash
// globally
npm install -g @terra-graph/terra-graph
```

Or globally via yarn:

```bash
// globally
yarn global add @terra-graph/terra-graph
```

## Basic Use

### Step 1

Generate the initial graph using terraform graph:

```bash
cd /my/terraform
terraform init
terraform graph > graph.txt
```

This probably won't be sufficient for most projects though. See "How to properly generate then initial graph" for more details.

### Step 2

Use `terra-graph diagram:from-dot` to parse the graph, apply formatting/filtering, and output a diagram:

```bash
cat graph.txt | terra-graph diagram:from-dot
```

This will use the default settings to generate an image called `terra-graph.png` in the location you ran the command.

### Help

```bash
terra-graph [command] --help
```

## Recommended Terraform-first flow using `terra-graph diagram`

In most projects you will be using a state file of some kind to manage the changes in your infrastructure. What `terraform graph` actually does is generat a graph of what actions it needs to complete (and in what order). Unless you are running `terra-graph` on brand new infrastructure it won't generate an accurate diagram as it will be using the diff of what new changes are needed. You also will likely have custom backend configuration (that might require credentials etc) for your terraform state.

To overcome this, `terra-graph` provides a command that runs a no-backend Terraform init and then attempts a best-effort plan-decorated render.

```bash
terra-graph diagram --profile edf.aws.dot
```

This runs:
- `terraform init -backend=false -input=false`
- `terraform plan -refresh=false -lock=false -input=false -out=<temp>/terra-graph.tfplan`
- `terraform graph -plan=<temp>/terra-graph.tfplan`
- `terraform show -json <temp>/terra-graph.tfplan`

By default `terra-graph` runs Terraform with `TF_DATA_DIR` in an OS temp workspace and writes the plan artifact to OS temp as well (unless you pass `--plan-file`).

If plan/show fails (for example provider/data-source credential constraints), it falls back to plain `terraform graph` and still renders.

If you want graph-only mode (no plan/show step):

```bash
terra-graph diagram --no-plan --profile edf.aws.dot
```

## Quick Start Use

```bash
# generate the graph from terraform and render in one command
terra-graph diagram --profile edf.aws.dot
```

Or more simply:

```bash
terraform graph | terra-graph diagram:from-dot --profile edf.aws.dot
```

## Detailed Documentation

- [Diagram Configuration](./docs/configuration.md) - how to filter nodes, change the appearance, create a description box etc.
- [Hooks](./docs/hooks.md) - how to modify the diagram and filter elements using hooks, when and where to use them.
  - [Matchers](./docs/matchers.md) - built-in node matchers, how to write custom matchers. Matchers are used to identify elements in the graph to either filter or modify.
- [All terra-graph Commands](./docs/commands.md) - a list of all `terra-graph` commands
