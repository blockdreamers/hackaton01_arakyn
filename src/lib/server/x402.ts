// x402 "exact" payment on Base Sepolia, done in-process for the demo:
// the agent wallet signs an EIP-3009 transferWithAuthorization for the call fee, and our
// facilitator (the admin wallet, which pays gas) submits it. Testnet only.
import { randomBytes } from 'node:crypto';
import {
	createPublicClient,
	createWalletClient,
	formatUnits,
	http,
	parseUnits,
	toHex,
	type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { env } from 'node:process';

export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RPC = 'https://sepolia.base.org';

const AUTH_TYPES = {
	TransferWithAuthorization: [
		{ name: 'from', type: 'address' },
		{ name: 'to', type: 'address' },
		{ name: 'value', type: 'uint256' },
		{ name: 'validAfter', type: 'uint256' },
		{ name: 'validBefore', type: 'uint256' },
		{ name: 'nonce', type: 'bytes32' }
	]
} as const;

const USDC_ABI = [
	{
		name: 'transferWithAuthorization',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'from', type: 'address' },
			{ name: 'to', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'validAfter', type: 'uint256' },
			{ name: 'validBefore', type: 'uint256' },
			{ name: 'nonce', type: 'bytes32' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: []
	},
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'a', type: 'address' }],
		outputs: [{ type: 'uint256' }]
	}
] as const;

const key = (name: string): Hex => {
	const v = env[name]?.trim();
	if (!v) throw new Error(`${name} is not set`);
	return (v.startsWith('0x') ? v : `0x${v}`) as Hex;
};

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

export const explorerTx = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;

/** Pays `amountUsdc` from the agent wallet to PAYTO_ADDRESS and waits for the receipt. */
export async function payCallFee(amountUsdc: number) {
	const agent = privateKeyToAccount(key('AGENT_WALLET_PRIVATE_KEY'));
	const facilitator = privateKeyToAccount(key('ADMIN_BASE_SEPOLIA_WALLET_PRIVATE_KEY'));
	const payTo = key('PAYTO_ADDRESS');
	const now = Math.floor(Date.now() / 1000);
	const message = {
		from: agent.address,
		to: payTo,
		value: parseUnits(String(amountUsdc), 6),
		validAfter: BigInt(now - 60),
		validBefore: BigInt(now + 600),
		nonce: toHex(randomBytes(32))
	};
	const signature = await agent.signTypedData({
		domain: {
			name: 'USDC',
			version: '2',
			chainId: baseSepolia.id,
			verifyingContract: USDC_BASE_SEPOLIA
		},
		types: AUTH_TYPES,
		primaryType: 'TransferWithAuthorization',
		message
	});
	const wallet = createWalletClient({ account: facilitator, chain: baseSepolia, transport: http(RPC) });
	const hash = await wallet.writeContract({
		address: USDC_BASE_SEPOLIA,
		abi: USDC_ABI,
		functionName: 'transferWithAuthorization',
		args: [
			message.from,
			message.to,
			message.value,
			message.validAfter,
			message.validBefore,
			message.nonce,
			signature
		]
	});
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	return {
		hash,
		url: explorerTx(hash),
		ok: receipt.status === 'success',
		from: agent.address,
		to: payTo
	};
}

export async function usdcBalance(address: Hex) {
	const raw = await publicClient.readContract({
		address: USDC_BASE_SEPOLIA,
		abi: USDC_ABI,
		functionName: 'balanceOf',
		args: [address]
	});
	return Number(formatUnits(raw, 6));
}
