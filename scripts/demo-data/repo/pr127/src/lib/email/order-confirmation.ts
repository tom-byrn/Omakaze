import { formatMoney } from "@/lib/cart";
import { sendMail } from "@/lib/mail";

export type ConfirmationOrder = {
  id: string;
  email: string;
  lines: { name: string; quantity: number; unitCents: number }[];
  totalCents: number;
  currency: string;
};

export function confirmationText(order: ConfirmationOrder): string {
  const rows = order.lines.map((l) => "  " + l.quantity + " × " + l.name + "  " + formatMoney(l.unitCents * l.quantity, order.currency));
  return [
    "Thanks for your order.",
    "",
    "Order " + order.id,
    ...rows,
    "",
    "Total: " + formatMoney(order.totalCents, order.currency),
    "",
    "We'll email you again when it ships.",
  ].join("\n");
}

export async function sendOrderConfirmation(order: ConfirmationOrder): Promise<void> {
  await sendMail({
    to: order.email,
    subject: "Your Acme order " + order.id,
    text: confirmationText(order),
  });
}
