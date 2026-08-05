const AUTO_TYPES = [
	{ type: "works", prefix: "LIT" },
	{ type: "studies", prefix: "STU" },
	{ type: "narratives", prefix: "NAR" },
	{ type: "persons", prefix: "PRS" },
	{ type: "places", prefix: "LOC" },
	{ type: "institutions", prefix: "INS" },
];

before(() => {
	AUTO_TYPES.forEach(({ type }) => cy.request("POST", `/types/${type}/reset`, {}));
});

AUTO_TYPES.forEach(({ type, prefix }) => {
	it(`POST /ids/${type} reserves ${prefix}0001<suffix>`, () => {
		cy.request("POST", `/ids/${type}`, { suffix: "Foo" }).then((res) => {
			expect(res.status).to.eq(201);
			expect(res.body.id).to.eq(`${prefix}0001Foo`);
			expect(res.body.sequence).to.eq(1);
			expect(res.body.mode).to.eq("auto");
		});
	});
});

it("sequential reserves increment cleanly with no collisions", () => {
	cy.request("POST", "/types/works/reset", {})
		.then(() => cy.request("POST", "/ids/works", { suffix: "a" }))
		.then((r1) => {
			expect(r1.body.id).to.eq("LIT0001a");
			return cy.request("POST", "/ids/works", { suffix: "b" });
		})
		.then((r2) => {
			expect(r2.body.id).to.eq("LIT0002b");
			return cy.request("POST", "/ids/works", { suffix: "c" });
		})
		.then((r3) => {
			expect(r3.body.id).to.eq("LIT0003c");
		});
});

it("replaces spaces in the suffix with underscores", () => {
	cy.request("POST", "/types/persons/reset", {})
		.then(() => cy.request("POST", "/ids/persons", { suffix: "John Doe" }))
		.then((res) => {
			expect(res.body.id).to.eq("PRS0001John_Doe");
		});
});

it("pads to 4 digits up to 999, then goes unpadded beyond (save-new-entity.xql parity)", () => {
	cy.request("POST", "/types/places/reset", { value: 998 })
		.then(() => cy.request("POST", "/ids/places", { suffix: "x" }))
		.then((r1) => {
			expect(r1.body.id).to.eq("LOC0999x");
			return cy.request("POST", "/ids/places", { suffix: "y" });
		})
		.then((r2) => {
			expect(r2.body.id).to.eq("LOC1000y");
		});
});
