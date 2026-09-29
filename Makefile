PYTHON ?= python3

.PHONY: test lint precommit
test:
	npm run check
	$(PYTHON) -m pytest -q tests/publication

lint:
	npm run typecheck:server

precommit: lint test
	git diff --check
