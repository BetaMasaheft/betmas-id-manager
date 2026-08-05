xquery version "3.1";

(:~
 : Pure business logic for id reservation/registration/lookup. Deliberately
 : has no roaster/HTTP concepts anywhere in this module so it stays directly
 : callable (and directly `xst eval`-able) without a request map in scope -
 : modules/api.xql is a thin wrapper on top of this.
 :
 : Known accepted gap: manual-mode registration (register-manual-id) is a
 : plain check-then-store, not atomic - eXist's xmldb:store() has no
 : create-if-absent mode. Two simultaneous registrations of the literal same
 : id string could theoretically both pass the existence check before either
 : stores. Low-probability in practice (manual ids are distinct, human-typed
 : manuscript/authority-file sigla, not machine-generated sequences under
 : contention). Auto-mode has no such gap: a given (type, sequence) pair can
 : only ever be issued once by construction, guaranteed by the atomic counter
 : increment below.
 :)
module namespace ids = "https://betamasaheft.eu/betmas-id-manager/ids";

declare namespace bim = "https://betamasaheft.eu/betmas-id-manager";

import module namespace config = "https://betamasaheft.eu/betmas-id-manager/config" at "./config.xqm";
import module namespace errors = "http://e-editiones.org/roaster/errors";

declare %private function local:fail-bad-request($message as xs:string) {
	error($errors:BAD_REQUEST, $message)
};

(:~
 : "Manual id already registered" is semantically a 409
 : Conflict, and roaster's fixed error table has no such status.
 : $bimerrors:CONFLICT exists purely to fill that one gap;
 : modules/api.xql catches it explicitly and maps it to 409 itself.
 :
 : See https://github.com/eeditiones/roaster/pull/134
 :)
declare %private function local:fail-conflict($message as xs:string) {
	error(fn:QName("https://betamasaheft.eu/betmas-id-manager/errors", "CONFLICT"), $message)
};

declare %private function local:require-known-type($type as xs:string?) as map(*) {
	if (not(config:is-known-type($type))) then
		local:fail-bad-request("unknown type: " || ($type, "(missing)")[1])
	else
		config:type-info($type)
};

(: formatting helpers, deliberately replicating save-new-entity.xql's
      exact quirks :)

declare %private function local:format-sequence($seq as xs:integer) as xs:string {
	if ($seq > 999) then
		xs:string($seq)
	else
		format-number($seq, "0000")
};

declare %private function local:normalize-suffix($suffix as xs:string?) as xs:string {
	replace(($suffix, "")[1], " ", "_")
};

declare %private function local:is-safe-id($id as xs:string?) as xs:boolean {
	exists($id) and string-length($id) gt 0 and matches($id, "^[\w.-]+$")
};

(: -- storage helpers -- :)

declare %private function local:doc-path($id as xs:string) as xs:string {
	$config:ids-collection || "/" || $id || ".xml"
};

declare %private function local:to-map($node as element(bim:issued-id)) as map(*) {
	map:merge(
		(
			map {"id": string($node/@id)},
			map {"type": string($node/@type)},
			map {"mode": string($node/@mode)},
			map {"createdAt": string($node/@createdAt)},
			if ($node/@prefix) then
				map {"prefix": string($node/@prefix)}
			else (
			),
			if ($node/@sequence) then
				map {"sequence": xs:integer($node/@sequence)}
			else (
			),
			if ($node/@suffix) then
				map {"suffix": string($node/@suffix)}
			else (
			)
		)
	)
};

declare %private function local:store-issued-id($node as element(bim:issued-id)) as map(*) {
	let $id := string($node/@id)
	let $_ := xmldb:store($config:ids-collection, $id || ".xml", $node)
	let $_ := sm:chmod(xs:anyURI(local:doc-path($id)), "rwxrwxrwx")
	return local:to-map($node)
};

declare %private function local:now() as xs:string {
	xs:string(current-dateTime())
};

(:~
 : Set a counter using a lock. to a specified value
 :
 : NOTE, use manual locks to prevent parallel requests from giving out the same ID multiple times.
 :)
