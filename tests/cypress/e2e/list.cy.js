before(() => {
	cy.request("POST", "/types/works/reset", {});
	cy.request("POST", "/types/persons/reset", {});
	cy.request("POST", "/ids/works", { suffix: "a" });
	cy.request("POST", "/ids/persons", { suffix: "b" });
});

it("GET /ids lists issued ids unfiltered", () => {
	cy.request("/ids").then((res) => {
		expect(res.status).to.eq(200);
		expect(res.body.length).to.be.at.least(2);
	});
});

it("GET /ids?type=works filters to that type only", () => {
	cy.request("/ids?type=works").then((res) => {
		expect(res.status).to.eq(200);
		expect(res.body).to.be.an("array").that.is.not.empty;
		res.body.forEach((entry) => expect(entry.type).to.eq("works"));
	});
});

it("GET /ids?type=bogus returns 400", () => {
	cy.request({ url: "/ids?type=bogus", failOnStatusCode: false }).then((res) => {
		expect(res.status).to.eq(400);
	});
});
