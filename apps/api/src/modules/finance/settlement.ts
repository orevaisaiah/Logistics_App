import type { DeliveryStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import {
  getBusinessWallet,
  getRiderWallet,
  getSystemWallet,
  lockDelivery,
  postAll,
  type Tx,
} from "./ledger.js";

type Logger = { error: (obj: unknown, msg?: string) => void };

// How a delivery's money moves:
//   creating it      business wallet  -->  ESCROW
//   delivered        ESCROW  -->  rider wallet (payout) + PLATFORM wallet (commission)
//   cancelled        ESCROW  -->  business wallet (full refund)
// Every step is posted under a fixed reference, so repeating it can never pay twice.

// Runs inside the transaction that creates the delivery: if the wallet cannot cover
// the price, the whole creation is undone
export async function chargeDelivery(
  tx: Tx,
  input: { deliveryId: string; businessId: string; amount: number },
) {
  const { deliveryId, businessId } = input;
  const amount = BigInt(input.amount);

  const business = await tx.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { creditLimit: true },
  });
  const wallet = await getBusinessWallet(tx, businessId);
  const escrow = await getSystemWallet(tx, "ESCROW");

  await postAll(tx, [
    {
      walletId: wallet.id,
      type: "DELIVERY_CHARGE",
      direction: "DEBIT",
      amount,
      reference: `delivery:${deliveryId}:charge:business`,
      deliveryId,
      overdraftLimit: BigInt(business.creditLimit),
    },
    {
      walletId: escrow.id,
      type: "ESCROW_HOLD",
      direction: "CREDIT",
      amount,
      reference: `delivery:${deliveryId}:charge:escrow`,
      deliveryId,
    },
  ]);
  await tx.delivery.update({
    where: { id: deliveryId },
    data: { chargedAt: new Date() },
  });
}

// Returns false when there was nothing to do (not charged, or already refunded or paid out)
export async function refundDelivery(
  deliveryId: string,
  opts: { allowedStatuses?: DeliveryStatus[] } = {},
): Promise<boolean> {
  const allowed = opts.allowedStatuses ?? ["CANCELLED"];

  return prisma.$transaction(async (tx) => {
    await lockDelivery(tx, deliveryId);
    const d = await tx.delivery.findUnique({ where: { id: deliveryId } });
    if (!d) throw new AppError(404, "NOT_FOUND", "Delivery not found");
    if (!d.chargedAt || d.refundedAt || d.settledAt) return false;
    if (!allowed.includes(d.status))
      throw new AppError(
        409,
        "INVALID_STATE",
        `A ${d.status} delivery cannot be refunded`,
      );

    const amount = BigInt(d.price);
    const wallet = await getBusinessWallet(tx, d.businessId);
    const escrow = await getSystemWallet(tx, "ESCROW");

    await postAll(tx, [
      {
        walletId: escrow.id,
        type: "ESCROW_RELEASE",
        direction: "DEBIT",
        amount,
        reference: `delivery:${d.id}:refund:escrow`,
        deliveryId: d.id,
      },
      {
        walletId: wallet.id,
        type: "REFUND",
        direction: "CREDIT",
        amount,
        reference: `delivery:${d.id}:refund:business`,
        deliveryId: d.id,
      },
    ]);
    await tx.delivery.update({
      where: { id: d.id },
      data: { refundedAt: new Date() },
    });
    return true;
  });
}

// Pays the rider and records the platform's commission. Returns false when there was nothing to do.
export async function settleDelivery(
  deliveryId: string,
  opts: { allowFailed?: boolean } = {},
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockDelivery(tx, deliveryId);
    const d = await tx.delivery.findUnique({ where: { id: deliveryId } });
    if (!d) throw new AppError(404, "NOT_FOUND", "Delivery not found");
    if (!d.chargedAt || d.settledAt || d.refundedAt) return false;

    const statusOk =
      d.status === "DELIVERED" ||
      (opts.allowFailed === true && d.status === "FAILED");
    if (!statusOk)
      throw new AppError(
        409,
        "INVALID_STATE",
        `A ${d.status} delivery cannot be settled`,
      );
    if (!d.riderId)
      throw new AppError(409, "NO_RIDER", "This delivery has no rider to pay");
    if (d.commissionAmount + d.riderPayoutAmount !== d.price) {
      throw new AppError(
        500,
        "INTEGRITY_ERROR",
        "The price split does not add up",
      );
    }

    const riderWallet = await getRiderWallet(tx, d.riderId);
    const platform = await getSystemWallet(tx, "PLATFORM");
    const escrow = await getSystemWallet(tx, "ESCROW");

    await postAll(tx, [
      {
        walletId: escrow.id,
        type: "ESCROW_RELEASE",
        direction: "DEBIT",
        amount: BigInt(d.price),
        reference: `delivery:${d.id}:settle:escrow`,
        deliveryId: d.id,
      },
      {
        walletId: riderWallet.id,
        type: "RIDER_EARNING",
        direction: "CREDIT",
        amount: BigInt(d.riderPayoutAmount),
        reference: `delivery:${d.id}:settle:rider`,
        deliveryId: d.id,
      },
      {
        walletId: platform.id,
        type: "COMMISSION",
        direction: "CREDIT",
        amount: BigInt(d.commissionAmount),
        reference: `delivery:${d.id}:settle:platform`,
        deliveryId: d.id,
      },
    ]);
    await tx.delivery.update({
      where: { id: d.id },
      data: { settledAt: new Date() },
    });
    return true;
  });
}

let running = false;

// Safety net run by the background worker. If the request that should have paid a rider or
// refunded a business failed halfway, this finishes the job within seconds.
export async function runFinanceCycle(log: Logger) {
  if (running) return;
  running = true;
  try {
    const toSettle = await prisma.delivery.findMany({
      where: {
        status: "DELIVERED",
        chargedAt: { not: null },
        settledAt: null,
        refundedAt: null,
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of toSettle) {
      await settleDelivery(id).catch((err) =>
        log.error(err, `settlement failed for delivery ${id}`),
      );
    }

    const toRefund = await prisma.delivery.findMany({
      where: {
        status: "CANCELLED",
        chargedAt: { not: null },
        refundedAt: null,
        settledAt: null,
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of toRefund) {
      await refundDelivery(id).catch((err) =>
        log.error(err, `refund failed for delivery ${id}`),
      );
    }
  } catch (err) {
    log.error(err, "finance cycle failed");
  } finally {
    running = false;
  }
}
