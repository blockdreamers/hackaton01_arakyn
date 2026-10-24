<script lang="ts">
	const year = new Date().getFullYear();
</script>

<div class="site-footer">
	<div class="footer-inner">
		<footer class="footer">
			<div class="footer-brand">
				<a class="brand" href="/"
					><img src="/brand/logo-color.png" alt="Agent Catalog" width="186" height="31" /></a
				>
				<p>A buyable-parts index for AI agents.</p>
			</div>
			<div class="footer-cols">
				<div>
					<h4>Demo</h4>
					<a href="/#race">Token race</a><a href="/#monitor">Data monitor</a><a href="/pricing"
						>Pricing</a
					>
				</div>
				<div>
					<h4>Data</h4>
					<a href="/#features">Why agents</a><a href="/#monitor">Live database</a><a href="/pricing"
						>Payment routes</a
					>
				</div>
				<div>
					<h4>Account</h4>
					<a href="/account">My account</a><a href="/dashboard">API keys</a>
				</div>
			</div>
		</footer>
		<p class="copyright">© {year} Agent Catalog. Built for the agent economy.</p>
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
