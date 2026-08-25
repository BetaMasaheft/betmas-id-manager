xquery version "3.1" encoding "UTF-8";

(: This namespace declaration is needed for Roaster :)
declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";
declare namespace api = "https://betamasaheft.eu/betmas-id-manager/api";
declare namespace bimerrors = "https://betamasaheft.eu/betmas-id-manager/errors";

import module namespace roaster = "http://e-editiones.org/roaster";
import module namespace errors = "http://e-editiones.org/roaster/errors";
import module namespace config = "https://betamasaheft.eu/betmas-id-manager/config" at "./config.xqm";
import module namespace ids = "https://betamasaheft.eu/betmas-id-manager/ids" at "./ids.xqm";

declare variable $api:definitions := ("api.json");

(:~
 : GET /types
 :)
declare function api:list-types($request as map(*)) {
	roaster:response(200, array { ids:list-types() })
};

(:~
 : POST /ids/{type}
 : Bad type / wrong mode / invalid input all raise $errors:BAD_REQUEST from
 : inside ids.xqm - roaster's router maps that to 400 without any catch
 : needed here. Only the 409 conflict case (no roaster equivalent) needs an
 : explicit catch.
 :)
declare function api:reserve-id($request as map(*)) {
	let $type := $request?parameters?type
	return try {
		if (not(config:is-known-type($type))) then
			error($errors:BAD_REQUEST, "unknown type: " || ($type, "(missing)")[1])
		else if (config:type-info($type)?mode eq "auto") then
			roaster:response(201, ids:reserve-auto-id($type, $request?body?suffix))
		else
			roaster:response(201, ids:register-manual-id($type, $request?body?id))
	} catch bimerrors:CONFLICT { roaster:response(409, map {"error": $err:description}) }
};

(:~
 : GET /id/{id}
 :)
declare function api:get-id($request as map(*)) {
	let $id := $request?parameters?id
	let $result := ids:get-id($id)
	return if (exists($result)) then
		roaster:response(200, $result)
	else
		error($errors:NOT_FOUND, "unknown id: " || $id)
};

(: GET /ids?type= :)
declare function api:list-ids($request as map(*)) {
	roaster:response(200, array { ids:list-ids($request?parameters?type) })
};

(:~
 : POST /types/{type}/reset
 :)
declare function api:reset-type($request as map(*)) {
	let $type := $request?parameters?type
	let $rawValue := $request?body?value
	let $value := if (exists($rawValue)) then
		xs:integer($rawValue)
	else (
	)
	return roaster:response(200, ids:reset-type($type, $value))
};

(:~
 : POST /types/{type}/seed
 : Bulk-registers ids from a caller-supplied list, skipping any already
 : registered - idempotent, for one-time seeding from an external system of
 : record. Manual types only; $errors:BAD_REQUEST covers both unknown type
 : and auto-type misuse.
 :)
declare function api:seed-manual($request as map(*)) {
	let $type := $request?parameters?type
	(: JSON arrays decode to XQuery array(*), not xs:string* - unbox with ?* :)
	let $ids := $request?body?ids?*
	return roaster:response(200, ids:seed-manual-ids($type, $ids))
};

declare function api:lookup($name as xs:string) {
	function-lookup(xs:QName($name), 1)
};

roaster:route($api:definitions, api:lookup#1)
