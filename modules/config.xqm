xquery version "3.1";

(:~
 : Central table of known entity types and where this app's state lives.
 : Single source of truth, replacing the inline prefix `switch` duplicated
 : across betmasweb/BetMas's edit/save-new-entity.xql.
 :)
module namespace config = "https://betamasaheft.eu/betmas-id-manager/config";

(:~
 : The location of the data
 :)
declare variable $config:data-collection := "/db/apps/betmas-id-manager-data";

(:~
 : The counters document, used for automatically assigned IDs
 :)
declare variable $config:counters-doc := $config:data-collection || "/counters.xml";

declare variable $config:ids-collection := $config:data-collection || "/ids";

(:~
 : "auto" types: this service computes prefix + zero-padded sequence + caller
 : suffix.
 : "manual" types: caller supplies the full id verbatim (no prefix,
 : no sequence) - matches manuscripts/authority-files
 :)
declare variable $config:types := map {
	"works": map {"prefix": "LIT", "mode": "auto"},
	"studies": map {"prefix": "STU", "mode": "auto"},
	"narratives": map {"prefix": "NAR", "mode": "auto"},
	"persons": map {"prefix": "PRS", "mode": "auto"},
	"places": map {"prefix": "LOC", "mode": "auto"},
	"institutions": map {"prefix": "INS", "mode": "auto"},
	"manuscripts": map {"prefix": (), "mode": "manual"},
	"authority-files": map {"prefix": (), "mode": "manual"}
};

declare function config:is-known-type($type as xs:string?) as xs:boolean {
	exists($type) and map:contains($config:types, $type)
};

declare function config:type-info($type as xs:string) as map(*)? {
	map:get($config:types, $type)
};

declare function config:known-types() as xs:string* {
	map:keys($config:types)
};
