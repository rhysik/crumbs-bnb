# Crumbs

Crumbs is a 2D mouse arcade game with optional BNB-paid draws. Practice is free. The arcade score, cosmetic characters, verified leaderboard records and paid draw are separate systems.

The implementation has been exercised on public BNB Testnet. The following contracts were deployed on BNB Chain mainnet on 1 November 2026 and checked against the compiled source:

- Records: [`0x9C215A50EE8f71A18589b5C827BcA38866Cc48a2`](https://bscscan.com/address/0x9C215A50EE8f71A18589b5C827BcA38866Cc48a2).
- Paid game: [`0xBf063Fe035F76A9bE55f1BB0C499418a8ba9ea20`](https://bscscan.com/address/0xBf063Fe035F76A9bE55f1BB0C499418a8ba9ea20).

The prize bank must be funded separately before paid entries can be accepted. The mainnet payment lifecycle has not yet been exercised with real funds. Read the active deployment configuration and verify its chain before sending funds. The contracts are unaudited.

Website: https://playcrumbs.xyz/. X: https://x.com/playcrumbs_bnb.

## Rules

A run lasts up to 45 seconds. Collect all 36 gold crumbs; the last one ends the run immediately. Hits remove half of the carried crumbs; three catches end a run. Guards pursue visible players, navigate around crates and search the last observed position after losing sight. A third guard joins after fifteen seconds. Five arenas each have a different floor and obstacle layout. Free practice rotates through all five before repeating. Green pickups grant a five-second speed boost, and guard chase speed stays below normal mouse speed. Collectible placement varies with the run seed. Random maps do not prove that a human played.

Paid draws use native-paid Chainlink VRF v2.5 on BNB Chain. The immutable payout ranges are:

| Probability | Gross return of the entry |
| ----------- | ------------------------- |
| 60%         | 80.123% to 95.877%        |
| 35%         | 103.123% to 107.877%      |
| 4.5%        | 110.123% to 119.877%      |
| 0.5%        | 175.123% to 224.877%      |

Theoretical RTP is 95.9%. Gross returns include the original entry. Players pay their own transaction gas. The project bank pays the oracle fee, capped at 2% of the entry. The chance of a gross return above the entry is 40%; this does not guarantee a net profit after gas.

The contract reserves the maximum return and oracle budget before accepting an entry. It rejects entries when insufficiently funded. The owner can pause new entries and withdraw only unreserved bank funds. Owner actions cannot alter the entry price, payout rules, VRF wrapper or existing player credits. Settlement and claims remain available when entries are paused.

If no randomness request was submitted within 24 hours, the player can recover the entry. Once requested, randomness cannot be cancelled or rerolled. An external oracle outage can delay a return; reserved funds are not released to the owner while the request is pending.

## Code

- `shared/simulation.mjs`: deterministic game state and input replay.
- `src/game.ts`: Phaser rendering and input integration.
- `src/main.ts`, `src/money.ts`: lobby, game, docs, payment and recovery UI.
- `contracts/CrumbsRecords.sol`: EIP-712 attested score records. The score-signing service is a trust assumption; this does not control paid returns.
- `contracts/CrumbsGame.sol`: reserved native-BNB entries, VRF draws, settlement and pull-based claims.
- `worker/index.mjs`: replay verification, score attestation and confirmed leaderboard indexing.
- `worker/schema.sql`: project-local D1 schema.
- `motion/`: launch film and social artwork source.

## Development

Use Node.js 24 and npm. Contract and simulation tests are local and do not require a wallet.

```sh
npm ci
npm test
npm run test:game
npm run build
```

The complete game needs its own Cloudflare Worker, D1 database and deployment configuration. A bare Vite preview does not provide `/api` routes. Create the hosting configuration with `node deploy/bootstrap-hosting.mjs` after signing into Wrangler, then configure a test-only wallet locally and run the deployment helpers. They generate local configuration under `deployments/`, which is excluded from version control.

Test wallet and deployment helpers use Windows DPAPI for local protected storage. `CRUMBS_TEST_KEY` can instead be supplied to a test process locally; it is consumed in memory and must never be committed. Never pass a mainnet key to test scripts. Public lifecycle checks spend test tBNB and require an isolated test account.

`node deploy/testnet.mjs` deploys score records. `node deploy/game-testnet.mjs` deploys the paid game and funds its test bank. `node deploy/publish.mjs` builds and publishes the configured test deployment. These commands require funds and authenticated project infrastructure. They are not unit tests.

## Mainnet

The Windows launcher runs preflight checks before requesting a masked local key. It requires an exact `DEPLOY` confirmation. Signed transaction hashes and nonces are recorded before broadcast; preserve those records when resuming. Site publication can be retried separately and never requires redeploying an already confirmed contract.

Deployment does not fund the prize bank. The owner funds it separately through `/bank/`. Paid entries stay unavailable until fully backed. The prepared mainnet entry is 0.0028 BNB, a fixed native amount rather than a fixed dollar price. Changing it requires a different deployment and updated tests.

Do not publish a mainnet claim until the deployment, live configuration and published pages have been independently checked. Public availability of chance-based paid play requires the operator to establish applicable legal requirements and access controls for its launch markets. An age checkbox alone does not establish regulatory compliance.

## Secrets and assets

Do not commit `.secrets`, authentication state, generated deployment progress, personal data or developer machine paths. Score-authority keys are separate from deployer keys. The Worker receives only the score authority needed for attestations; paid returns depend on VRF rather than that authority.

Font licenses are included in `public/fonts/`. See dependency packages for their respective licenses. No separate project token is required for practice, entry, scoring or a BNB return. A community token does not grant payout rights.

## Dependency review

The production dependency audit reported no known advisories on 1 November 2026. The development toolchain retains an upstream Zod 3 collection-validation advisory through Hardhat. No compatible patched Zod 3 release was available during review; forcing Zod 4 into that dependency would change its API. Remotion's Zod 4 dependency is overridden to patched 4.6.7 and rendering was verified, although its CLI reports an expected-version warning. These checks are an internal engineering review, not an independent security audit.
