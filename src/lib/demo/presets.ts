// Preset questions for the search dock. Each one has matching products in the connected DB
// (iaansci science-kit parts), and a ready spec so preset runs skip the extraction call.
import type { Spec } from './spec.ts';

export type PresetId = 'magnet' | 'battery-holder' | 'led' | 'motor';

export interface Preset {
	id: PresetId;
	label: string;
	question: string;
	spec: Spec;
}

const base = { attributes: [], ship_to: 'KR', currency: 'KRW', ambiguities: [] };

export const PRESETS: Preset[] = [
	{
		id: 'magnet',
		label: '네오디움 자석',
		question: '수업용 네오디움 자석(원형) 100개가 필요해. 개당 가장 싼 곳 3개 알려줘.',
		spec: {
			...base,
			category: 'magnet',
			search_terms_ko: ['네오디움자석', '네오디움 자석', 'ND자석'],
			search_terms_en: ['neodymium magnet'],
			must_include: ['자석'],
			max_unit_price: null,
			qty: 100,
			summary: 'Round neodymium magnets for class use, 100 pcs, cheapest 3 per unit.'
		}
	},
	{
		id: 'battery-holder',
		label: 'AA 건전지 홀더',
		question: 'AA 건전지 2구 홀더 50개, 개당 1,000원 이하로 찾아줘.',
		spec: {
			...base,
			category: 'battery holder',
			search_terms_ko: ['건전지홀더', '건전지 홀더'],
			search_terms_en: ['AA battery holder'],
			must_include: ['홀더'],
			attributes: [
				{ field: 'size', value: 'AA' },
				{ field: 'slots', value: '2' }
			],
			max_unit_price: 1000,
			qty: 50,
			summary: 'AA battery holder, 2 slots, 50 pcs, at most 1,000 KRW each.'
		}
	},
	{
		id: 'led',
		label: '5mm 고휘도 LED',
		question: '5mm 고휘도 빨간색 LED 200개, 개당 200원 이하인 것.',
		spec: {
			...base,
			category: 'LED',
			search_terms_ko: ['고휘도 LED', 'LED 다이오드'],
			search_terms_en: ['5mm high brightness LED red'],
			must_include: ['LED'],
			attributes: [
				{ field: 'diameter_mm', value: '5' },
				{ field: 'color', value: 'red' }
			],
			max_unit_price: 200,
			qty: 200,
			summary: '5 mm high-brightness red LED, 200 pcs, at most 200 KRW each.'
		}
	},
	{
		id: 'motor',
		label: '130 전동모터',
		question: '과학 수업용 130 전동모터 100개, 가장 싼 곳 3개 비교해줘.',
		spec: {
			...base,
			category: 'motor',
			search_terms_ko: ['130전동모터', '전동모터', '130 모터'],
			search_terms_en: ['130 DC motor'],
			must_include: ['모터'],
			max_unit_price: null,
			qty: 100,
			summary: '130-size DC motor for science class, 100 pcs, cheapest 3.'
		}
	}
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p])) as Record<
	PresetId,
	Preset
>;
