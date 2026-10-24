<script lang="ts">
	import { t } from './i18n.svelte.ts';

	const year = new Date().getFullYear();
</script>

<div class="site-footer">
	<div class="footer-inner">
		<footer class="footer">
			<div class="footer-brand">
				<a class="brand" href="/"
					><img src="/brand/logo-color.png" alt="Agent Catalog" width="186" height="31" /></a
				>
				<p>
					{t('A buyable-parts index for AI agents.', 'AI 에이전트를 위한 구매 가능한 부품 인덱스.')}
				</p>
			</div>
			<div class="footer-cols">
				<div>
					<h4>{t('Demo', '데모')}</h4>
					<a href="/#race">{t('Token race', '토큰 레이스')}</a><a href="/#monitor"
						>{t('Data monitor', '데이터 모니터')}</a
					><a href="/pricing">{t('Pricing', '요금')}</a>
				</div>
				<div>
					<h4>{t('Data', '데이터')}</h4>
					<a href="/#features">{t('Why agents', '왜 에이전트인가')}</a><a href="/#monitor"
						>{t('Live database', '실시간 데이터베이스')}</a
					><a href="/pricing">{t('Payment routes', '결제 방식')}</a>
				</div>
				<div>
					<h4>{t('Account', '계정')}</h4>
					<a href="/account">{t('My account', '내 계정')}</a>
				</div>
			</div>
		</footer>
		<p class="copyright">
			© {year} Agent Catalog. {t(
				'Built for the agent economy.',
				'에이전트 경제를 위해 만들었습니다.'
			)}
		</p>
	</div>
</div>

<style>
	.brand img {
		display: block;
		width: auto;
	}
	.site-footer {
		position: relative;
		z-index: 1;
		background: #fff;
		color: #111827;
	}
	.footer-inner {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 64px 24px 40px;
	}
	.footer .brand img {
		height: 31px;
	}
	.footer {
		display: flex;
		justify-content: space-between;
		gap: 48px;
		flex-wrap: wrap;
	}
	.footer-brand p {
		margin-top: 14px;
		color: #4b5563;
		font-size: 14px;
	}
	.footer-cols {
		display: flex;
		gap: 56px;
		flex-wrap: wrap;
	}
	.footer-cols div {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 14px;
		color: #4b5563;
	}
	.footer-cols h4 {
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #9ca3af;
		font-weight: 600;
	}
	.footer-cols a:hover {
		color: var(--brand);
	}
	.copyright {
		margin-top: 48px;
		padding-top: 24px;
		border-top: 1px solid #e5e7eb;
		text-align: center;
		font-size: 13px;
		color: #9ca3af;
	}
	@media (max-width: 560px) {
		.footer {
			flex-direction: column;
		}
	}
</style>
