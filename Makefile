.PHONY: test typecheck demo install
test:
	npm test
typecheck:
	npm run typecheck
demo:
	npm run demo
install:
	npm install -g .