declare %private function local:locked-set-counter($type as xs:string, $newValue as xs:integer) as xs:integer {
	let $counterNode := doc($config:counters-doc)/bim:counters/bim:counter[@type = $type]
	return util:exclusive-lock($counterNode, (update value $counterNode with $newValue, $newValue))
};

(:~
 : Set a counter using a lock. to the next available value
 :
 : NOTE, use manual locks to prevent parallel requests from giving out the same ID multiple times.
 :)
declare %private function local:locked-next-sequence($type as xs:string) as xs:integer {
	let $counterNode := doc($config:counters-doc)/bim:counters/bim:counter[@type = $type]
	return util:exclusive-lock(
		$counterNode,
		(
			let $new := xs:integer($counterNode) + 1
			return (update value $counterNode with $new, $new)
		)
	)
};

(: -- public API -- :)

declare function ids:list-types() as map(*)* {
	for $type in config:known-types()
	let $info := config:type-info($type)
	order by $type
	return map {"type": $type, "prefix": $info?prefix, "mode": $info?mode}
};

declare function ids:id-exists($id as xs:string) as xs:boolean {
	doc-available(local:doc-path($id))
};

declare function ids:get-id($id as xs:string) as map(*)? {
	let $doc := local:doc-path($id)
	return if (doc-available($doc)) then
		local:to-map(doc($doc)/bim:issued-id)
	else (
	)
};

declare function ids:list-ids($type as xs:string?) as map(*)* {
	let $_ := if (exists($type)) then
		local:require-known-type($type)
	else (
	)
	for $node in collection($config:ids-collection)/bim:issued-id[not($type) or @type = $type]
	order by string($node/@createdAt)
	return local:to-map($node)
};

(:~
 : Some IDs are auto incrementing. Some other can be assigned manually, but only if they are not yet given out.
 : Reserve an auto-incrementing ID. Used for works, studies, narratives, persons, places and institutions
 :)
declare function ids:reserve-auto-id($type as xs:string, $suffix as xs:string?) as map(*) {
	let $info := local:require-known-type($type)
	return if ($info?mode ne "auto") then
		local:fail-bad-request("type '" || $type || "' is not auto-numbered; use register-manual-id")
	else
		let $seq := local:locked-next-sequence($type)
		let $prefix := $info?prefix
		let $normalizedSuffix := local:normalize-suffix($suffix)
		let $id := $prefix || local:format-sequence($seq) || $normalizedSuffix
		let $node := <bim:issued-id
			createdAt="{ local:now() }"
			id="{ $id }"
			mode="auto"
			prefix="{ $prefix }"
			sequence="{ $seq }"
			suffix="{ $normalizedSuffix }"
			type="{ $type }" />
		return local:store-issued-id($node)
};

(:~
 : Assign a manually chosen ID. Used for manuscripts and authority-files
 :)
declare function ids:register-manual-id($type as xs:string, $id as xs:string?) as map(*) {
	let $info := local:require-known-type($type)
	return if ($info?mode ne "manual") then
		local:fail-bad-request("type '" || $type || "' is auto-numbered; use reserve-auto-id")
	else if (not(local:is-safe-id($id))) then
		local:fail-bad-request("id is required and must match ^[\w.-]+$")
	else if (ids:id-exists($id)) then
		local:fail-conflict("id already registered: " || $id)
	else
		let $node := <bim:issued-id createdAt="{ local:now() }" id="{ $id }" mode="manual" type="{ $type }" />
		return local:store-issued-id($node)
};

(:~
 : Reset the counter for a specific type.
 :)
declare function ids:reset-type($type as xs:string, $value as xs:integer?) as map(*) {
	let $info := local:require-known-type($type)
	let $toPurge := collection($config:ids-collection)/bim:issued-id[@type = $type]
	let $purgedCount := count($toPurge)
	let $_ :=
		for $node in $toPurge
		return xmldb:remove($config:ids-collection, string($node/@id) || ".xml")
	let $resetValue := if ($info?mode eq "auto") then
		local:locked-set-counter($type, ($value, 0)[1])
	else (
	)
	return map {"type": $type, "mode": $info?mode, "value": $resetValue, "purged": $purgedCount}
};
