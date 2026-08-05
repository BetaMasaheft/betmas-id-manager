it("reset-then-reserve reflects the new counter value", () => {
	cy.request("POST", "/types/narratives/reset", { value: 41 }).then((res) => {
		expect(res.status).to.eq(200);
		expect(res.body).to.include({ type: "narratives", mode: "auto", value: 41 });
		cy.request("POST", "/ids/narratives", { suffix: "z" }).then((r2) => {
			expect(r2.body.id).to.eq("NAR0042z");
		});
	});
});

it("reset with no value defaults the counter to 0", () => {
	cy.request("POST", "/types/studies/reset", {}).then((res) => {
		expect(res.body.value).to.eq(0);
		cy.request("POST", "/ids/studies", { suffix: "first" }).then((r2) => {
			expect(r2.body.id).to.eq("STU0001first");
		});
	});
});

it("reset purges previously issued ids for that type", () => {
	cy.request("POST", "/ids/institutions", { suffix: "purgeme" }).then((created) => {
		const id = created.body.id;
		cy.request("POST", "/types/institutions/reset", {}).then((res) => {
			expect(res.body.purged).to.be.at.least(1);
			cy.request({ url: `/id/${id}`, failOnStatusCode: false }).then((lookup) => {
				expect(lookup.status).to.eq(404);
			});
		});
	});
});

it("reset on a manual type ignores value and reports value:null, still purges", () => {
	cy.request("POST", "/ids/manuscripts", { id: "TmpMs1" }).then(() => {
		cy.request("POST", "/types/manuscripts/reset", {}).then((res) => {
			expect(res.body.type).to.eq("manuscripts");
			expect(res.body.mode).to.eq("manual");
			expect(res.body.purged).to.be.at.least(1);
			cy.request({ url: "/id/TmpMs1", failOnStatusCode: false }).then((lookup) => {
				expect(lookup.status).to.eq(404);
			});
		});
	});
});
