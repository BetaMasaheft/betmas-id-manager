before(() => {
	cy.request("POST", "/types/manuscripts/reset", {});
	cy.request("POST", "/types/authority-files/reset", {});
});

it("registers a manuscripts id verbatim, no prefix", () => {
	cy.request("POST", "/ids/manuscripts", { id: "BAVet1" }).then((res) => {
		expect(res.status).to.eq(201);
		expect(res.body).to.include({ id: "BAVet1", type: "manuscripts", mode: "manual" });
	});
});

it("registers an authority-files id verbatim, no prefix (replicates the dead AUT-prefix behavior on purpose)", () => {
	cy.request("POST", "/ids/authority-files", { id: "SomeAuthority1" }).then((res) => {
		expect(res.status).to.eq(201);
		expect(res.body).to.include({ id: "SomeAuthority1", type: "authority-files", mode: "manual" });
	});
});

it("rejects re-registering an already-taken manual id with 409", () => {
	cy.request({ method: "POST", url: "/ids/manuscripts", body: { id: "BAVet1" }, failOnStatusCode: false }).then(
		(res) => {
			expect(res.status).to.eq(409);
		},
	);
});

it("rejects a manual id with unsafe characters with 400", () => {
	cy.request({ method: "POST", url: "/ids/manuscripts", body: { id: "../etc/passwd" }, failOnStatusCode: false }).then(
		(res) => {
			expect(res.status).to.eq(400);
		},
	);
});
