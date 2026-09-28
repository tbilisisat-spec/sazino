/**
 * سرویس TON برای سازینو — ارسال SAZ (Jetton) از خزانه و رصد واریزها.
 * npm i @ton/ton @ton/core @ton/crypto
 *
 * ENV:
 *   TON_NETWORK=testnet|mainnet
 *   TONCENTER_API_KEY=...            (از @tonapibot بگیر؛ بدون آن محدودیت نرخ دارد)
 *   TREASURY_MNEMONIC="word1 word2 ... word24"   ← ۲۴ کلمهٔ کیف پول ادمین (kQBqLZ…)  ⚠️ فقط روی سرور
 *   SAZ_MINTER=kQAvhLJ-mx4uTxTkDwBA_Q_HZsv_DZ2r3upggsxuLgjdfOtJ
 *   SAZ_DECIMALS=9
 */
import { TonClient, WalletContractV4, internal, JettonMaster, Address, beginCell, toNano, fromNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

const NETWORK = process.env.TON_NETWORK === "mainnet" ? "mainnet" : "testnet";
const ENDPOINT = NETWORK === "mainnet" ? "https://toncenter.com/api/v2/jsonRPC" : "https://testnet.toncenter.com/api/v2/jsonRPC";
const DECIMALS = Number(process.env.SAZ_DECIMALS || 9);
const MINTER = process.env.SAZ_MINTER || "kQAvhLJ-mx4uTxTkDwBA_Q_HZsv_DZ2r3upggsxuLgjdfOtJ";

export const client = new TonClient({ endpoint: ENDPOINT, apiKey: process.env.TONCENTER_API_KEY });

let treasury = null; // { wallet, keyPair, address, jettonWallet }

export async function initTreasury() {
  const mn = (process.env.TREASURY_MNEMONIC || "").trim().split(/\s+/);
  if (mn.length < 12) {
    console.warn("[ton] TREASURY_MNEMONIC تنظیم نشده — برداشت‌ها فقط pending ثبت می‌شوند");
    return null;
  }
  const keyPair = await mnemonicToPrivateKey(mn);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const master = client.open(JettonMaster.create(Address.parse(MINTER)));
  const jettonWallet = await master.getWalletAddress(wallet.address);
  treasury = { wallet, keyPair, address: wallet.address, jettonWallet };
  console.log(`[ton] خزانه: ${wallet.address.toString({ testOnly: NETWORK === "testnet" })}  jetton wallet: ${jettonWallet.toString({ testOnly: NETWORK === "testnet" })}`);
  return treasury;
}

export const treasuryReady = () => !!treasury;
export const treasuryAddress = () => treasury?.address.toString({ testOnly: NETWORK === "testnet", bounceable: false }) || null;

const toUnits = (amount) => BigInt(Math.round(amount)) * 10n ** BigInt(DECIMALS);
const fromUnits = (units) => Number(BigInt(units) / 10n ** BigInt(DECIMALS));

/** ارسال `amount` SAZ به آدرس کاربر. برمی‌گرداند seqno به‌عنوان شناسهٔ پیگیری. */
export async function sendSaz(toAddress, amount, comment = "Sazino payout") {
  if (!treasury) throw new Error("treasury not configured");
  const to = Address.parse(toAddress);
  const contract = client.open(treasury.wallet);
  const seqno = await contract.getSeqno();

  // TEP-74 jetton transfer body
  const body = beginCell()
    .storeUint(0x0f8a7ea5, 32) // op: transfer
    .storeUint(BigInt(Date.now()), 64) // query_id
    .storeCoins(toUnits(amount)) // jetton amount
    .storeAddress(to) // destination (owner)
    .storeAddress(treasury.address) // response_destination (excess back to us)
    .storeBit(0) // no custom payload
    .storeCoins(toNano("0.01")) // forward_ton_amount (so the user sees a notification)
    .storeBit(1)
    .storeRef(beginCell().storeUint(0, 32).storeStringTail(comment).endCell()) // forward payload: comment
    .endCell();

  await contract.sendTransfer({
    seqno,
    secretKey: treasury.keyPair.secretKey,
    messages: [internal({ to: treasury.jettonWallet, value: toNano("0.06"), bounce: true, body })],
  });

  // wait until seqno advances (≈ tx accepted)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    if ((await contract.getSeqno()) > seqno) break;
  }
  return `seq${seqno}`;
}

/** موجودی TON خزانه (برای گس) */
export async function treasuryTonBalance() {
  if (!treasury) return 0;
  return Number(fromNano(await client.getBalance(treasury.address)));
}

/**
 * رصد واریز: تراکنش‌های اخیرِ jetton wallet خزانه را می‌خواند و انتقال‌های ورودی
 * (op 0x7362d09c = transfer_notification) با کامنت `tg:<id>` را برمی‌گرداند.
 * هر کدام: { txHash, uid, amount }
 */
export async function scanDeposits(limit = 50) {
  if (!treasury) return [];
  const txs = await client.getTransactions(treasury.jettonWallet, { limit });
  const out = [];
  for (const tx of txs) {
    const msg = tx.inMessage;
    if (!msg || msg.info.type !== "internal") continue;
    try {
      const s = msg.body.beginParse();
      if (s.remainingBits < 32) continue;
      const op = s.loadUint(32);
      if (op !== 0x7362d09c) continue; // transfer_notification
      s.loadUint(64); // query_id
      const amount = s.loadCoins();
      s.loadAddress(); // sender
      // forward payload: either inline or ref
      let fp = s;
      if (s.loadBit()) fp = s.loadRef().beginParse();
      if (fp.remainingBits < 32) continue;
      if (fp.loadUint(32) !== 0) continue; // text comment op = 0
      const comment = fp.loadStringTail().trim();
      const m = comment.match(/^tg:\d+$/);
      if (!m) continue;
      out.push({ txHash: tx.hash().toString("hex"), uid: comment, amount: fromUnits(amount) });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
