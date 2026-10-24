<script lang="ts">
	import { t } from './i18n.svelte.ts';
</script>

<div class="tiers">
	<div class="tier">
		<span class="tier-tag">{t('Free', '무료')}</span>
		<div class="tier-price">1,000 <small>{t('calls / month', '회 / 월')}</small></div>
		<p>
			{t(
				'Previews and full offers up to the quota. No card, no wallet.',
				'한도 안에서는 미리보기와 전체 결과 모두 무료. 카드도 지갑도 필요 없습니다.'
			)}
		</p>
	</div>
	<div class="tier hot">
		<span class="tier-tag">{t('Bulk', '대량')}</span>
		<div class="tier-price">
			$0.02 <small>{t('per call after quota', '한도 초과 시 호출당')}</small>
		</div>
		<p>
			{t(
				'Volume pricing for agents that search all day. Search previews stay free.',
				'하루 종일 검색하는 에이전트를 위한 사용량 요금. 검색 미리보기는 계속 무료입니다.'
			)}
		</p>
	</div>
</div>

<style>
	.tiers {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
		max-width: 860px;
		margin: 0 auto;
	}
	.tier {
		padding: 28px;
		border-radius: var(--radius);
		background: var(--glass);
		border: 1px solid var(--line);
		backdrop-filter: blur(14px);
	}
	.tier.hot {
		border-color: var(--brand-line);
		background:
			radial-gradient(120% 120% at 0% 0%, rgba(31, 75, 255, 0.14), transparent 55%), var(--glass-2);
	}
	.tier-tag {
		font: 600 11px var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.tier-price {
		margin: 12px 0 8px;
		font-size: 36px;
		font-weight: 800;
	}
	.tier-price small {
		font-size: 15px;
		font-weight: 500;
		color: var(--muted);
	}
	.tier p {
		color: var(--muted);
		font-size: 15px;
		line-height: 1.6;
	}
	.tiers {
		margin-bottom: 24px;
	}
	@media (max-width: 980px) {
		.tiers {
			grid-template-columns: 1fr;
		}
	}
</style>
