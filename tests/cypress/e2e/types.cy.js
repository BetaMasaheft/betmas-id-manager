it("GET /types lists all 8 known types with correct prefix/mode", () => {
	cy.request("/types").then((res) => {
		expect(res.status).to.eq(200);
		const types = res.body;
		expect(types).to.have.length(8);

		const byType = Object.fromEntries(types.map((t) => [t.type, t]));

		expect(byType.works).to.include({ prefix: "LIT", mode: "auto" });
		expect(byType.studies).to.include({ prefix: "STU", mode: "auto" });
		expect(byType.narratives).to.include({ prefix: "NAR", mode: "auto" });
		expect(byType.persons).to.include({ prefix: "PRS", mode: "auto" });
		expect(byType.places).to.include({ prefix: "LOC", mode: "auto" });
		expect(byType.institutions).to.include({ prefix: "INS", mode: "auto" });
		expect(byType.manuscripts.mode).to.eq("manual");
		expect(byType["authority-files"].mode).to.eq("manual");
	});
});
