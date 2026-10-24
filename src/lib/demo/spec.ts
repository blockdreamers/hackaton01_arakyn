/** Normalized search spec extracted from a buyer's free-text request. */
export interface Spec {
	/** Free-form product category, e.g. "magnet", "LED", "socket cap screw". */
	category: string;
	/** Keywords in Korean as Korean sellers write them (the index is mostly Korean). */
	search_terms_ko: string[];
	search_terms_en: string[];
	/** Words every matching product name must contain. */
	must_include: string[];
	/** Spec values the buyer stated, e.g. {field: "thread", value: "M4"}. */
	attributes: { field: string; value: string }[];
	max_unit_price: number | null;
	currency: string | null;
	qty: number | null;
	ship_to: string | null;
	ambiguities: string[];
	summary: string;
}
