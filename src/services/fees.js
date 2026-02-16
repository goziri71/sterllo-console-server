import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants } from "../db/schema/merchants.js";
import {
  customBaaSDepositFees,
  customBaaSPayoutFees,
  customBaaSSwapFees,
  customBaaSTransferFees,
  customBaaSWithdrawalFees,
  customOverdraftProcessingFees,
  customWalletMaintenanceFees,
} from "../db/schema/customBaasFees.js";
import {
  customSaaSDepositFees,
  customSaaSPayoutFees,
  customSaaSSwapFees,
  customSaaSTransferFees,
  customSaaSWithdrawalFees,
} from "../db/schema/customSaasFees.js";
import {
  defaultBaaSDepositFees,
  defaultBaaSPayoutFees,
  defaultBaaSSwapFees,
  defaultBaaSTransferFees,
  defaultBaaSWithdrawalFees,
  defaultOverdraftProcessingFees,
  defaultWalletMaintenanceFees,
} from "../db/schema/defaultFees.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class FeeService {
  async getMerchantFees(accountKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const [
      deposit,
      payout,
      swap,
      transfer,
      withdrawal,
      overdraft,
      walletMaintenance,
    ] = await Promise.all([
      db.select().from(customBaaSDepositFees).where(eq(customBaaSDepositFees.account_key, accountKey)),
      db.select().from(customBaaSPayoutFees).where(eq(customBaaSPayoutFees.account_key, accountKey)),
      db.select().from(customBaaSSwapFees).where(eq(customBaaSSwapFees.account_key, accountKey)),
      db.select().from(customBaaSTransferFees).where(eq(customBaaSTransferFees.account_key, accountKey)),
      db.select().from(customBaaSWithdrawalFees).where(eq(customBaaSWithdrawalFees.account_key, accountKey)),
      db.select().from(customOverdraftProcessingFees).where(eq(customOverdraftProcessingFees.account_key, accountKey)),
      db.select().from(customWalletMaintenanceFees).where(eq(customWalletMaintenanceFees.account_key, accountKey)),
    ]);

    return {
      deposit,
      payout,
      swap,
      transfer,
      withdrawal,
      overdraft_processing: overdraft,
      wallet_maintenance: walletMaintenance,
    };
  }

  async getCustomerFees(accountKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const [deposit, payout, swap, transfer, withdrawal] = await Promise.all([
      db.select().from(customSaaSDepositFees).where(eq(customSaaSDepositFees.account_key, accountKey)),
      db.select().from(customSaaSPayoutFees).where(eq(customSaaSPayoutFees.account_key, accountKey)),
      db.select().from(customSaaSSwapFees).where(eq(customSaaSSwapFees.account_key, accountKey)),
      db.select().from(customSaaSTransferFees).where(eq(customSaaSTransferFees.account_key, accountKey)),
      db.select().from(customSaaSWithdrawalFees).where(eq(customSaaSWithdrawalFees.account_key, accountKey)),
    ]);

    return {
      deposit,
      payout,
      swap,
      transfer,
      withdrawal,
    };
  }

  async getDefaultFees() {
    const [deposit, payout, swap, transfer, withdrawal, overdraft, walletMaintenance] =
      await Promise.all([
        db.select().from(defaultBaaSDepositFees),
        db.select().from(defaultBaaSPayoutFees),
        db.select().from(defaultBaaSSwapFees),
        db.select().from(defaultBaaSTransferFees),
        db.select().from(defaultBaaSWithdrawalFees),
        db.select().from(defaultOverdraftProcessingFees),
        db.select().from(defaultWalletMaintenanceFees),
      ]);

    return {
      deposit,
      payout,
      swap,
      transfer,
      withdrawal,
      overdraft_processing: overdraft,
      wallet_maintenance: walletMaintenance,
    };
  }

  async getMerchantFeesWithDefaults(accountKey) {
    const [customFees, defaults] = await Promise.all([
      this.getMerchantFees(accountKey),
      this.getDefaultFees(),
    ]);

    return {
      custom: customFees,
      defaults,
    };
  }
}
