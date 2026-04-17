import bs58 from "bs58";

async function main() {
  const kp: any = await (crypto as any).subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  const pub = new Uint8Array(
    await crypto.subtle.exportKey("raw", kp.publicKey)
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", kp.privateKey)
  );
  const seed = pkcs8.slice(-32);
  const full = new Uint8Array(64);
  full.set(seed, 0);
  full.set(pub, 32);
  console.log("WALLET_SECRET_KEY=" + bs58.encode(full));
  console.log("WALLET_ADDRESS=" + bs58.encode(pub));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
