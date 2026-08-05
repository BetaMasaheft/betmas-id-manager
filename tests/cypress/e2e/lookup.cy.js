before(() => {
	cy.request("POST", "/types/works/reset", {});
});

it("GET /id/{id} returns the full record for a known id", () => {
	cy.request("POST", "/ids/works", { suffix: "Known" }).then((created) => {
		const id = created.body.id;
		cy.request(`/id/${id}`).then((res) => {
			expect(res.status).to.eq(200);
			expect(res.body.id).to.eq(id);
			expect(res.body).to.have.property("createdAt");
		});
	});
});

it("GET /id/{id} returns 404 for an unknown id", () => {
	cy.request({ url: "/id/DOES_NOT_EXIST", failOnStatusCode: false }).then((res) => {
		expect(res.status).to.eq(404);
	});
});
