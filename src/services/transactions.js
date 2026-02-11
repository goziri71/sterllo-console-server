import { Op } from "sequelize";
import Deposit from "../models/deposits/deposit.js";
import Withdrawal from "../models/withdrawals/withdrawal.js";
import Transfer from "../models/transfers/transfer.js";
import Swap from "../models/swaps/swap.js";
import NGNDeposit from "../models/ngnDeposits/ngnDeposit.js";
import NGNPayout from "../models/ngnPayouts/ngnPayout.js";
import CryptoDeposit from "../models/cryptoDeposits/cryptoDeposit.js";
import CryptoPayout from "../models/cryptoPayouts/cryptoPayout.js";

/**
 * Build a where clause from common transaction filters.
 * Different tables have different columns, so we check which filters apply.
 */
function buildWhere(filters, hasAccountKey = true) {
  const where = {};

  if (hasAccountKey && filters.account_key) {
    where.account_key = filters.account_key;
  }
  if (filters.wallet_key) {
    where.source_wallet_key = filters.wallet_key;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.from_date && filters.to_date) {
    where.date_created = {
      [Op.between]: [new Date(filters.from_date), new Date(filters.to_date)],
    };
  } else if (filters.from_date) {
    where.date_created = { [Op.gte]: new Date(filters.from_date) };
  } else if (filters.to_date) {
    where.date_created = { [Op.lte]: new Date(filters.to_date) };
  }

  return where;
}

export default class TransactionService {
  async getDeposits({ limit, offset, filters }) {
    return Deposit.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getWithdrawals({ limit, offset, filters }) {
    return Withdrawal.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getTransfers({ limit, offset, filters }) {
    return Transfer.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getSwaps({ limit, offset, filters }) {
    return Swap.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getNGNDeposits({ limit, offset, filters }) {
    const where = {};
    if (filters.wallet_key) where.wallet_key = filters.wallet_key;
    if (filters.status) where.credit_status = filters.status;
    if (filters.from_date && filters.to_date) {
      where.date_created = {
        [Op.between]: [new Date(filters.from_date), new Date(filters.to_date)],
      };
    } else if (filters.from_date) {
      where.date_created = { [Op.gte]: new Date(filters.from_date) };
    } else if (filters.to_date) {
      where.date_created = { [Op.lte]: new Date(filters.to_date) };
    }

    return NGNDeposit.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getNGNPayouts({ limit, offset, filters }) {
    return NGNPayout.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getCryptoDeposits({ limit, offset, filters }) {
    const where = {};
    if (filters.wallet_key) where.wallet_key = filters.wallet_key;
    if (filters.status) where.credit_status = filters.status;
    if (filters.from_date && filters.to_date) {
      where.date_created = {
        [Op.between]: [new Date(filters.from_date), new Date(filters.to_date)],
      };
    } else if (filters.from_date) {
      where.date_created = { [Op.gte]: new Date(filters.from_date) };
    } else if (filters.to_date) {
      where.date_created = { [Op.lte]: new Date(filters.to_date) };
    }

    return CryptoDeposit.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getCryptoPayouts({ limit, offset, filters }) {
    return CryptoPayout.findAndCountAll({
      where: buildWhere(filters),
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }
}
