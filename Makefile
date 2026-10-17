.PHONY: help install lint lint-md links secrets secrets-render render validate-c4 check

help: ## List targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-12s %s\n", $$1, $$2}'

install: ## Install markdownlint and the secrets renderer
	pnpm install --frozen-lockfile

lint: lint-md secrets ## markdownlint + secrets inventory check

lint-md: ## Lint every Markdown file
	pnpm run lint:md

links: ## Check links with lychee (Docker)
	MSYS_NO_PATHCONV=1 docker run --rm -v "$(CURDIR):/input" -w /input lycheeverse/lychee:0.24.2 --config lychee.toml --no-progress .

secrets: ## Fail if secrets/README.md is out of date with inventory.yaml
	pnpm run secrets:check

secrets-render: ## Re-render secrets/README.md from inventory.yaml
	pnpm run secrets:render

validate-c4: ## Validate c4/workspace.dsl (Docker)
	MSYS_NO_PATHCONV=1 docker run --rm -v "$(CURDIR)/c4:/c4" structurizr/cli:2025.11.09 validate -workspace /c4/workspace.dsl

render: ## Render every C4 view to c4/rendered (Docker)
	bash scripts/render-c4.sh

check: lint links validate-c4 ## Everything CI runs
