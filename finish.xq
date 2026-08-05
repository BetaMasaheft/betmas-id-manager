xquery version "3.1";

declare namespace sm = "http://exist-db.org/xquery/securitymanager";

declare variable $target external;

(:~
 : Runs on every install/upgrade of an already-deployed instance, so this
 : must be idempotent: never reseed counters.xml if it already exists, or a
 : redeploy would silently wipe live counter state.
 :
 : The data collection is deliberately NOT nested under $target (this app's
 : own deployed collection, /db/apps/betmas-id-manager): eXist's package
 : deployment removes and recreates that whole tree on reinstall/upgrade -
 : confirmed empirically, a forced reinstall during development wiped
 : everything stored there, counters included. A sibling collection under
 : /db/apps, outside this app's own lifecycle, is what actually survives a
 : redeploy - matches how betmasweb's corpus lives at /db/apps/expanded
 : rather than nested inside /db/apps/BetMasWeb.
 :)

declare variable $local:apps-collection := "/db/apps";

declare variable $local:data-collection := $local:apps-collection || "/betmas-id-manager-data";

declare variable $local:ids-collection := $local:data-collection || "/ids";

declare variable $local:counters-doc := $local:data-collection || "/counters.xml";

declare variable $local:auto-types := ("works", "studies", "narratives", "persons", "places", "institutions");

(:~
 : world-writable so unauthenticated REST requests (running as guest) can store/update data.
 :)
declare function local:open-up($collection-or-resource as xs:string) {
	sm:chmod(xs:anyURI($collection-or-resource), "rwxrwxrwx")
};

(
	if (xmldb:collection-available($local:data-collection)) then (
	) else (
		xmldb:create-collection($local:apps-collection, "betmas-id-manager-data"), local:open-up($local:data-collection)
	),
	if (xmldb:collection-available($local:ids-collection)) then (
	) else (
		xmldb:create-collection($local:data-collection, "ids"), local:open-up($local:ids-collection)
	),
	if (doc-available($local:counters-doc)) then (
	) else (
		xmldb:store(
			$local:data-collection,
			"counters.xml",
			<counters xmlns="https://betamasaheft.eu/betmas-id-manager">
				{
					for $type in $local:auto-types
					return <counter type="{ $type }">0</counter>
				}
			</counters>
		),
		local:open-up($local:counters-doc)
	),
	util:log("info", "betmas-id-manager initialized")
)
