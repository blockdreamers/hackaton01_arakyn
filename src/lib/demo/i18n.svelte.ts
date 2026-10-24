// English / Korean switch for the public site. Copy stays inline next to its markup:
// t('English text', '한국어 문장') returns the one for the current language and re-renders on switch.
// The choice is remembered per browser; the server always renders English and the client switches
// on load.
export type Lang = 'en' | 'ko';

const KEY = 'agent-catalog-lang';

export const i18n = $state({ lang: 'en' as Lang });

export const t = (en: string, ko: string) => (i18n.lang === 'ko' ? ko : en);

export function setLang(lang: Lang) {
	i18n.lang = lang;
	document.documentElement.lang = lang;
	try {
		localStorage.setItem(KEY, lang);
	} catch {
		// not remembered
	}
}

export function initLang() {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === 'en' || saved === 'ko') setLang(saved);
	} catch {
		// storage unavailable: stay English
	}
}
