
## Usage

Basic syntax:

```bash
npx ts-node pathfinder.ts --in <TOKEN_IN> --out <TOKEN_OUT> --k 0 --maxDepth <DEPTH>

	•	--in — starting token (address or symbol)
	•	--out — target token (address or symbol)
	•	--k 0 — search all possible paths (no limit)
	•	--maxDepth — maximum number of hops to explore

⸻

Example

Command:

npx ts-node pathfinder.ts \
  --in 0x4c9EDD5852cd905f086C759E8383e09bff1E68B3 \
  --out 0xA0b86991c6218b36c1d19d4a2e9Eb0cE3606eB48 \
  --k 0 --maxDepth 6

Output:

Adapters to Whitelist (union over all valid routes)
	1.	CurveV1 StableNg
	•	Pools:
	1.	Parameters:
	•	basePool: 0x0000000000000000000000000000000000000000
	•	lpToken: 0x00836Fe54625BE242BcFA286207795405ca4fD10
	•	targetAddress: 0x00836Fe54625BE242BcFA286207795405ca4fD10
	2.	Parameters:
	•	basePool: 0x0000000000000000000000000000000000000000
	•	lpToken: 0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72
	•	targetAddress: 0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72
	3.	Parameters:
	•	basePool: 0x0000000000000000000000000000000000000000
	•	lpToken: 0x3cef1afc0e8324b57293a6e7ce663781bbefbb79
	•	targetAddress: 0x3cef1afc0e8324b57293a6e7ce663781bbefbb79
	2.	ERC4626
	•	Pools:
	1.	Parameters:
	•	vault: 0x9D39A5DE30e57443BfF2A8307A4256c8797A3497
	3.	FluidDex
	•	Pools:
	1.	Parameters:
	•	targetAddress: 0x1DD125C32e4B5086c63CC13B3cA02C4A2a61Fa9b
	2.	Parameters:
	•	targetAddress: 0x667701e51B4D1Ca244F17C78F7aB8744B4C99F9B
	3.	Parameters:
	•	targetAddress: 0x862FC0A67623a4E6f0776103340836c91728B06D
	4.	Parameters:
	•	targetAddress: 0xDd5F2AFab5Ae5484339F9aD40FB4d51Fc5c96be3
	5.	Parameters:
	•	targetAddress: 0xdE632C3a214D5f14C1d8ddF0b92F8BCd188fee45
	6.	Parameters:
	•	targetAddress: 0xea734B615888c669667038D11950f44b177F15C0
	7.	Parameters:
	•	targetAddress: 0xf063BD202E45d6b2843102cb4EcE339026645D4a
	4.	UniswapV3
	•	Arguments:
	•	router: 0xE592427A0AEce92De3Edee1F18E0157C05861564
	•	Pools:
	1.	Parameters:
	•	fee: 0.01
	•	token0: 0x4c9edd5852cd905f086c759e8383e09bff1e68b3
	•	token1: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
	2.	Parameters:
	•	fee: 0.01
	•	token0: 0x4c9edd5852cd905f086c759e8383e09bff1e68b3
	•	token1: 0xdac17f958d2ee523a2206206994597c13d831ec7
	3.	Parameters:
	•	fee: 0.01
	•	token0: 0xdac17f958d2ee523a2206206994597c13d831ec7
	•	token1: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48

Tokens to add as collaterals (9):
	•	0x00836Fe54625BE242BcFA286207795405ca4fD10
	•	0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72
	•	0x3CEf1AFC0E8324b57293a6E7cE663781bbEFBB79
	•	0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f
	•	0x4c9EDD5852cd905f086C759E8383e09bff1E68B3
	•	0x9D39A5DE30e57443BfF2A8307A4256c8797A3497
	•	0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eb48
	•	0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD
	•	0xdAC17F958D2ee523a2206206994597C13D831ec7
