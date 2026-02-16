import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants, merchantLedgers } from "../db/schema/merchants.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ngnDepositAccountNumbers } from "../db/schema/ngnAccounts.js";
import { cryptoDepositAddresses } from "../db/schema/cryptoInfra.js";
import { ErrorClass } from "../utils/errorClass/index.js";

async function enrichWallets(walletRows, keyField) {
  if (walletRows.length === 0) return walletRows;

  const enriched = await Promise.all(
    walletRows.map(async (wallet) => {
      const walletKey = wallet[keyField];
      const [ngnAccounts, cryptoAddresses] = await Promise.all([
        db
          .select()
          .from(ngnDepositAccountNumbers)
          .where(eq(ngnDepositAccountNumbers.wallet_key, walletKey))
          .orderBy(desc(ngnDepositAccountNumbers.date_created)),
        db
          .select()
          .from(cryptoDepositAddresses)
          .where(eq(cryptoDepositAddresses.wallet_key, walletKey))
          .orderBy(desc(cryptoDepositAddresses.date_created)),
      ]);

      return {
        ...wallet,
        ngn_deposit_accounts: ngnAccounts.map((acc) => ({
          bank_name: acc.bank_name,
          bank_code: acc.bank_code,
          bank_slug: acc.bank_slug,
          account_name: acc.account_name,
          account_number: acc.account_number,
          type: acc.type,
          service: acc.service,
          is_pnd: acc.is_pnd,
          is_pnc: acc.is_pnc,
          is_deactivated: acc.is_deactivated,
          vendor: acc.vendor,
          reference: acc.reference,
          date_created: acc.date_created,
        })),
        crypto_deposit_addresses: cryptoAddresses.map((addr) => ({
          asset: addr.asset,
          network: addr.network,
          address_name: addr.address_name,
          address: addr.address,
          type: addr.type,
          service: addr.service,
          vendor: addr.vendor,
          vendor_wallet_id: addr.vendor_wallet_id,
          reference: addr.reference,
          date_created: addr.date_created,
        })),
      };
    })
  );

  return enriched;
}

export default class WalletService {
  async getMerchantWallets(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(merchantLedgers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(merchantLedgers)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(merchantLedgers.date_created)),
      db.select({ total: count() }).from(merchantLedgers).where(where),
    ]);

    const enrichedRows = await enrichWallets(rows, "wallet_key");
    return { count: Number(total), rows: enrichedRows };
  }

  async getMerchantWallet(accountKey, walletKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const [wallet] = await db
      .select()
      .from(merchantLedgers)
      .where(
        and(
          eq(merchantLedgers.account_key, accountKey),
          eq(merchantLedgers.wallet_key, walletKey)
        )
      )
      .limit(1);

    if (!wallet) {
      throw new ErrorClass("Wallet not found", 404);
    }

    const [enriched] = await enrichWallets([wallet], "wallet_key");
    return enriched;
  }

  async getEnrichedCustomerWallets(identifier, { limit, offset }) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const where = eq(customerWallets.identifier, identifier);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(customerWallets)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(customerWallets.date_created)),
      db.select({ total: count() }).from(customerWallets).where(where),
    ]);

    const enrichedRows = await enrichWallets(rows, "wallet_key");
    return { count: Number(total), rows: enrichedRows };
  }

  async getCustomerWalletDetail(identifier, walletKey) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const [wallet] = await db
      .select()
      .from(customerWallets)
      .where(
        and(
          eq(customerWallets.identifier, identifier),
          eq(customerWallets.wallet_key, walletKey)
        )
      )
      .limit(1);

    if (!wallet) {
      throw new ErrorClass("Wallet not found", 404);
    }

    const [enriched] = await enrichWallets([wallet], "wallet_key");
    return enriched;
  }
}
