const { defineConfig } = require("cypress");

module.exports = defineConfig({
	e2e: {
		baseUrl: "http://localhost:8080/exist/apps/betmas-id-manager",
		supportFile: false,
		allowCypressEnv: false,
		specPattern: "tests/cypress/e2e/**/*.cy.js",
		screenshotsFolder: "tests/cypress/screenshots",
		videosFolder: "tests/cypress/videos",
		fixturesFolder: "tests/cypress/fixtures",
		trashAssetsBeforeRuns: true,
	},
});
