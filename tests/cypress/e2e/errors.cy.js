it("POST /ids/{unknownType} returns 400", () => {
	cy.request({ method: "POST", url: "/ids/not-a-real-type", body: {}, failOnStatusCode: false }).then((res) => {
		expect(res.status).to.eq(400);
	});
});

it("POST /ids/manuscripts without an id returns 400", () => {
	cy.request({ method: "POST", url: "/ids/manuscripts", body: {}, failOnStatusCode: false }).then((res) => {
		expect(res.status).to.eq(400);
	});
});

it("POST /ids/works with a manual-shaped body (id instead of suffix) still succeeds - id is simply ignored, suffix defaults empty", () => {
	// documents current behavior: auto-mode only reads `suffix` from the body,
	// so a caller sending `id` for an auto type gets a normal auto-numbered id
	cy.request("POST", "/types/works/reset", {}).then(() => {
		cy.request("POST", "/ids/works", { id: "ignored" }).then((res) => {
			expect(res.status).to.eq(201);
			expect(res.body.id).to.eq("LIT0001");
		});
	});
});

it("POST /types/{unknownType}/reset returns 400", () => {
	cy.request({ method: "POST", url: "/types/not-a-real-type/reset", body: {}, failOnStatusCode: false }).then((res) => {
		expect(res.status).to.eq(400);
	});
});
